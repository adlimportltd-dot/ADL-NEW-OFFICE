-- ============================================================
-- migration_v6_repack_weekly_count.sql
-- 1) מזיגה ופירוק מהטלפון – כולם רושמים; הפרש מעל 10% של נתי ממתין לאישור מנהל
-- 2) ספירה שבועית עיוורת – הסופר לא רואה מה רשום, מנהל אחר מאשר
-- להריץ פעם אחת ב-Supabase SQL Editor (פרויקט אדל בלבד).
-- לא משנה טבלאות קיימות – רק מוסיף 3 טבלאות חדשות (repack_log, stock_counts,
-- stock_count_lines) ופונקציות.
-- ============================================================

-- ---------- עזר: משקל אריזה בק"ג ושם הריח ----------
create or replace function public.adl_pack_kg(p_unit text)
returns numeric language sql immutable as $$
  select case p_unit
    when '25 ק"ג' then 25 when '5 ק"ג' then 5 when '1 ק"ג' then 1
    when 'חצי ק"ג' then 0.5 when 'רבע ק"ג' then 0.25 else null end::numeric;
$$;

create or replace function public.adl_scent(p_name text)
returns text language sql immutable as $$
  select (regexp_match(p_name, '^תמצית ריח - (.+) \(.+\)$'))[1];
$$;

-- ============================================================
-- 1) מזיגה ופירוק
--    כל משתמש מכירה (ליאור / אלירן / נתי) רושם מזיגה.
--    הפרש עד 10% – נשמר מיד והמלאי מתעדכן.
--    הפרש מעל 10% – חובה סיבה. אצל מנהל נשמר מיד; אצל נתי ממתין לאישור
--    של ליאור או אלירן, והמלאי לא משתנה עד האישור.
-- ============================================================
create table if not exists public.repack_log (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  scent text not null,
  location_id uuid not null references locations(id),
  consumed jsonb not null,          -- [{"item_id","qty","unit"}]
  produced jsonb not null,
  in_kg numeric not null,
  out_kg numeric not null,
  reason text,
  note text,
  status text not null check (status in ('done', 'pending', 'approved', 'rejected')),
  created_by uuid not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);
create index if not exists repack_log_created_idx on public.repack_log (created_at desc);

alter table public.repack_log enable row level security;
drop policy if exists "sellers read repack_log" on public.repack_log;
create policy "sellers read repack_log" on public.repack_log for select using (is_seller());

-- בדיקה משותפת: מחזירה את הריח, הק"ג, ושורות עם יחידה. זורקת שגיאה על כל דבר לא תקין.
create or replace function public._repack_check(p_consumed jsonb, p_produced jsonb, p_wh uuid,
  out o_scent text, out o_in_kg numeric, out o_out_kg numeric, out o_consumed jsonb, out o_produced jsonb)
language plpgsql security definer set search_path = public as $$
declare
  v_line jsonb; v_item record; v_qty numeric; v_stock numeric;
  v_barrel boolean := false; v_ids uuid[] := '{}';
begin
  o_in_kg := 0; o_out_kg := 0; o_consumed := '[]'; o_produced := '[]';
  if p_consumed is null or jsonb_array_length(p_consumed) = 0 then raise exception 'יש לבחור מה פותחים (חבית או גלון)'; end if;
  if p_produced is null or jsonb_array_length(p_produced) = 0 then raise exception 'יש לרשום מה יצא מהמזיגה'; end if;

  for v_line in select * from jsonb_array_elements(p_consumed) loop
    v_qty := nullif(v_line->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then raise exception 'כמות לא תקינה בפתיחה'; end if;
    select i.id, i.name, i.unit into v_item from items i where i.id = (v_line->>'item_id')::uuid;
    if not found then raise exception 'פריט לא נמצא'; end if;
    if v_item.unit not in ('25 ק"ג', '5 ק"ג') then raise exception 'אפשר לפתוח רק חבית 25 ק"ג או גלון 5 ק"ג'; end if;
    if o_scent is null then o_scent := adl_scent(v_item.name); end if;
    if adl_scent(v_item.name) is distinct from o_scent then raise exception 'כל המזיגה צריכה להיות מאותו ריח'; end if;
    select coalesce(s.quantity, 0) into v_stock from stock_levels s where s.item_id = v_item.id and s.location_id = p_wh;
    if coalesce(v_stock, 0) < v_qty then
      raise exception 'אין מספיק במלאי: % – במחסן % בלבד', v_item.name, trim_scale(coalesce(v_stock, 0));
    end if;
    if v_item.unit = '25 ק"ג' then v_barrel := true; end if;
    v_ids := v_ids || v_item.id;
    o_in_kg := o_in_kg + v_qty * adl_pack_kg(v_item.unit);
    o_consumed := o_consumed || jsonb_build_object('item_id', v_item.id, 'qty', v_qty, 'unit', v_item.unit);
  end loop;

  for v_line in select * from jsonb_array_elements(p_produced) loop
    v_qty := nullif(v_line->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then raise exception 'כמות לא תקינה במה שיצא'; end if;
    select i.id, i.name, i.unit into v_item from items i where i.id = (v_line->>'item_id')::uuid;
    if not found then raise exception 'פריט לא נמצא'; end if;
    if v_item.unit not in ('5 ק"ג', '1 ק"ג', 'חצי ק"ג', 'רבע ק"ג') then raise exception 'מזיגה יוצרת רק גלון 5 / 1 ק"ג / חצי / רבע'; end if;
    if v_item.unit = '5 ק"ג' and not v_barrel then raise exception 'גלון 5 ק"ג יוצא רק מפתיחת חבית'; end if;
    if adl_scent(v_item.name) is distinct from o_scent then raise exception 'כל המזיגה צריכה להיות מאותו ריח'; end if;
    o_out_kg := o_out_kg + v_qty * adl_pack_kg(v_item.unit);
    o_produced := o_produced || jsonb_build_object('item_id', v_item.id, 'qty', v_qty, 'unit', v_item.unit);
  end loop;
end $$;
revoke all on function public._repack_check(jsonb, jsonb, uuid) from public, authenticated;

-- רישום התנועות במלאי (הטריגר apply_transaction_to_stock מעדכן את stock_levels)
create or replace function public._repack_apply(p_log uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r repack_log%rowtype; v_note text;
begin
  select * into r from repack_log where id = p_log;
  v_note := r.tag || ' - ' || r.scent || ' (' || coalesce(r.created_by_name, '') || ')'
            || ' - נפתח ' || trim_scale(r.in_kg)::text || ' ק"ג, יצא ' || trim_scale(r.out_kg)::text || ' ק"ג'
            || coalesce(' - סיבה: ' || nullif(trim(r.reason), ''), '')
            || coalesce(' - ' || nullif(trim(r.note), ''), '')
            || case when r.decided_by_name is not null then ' - אושר ע"י ' || r.decided_by_name else '' end;
  insert into transactions (type, item_id, qty, from_location_id, note, performed_by)
  select 'repack', (l->>'item_id')::uuid, (l->>'qty')::numeric, r.location_id, v_note || ' - נצרך', r.created_by
  from jsonb_array_elements(r.consumed) l;
  insert into transactions (type, item_id, qty, to_location_id, note, performed_by)
  select 'repack', (l->>'item_id')::uuid, (l->>'qty')::numeric, r.location_id, v_note || ' - הופק', r.created_by
  from jsonb_array_elements(r.produced) l;
end $$;
revoke all on function public._repack_apply(uuid) from public, authenticated;

drop function if exists public.mobile_repack(jsonb, jsonb, text, text);
create or replace function public.mobile_repack(
  p_consumed jsonb,              -- [{"item_id": "...", "qty": 1}]   חבית 25 / גלון 5
  p_produced jsonb,              -- [{"item_id": "...", "qty": 10}]  גלון 5 / 1 / חצי / רבע
  p_reason text default null,    -- חובה כשההפרש מעל 10%
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_wh uuid; v_user text; c record; v_ratio numeric; v_out_of_range boolean;
  v_status text; v_id uuid; v_tag text;
begin
  if not is_seller() then raise exception 'אין הרשאה לרשום מזיגה'; end if;
  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  if v_wh is null then raise exception 'לא נמצא מחסן מרכזי'; end if;
  select coalesce(nullif(pr.full_name, ''), 'משתמש') into v_user from profiles pr where pr.id = auth.uid();

  select * into c from _repack_check(p_consumed, p_produced, v_wh);
  v_ratio := c.o_out_kg / c.o_in_kg;
  v_out_of_range := v_ratio > 1.10 or v_ratio < 0.90;
  if v_out_of_range and coalesce(trim(p_reason), '') = '' then
    raise exception 'נפתחו % ק"ג ויצאו % ק"ג (% %%). מעל 10%% הפרש – יש לכתוב סיבה',
      trim_scale(c.o_in_kg)::text, trim_scale(c.o_out_kg)::text,
      case when v_ratio > 1 then '+' else '' end || round((v_ratio - 1) * 100);
  end if;

  v_status := case when v_out_of_range and not is_admin() then 'pending' else 'done' end;
  v_tag := 'מזיגה #' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  insert into repack_log (tag, scent, location_id, consumed, produced, in_kg, out_kg, reason, note, status, created_by, created_by_name)
  values (v_tag, c.o_scent, v_wh, c.o_consumed, c.o_produced, c.o_in_kg, c.o_out_kg,
          nullif(trim(coalesce(p_reason, '')), ''), nullif(trim(coalesce(p_note, '')), ''), v_status, auth.uid(), v_user)
  returning id into v_id;

  if v_status = 'done' then perform _repack_apply(v_id); end if;

  return jsonb_build_object('id', v_id, 'tag', v_tag, 'scent', c.o_scent, 'in_kg', c.o_in_kg, 'out_kg', c.o_out_kg, 'status', v_status);
end $$;

-- אישור / דחייה של מזיגה חריגה – ליאור או אלירן
create or replace function public.decide_repack(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r repack_log%rowtype; v_name text; c record;
begin
  if not is_admin() then raise exception 'רק ליאור או אלירן מאשרים מזיגה'; end if;
  select * into r from repack_log where id = p_id for update;
  if not found then raise exception 'המזיגה לא נמצאה'; end if;
  if r.status <> 'pending' then raise exception 'המזיגה כבר טופלה'; end if;
  select coalesce(nullif(pr.full_name, ''), 'מנהל') into v_name from profiles pr where pr.id = auth.uid();

  if p_approve then
    -- בודקים שוב שיש מלאי לפתיחה – אולי משהו נמכר מאז
    select * into c from _repack_check(r.consumed, r.produced, r.location_id);
  elsif coalesce(trim(p_note), '') = '' then
    raise exception 'כתוב בקצרה למה המזיגה נדחתה';
  end if;

  update repack_log set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_by_name = v_name, decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = r.id;

  if p_approve then perform _repack_apply(r.id); end if;
  return jsonb_build_object('ok', true);
end $$;

-- מה מחכה לאישור (למסך הבית בטלפון)
create or replace function public.mobile_pending()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if not is_admin() then return jsonb_build_object('repacks', 0, 'counts', 0); end if;
  return jsonb_build_object(
    'repacks', (select count(*) from repack_log where status = 'pending'),
    'counts', (select count(*) from stock_counts where status = 'submitted'));
end $$;

revoke all on function public.mobile_repack(jsonb, jsonb, text, text) from public;
revoke all on function public.decide_repack(uuid, boolean, text) from public;
revoke all on function public.mobile_pending() from public;
grant execute on function public.mobile_repack(jsonb, jsonb, text, text) to authenticated;
grant execute on function public.decide_repack(uuid, boolean, text) to authenticated;
grant execute on function public.mobile_pending() to authenticated;

-- ============================================================
-- 2) ספירה שבועית עיוורת
-- ============================================================
create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'cancelled')),
  counted_by uuid not null,
  counted_by_name text,
  submitted_at timestamptz not null default now(),
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  note text
);

create table if not exists public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_counts(id) on delete cascade,
  item_id uuid not null references items(id),
  counted_qty numeric not null check (counted_qty >= 0),
  system_qty numeric not null,   -- מה היה רשום ברגע השליחה (הסופר לא רואה)
  unit_cost numeric,             -- עלות ליחידה ברגע השליחה, לחישוב הפער בש"ח
  unique (count_id, item_id)
);

-- קריאה ישירה – מנהל בלבד. כתיבה רק דרך הפונקציות למטה.
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
drop policy if exists "admin read stock_counts" on public.stock_counts;
create policy "admin read stock_counts" on public.stock_counts for select using (is_admin());
drop policy if exists "admin read stock_count_lines" on public.stock_count_lines;
create policy "admin read stock_count_lines" on public.stock_count_lines for select using (is_admin());

-- דף ספירה: רק שמות ריחות וגדלים – בלי כמויות. גלונים 5 ק"ג וחצאים.
create or replace function public.count_sheet()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pending jsonb; v_items jsonb;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  select jsonb_build_object('id', c.id, 'by', c.counted_by_name, 'at', c.submitted_at)
    into v_pending
  from stock_counts c where c.status = 'submitted' order by c.submitted_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'scent', adl_scent(i.name), 'unit', i.unit, 'aliases', i.aliases)
                            order by adl_scent(i.name), adl_pack_kg(i.unit) desc), '[]'::jsonb)
    into v_items
  from items i
  where i.category::text = 'consumable'
    and i.unit in ('5 ק"ג', 'חצי ק"ג')
    and adl_scent(i.name) is not null
    and i.name not like '%בדיקה%';

  return jsonb_build_object('pending', v_pending, 'items', v_items);
end $$;

-- שליחת ספירה: שומר מה נספר + צילום של מה שהיה רשום באותו רגע
create or replace function public.submit_stock_count(p_lines jsonb, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_wh uuid; v_id uuid; v_name text; v_expected int; v_got int;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if exists (select 1 from stock_counts where status = 'submitted') then
    raise exception 'יש כבר ספירה שממתינה לאישור – צריך לאשר או לבטל אותה קודם';
  end if;
  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  if v_wh is null then raise exception 'לא נמצא מחסן מרכזי'; end if;

  select count(*) into v_expected from items i
  where i.category::text = 'consumable' and i.unit in ('5 ק"ג', 'חצי ק"ג')
    and adl_scent(i.name) is not null and i.name not like '%בדיקה%';
  select count(distinct (l->>'item_id')) into v_got from jsonb_array_elements(p_lines) l
  where nullif(l->>'qty', '') is not null;
  if v_got < v_expected then raise exception 'לא כל השורות נספרו (% מתוך %)', v_got, v_expected; end if;

  select coalesce(nullif(pr.full_name, ''), 'משתמש') into v_name from profiles pr where pr.id = auth.uid();

  insert into stock_counts (location_id, counted_by, counted_by_name, note)
  values (v_wh, auth.uid(), v_name, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  insert into stock_count_lines (count_id, item_id, counted_qty, system_qty, unit_cost)
  select v_id, i.id, (l->>'qty')::numeric, coalesce(s.quantity, 0), i.unit_cost
  from jsonb_array_elements(p_lines) l
  join items i on i.id = (l->>'item_id')::uuid
  left join stock_levels s on s.item_id = i.id and s.location_id = v_wh
  where i.unit in ('5 ק"ג', 'חצי ק"ג');

  return v_id;
end $$;

-- אישור ספירה: מנהל בלבד, ולא מי שספר. מעדכן את המלאי לפי הפער שנמצא.
create or replace function public.approve_stock_count(p_count_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c stock_counts%rowtype; v_name text; v_tag text; v_n int := 0;
begin
  if not is_admin() then raise exception 'רק מנהל מאשר ספירה'; end if;
  select * into v_c from stock_counts where id = p_count_id for update;
  if not found then raise exception 'הספירה לא נמצאה'; end if;
  if v_c.status <> 'submitted' then raise exception 'הספירה כבר טופלה'; end if;
  if v_c.counted_by = auth.uid() then raise exception 'מי שספר לא יכול לאשר את הספירה של עצמו'; end if;
  select coalesce(nullif(pr.full_name, ''), 'מנהל') into v_name from profiles pr where pr.id = auth.uid();

  v_tag := 'ספירה שבועית ' || to_char(v_c.submitted_at at time zone 'Asia/Jerusalem', 'DD.MM.YYYY')
           || ' (ספר: ' || coalesce(v_c.counted_by_name, '') || ', אישר: ' || v_name || ')'
           || coalesce(' - ' || nullif(trim(p_note), ''), '');

  insert into transactions (type, item_id, qty, to_location_id, note, performed_by)
  select 'receive', l.item_id, l.counted_qty - l.system_qty, v_c.location_id, v_tag || ' - עודף', auth.uid()
  from stock_count_lines l where l.count_id = v_c.id and l.counted_qty > l.system_qty;
  get diagnostics v_n = row_count;

  insert into transactions (type, item_id, qty, from_location_id, note, performed_by)
  select 'writeoff', l.item_id, l.system_qty - l.counted_qty, v_c.location_id, v_tag || ' - חוסר', auth.uid()
  from stock_count_lines l where l.count_id = v_c.id and l.counted_qty < l.system_qty;

  update stock_counts set status = 'approved', approved_by = auth.uid(), approved_by_name = v_name,
         approved_at = now(), note = coalesce(note, '') || coalesce(' | ' || nullif(trim(p_note), ''), '')
  where id = v_c.id;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_stock_count(p_count_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'רק מנהל'; end if;
  update stock_counts set status = 'cancelled' where id = p_count_id and status = 'submitted';
  if not found then raise exception 'הספירה לא נמצאה או שכבר טופלה'; end if;
end $$;

-- דוח פערים למנהל: כל שורה עם פער + כל התנועות של אותו פריט מאז הספירה המאושרת הקודמת
create or replace function public.stock_count_review(p_count_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_c stock_counts%rowtype; v_since timestamptz; v_lines jsonb;
begin
  if not is_admin() then raise exception 'אין הרשאה'; end if;
  select * into v_c from stock_counts where id = p_count_id;
  if not found then raise exception 'הספירה לא נמצאה'; end if;
  select max(submitted_at) into v_since from stock_counts where status = 'approved' and submitted_at < v_c.submitted_at;
  v_since := coalesce(v_since, v_c.submitted_at - interval '7 days');

  select coalesce(jsonb_agg(x order by abs(x.diff_ils) desc, x.scent), '[]'::jsonb) into v_lines from (
    select adl_scent(i.name) as scent, i.unit, l.item_id, l.system_qty, l.counted_qty,
           l.counted_qty - l.system_qty as diff,
           (l.counted_qty - l.system_qty) * adl_pack_kg(i.unit) as diff_kg,
           round((l.counted_qty - l.system_qty) * coalesce(l.unit_cost, 0), 2) as diff_ils,
           (select coalesce(jsonb_agg(jsonb_build_object('at', t.created_at, 'type', t.type,
                      'qty', case when t.from_location_id = v_c.location_id then -t.qty else t.qty end,
                      'note', t.note) order by t.created_at), '[]'::jsonb)
              from transactions t
             where t.item_id = l.item_id and t.created_at >= v_since and t.created_at <= v_c.submitted_at
               and (t.from_location_id = v_c.location_id or t.to_location_id = v_c.location_id)) as moves
    from stock_count_lines l join items i on i.id = l.item_id
    where l.count_id = v_c.id and l.counted_qty <> l.system_qty
  ) x;

  return jsonb_build_object(
    'count', to_jsonb(v_c),
    'since', v_since,
    'total_lines', (select count(*) from stock_count_lines where count_id = v_c.id),
    'lines', v_lines,
    'total_ils', (select coalesce(sum(round((counted_qty - system_qty) * coalesce(unit_cost, 0), 2)), 0) from stock_count_lines where count_id = v_c.id),
    'total_kg', (select coalesce(sum((l.counted_qty - l.system_qty) * adl_pack_kg(i.unit)), 0) from stock_count_lines l join items i on i.id = l.item_id where l.count_id = v_c.id),
    'can_approve', v_c.status = 'submitted' and v_c.counted_by <> auth.uid()
  );
end $$;

revoke all on function public.count_sheet() from public;
revoke all on function public.submit_stock_count(jsonb, text) from public;
revoke all on function public.approve_stock_count(uuid, text) from public;
revoke all on function public.cancel_stock_count(uuid) from public;
revoke all on function public.stock_count_review(uuid) from public;
grant execute on function public.count_sheet() to authenticated;
grant execute on function public.submit_stock_count(jsonb, text) to authenticated;
grant execute on function public.approve_stock_count(uuid, text) to authenticated;
grant execute on function public.cancel_stock_count(uuid) to authenticated;
grant execute on function public.stock_count_review(uuid) to authenticated;
