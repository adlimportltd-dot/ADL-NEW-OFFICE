-- ============================================================
-- migration_v7_vehicle.sql
-- הרכב של נתי: בקשת העמסה מהמחסן / החזרה למחסן – נתי מבקש, ליאור או אלירן מאשרים.
-- מכירה מהטלפון יכולה לרדת מהרכב של המוכר (p_source = 'vehicle').
-- להריץ פעם אחת ב-Supabase SQL Editor של אדל (אחרי migration_v6).
-- לא משנה מלאי. מוסיף טבלה אחת (vehicle_requests), מקשר את המשתמש של נתי
-- לרכב שלו, ומעדכן את mobile_sale (אותה פונקציה + אפשרות למכור מהרכב).
-- ============================================================

-- 1) המשתמש של נתי ← "רכב טכנאי - נתנאל"
update profiles p set location_id = l.id
from locations l
where p.full_name = 'נתי' and p.role::text = 'seller'
  and l.type = 'vehicle' and l.name like 'רכב טכנאי - נתנאל%'
  and p.location_id is distinct from l.id;

-- 2) בקשות העמסה / החזרה
create table if not exists public.vehicle_requests (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  kind text not null check (kind in ('load', 'return')),   -- load = מחסן ← רכב, return = רכב ← מחסן
  vehicle_id uuid not null references locations(id),
  lines jsonb not null,                                     -- [{"item_id","qty","name"}]
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_by uuid not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);
create index if not exists vehicle_requests_created_idx on public.vehicle_requests (created_at desc);
alter table public.vehicle_requests enable row level security;
drop policy if exists "read vehicle_requests" on public.vehicle_requests;
create policy "read vehicle_requests" on public.vehicle_requests for select
  using (is_admin() or created_by = auth.uid());

-- 3) הרכב שלי: מה יש בו עכשיו (בלי עלויות)
create or replace function public.my_vehicle()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_loc locations%rowtype;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  select l.* into v_loc from profiles pr join locations l on l.id = pr.location_id
   where pr.id = auth.uid() and l.type = 'vehicle';
  if not found then return jsonb_build_object('vehicle', null, 'stock', '[]'::jsonb); end if;
  return jsonb_build_object(
    'vehicle', jsonb_build_object('id', v_loc.id, 'name', v_loc.name),
    'stock', (select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'qty', s.quantity, 'name', i.name, 'unit', i.unit, 'category', i.category)
                      order by i.category, i.name), '[]'::jsonb)
                from stock_levels s join items i on i.id = s.item_id
               where s.location_id = v_loc.id and s.quantity > 0));
end $$;

-- בדיקת שורות + מלאי במקור. מחזירה את השורות עם שם הפריט.
create or replace function public._vehicle_lines_check(p_lines jsonb, p_from uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_line jsonb; v_item record; v_qty numeric; v_stock numeric; v_out jsonb := '[]';
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'לא נבחרו פריטים';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := nullif(v_line->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then raise exception 'כמות לא תקינה'; end if;
    select i.id, i.name into v_item from items i where i.id = (v_line->>'item_id')::uuid;
    if not found then raise exception 'פריט לא נמצא'; end if;
    select coalesce(s.quantity, 0) into v_stock from stock_levels s where s.item_id = v_item.id and s.location_id = p_from;
    if coalesce(v_stock, 0) < v_qty then
      raise exception 'אין מספיק: % – יש % בלבד', v_item.name, trim_scale(coalesce(v_stock, 0));
    end if;
    v_out := v_out || jsonb_build_object('item_id', v_item.id, 'qty', v_qty, 'name', v_item.name);
  end loop;
  return v_out;
end $$;
revoke all on function public._vehicle_lines_check(jsonb, uuid) from public, authenticated;

-- 4) נתי מבקש העמסה / החזרה
create or replace function public.request_vehicle_move(p_kind text, p_lines jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_veh uuid; v_wh uuid; v_name text; v_lines jsonb; v_tag text; v_id uuid;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if p_kind not in ('load', 'return') then raise exception 'סוג בקשה לא תקין'; end if;
  select l.id into v_veh from profiles pr join locations l on l.id = pr.location_id
   where pr.id = auth.uid() and l.type = 'vehicle';
  if v_veh is null then raise exception 'אין לך רכב במערכת'; end if;
  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  select coalesce(nullif(pr.full_name, ''), 'משתמש') into v_name from profiles pr where pr.id = auth.uid();

  v_lines := _vehicle_lines_check(p_lines, case when p_kind = 'load' then v_wh else v_veh end);
  v_tag := case when p_kind = 'load' then 'העמסה #' else 'החזרה #' end || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  insert into vehicle_requests (tag, kind, vehicle_id, lines, note, created_by, created_by_name)
  values (v_tag, p_kind, v_veh, v_lines, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), v_name)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'tag', v_tag);
end $$;

-- 5) ליאור / אלירן מאשרים או דוחים. באישור – הסחורה עוברת בפועל.
create or replace function public.decide_vehicle_move(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r vehicle_requests%rowtype; v_wh uuid; v_from uuid; v_to uuid; v_name text; v_lines jsonb; v_note text;
begin
  if not is_admin() then raise exception 'רק ליאור או אלירן מאשרים'; end if;
  select * into r from vehicle_requests where id = p_id for update;
  if not found then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status <> 'pending' then raise exception 'הבקשה כבר טופלה'; end if;
  select coalesce(nullif(pr.full_name, ''), 'מנהל') into v_name from profiles pr where pr.id = auth.uid();

  if not p_approve then
    if coalesce(trim(p_note), '') = '' then raise exception 'כתוב בקצרה למה הבקשה נדחתה'; end if;
    update vehicle_requests set status = 'rejected', decided_by = auth.uid(), decided_by_name = v_name,
           decided_at = now(), decision_note = trim(p_note) where id = r.id;
    return jsonb_build_object('ok', true);
  end if;

  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  v_from := case when r.kind = 'load' then v_wh else r.vehicle_id end;
  v_to   := case when r.kind = 'load' then r.vehicle_id else v_wh end;
  v_lines := _vehicle_lines_check(r.lines, v_from);   -- בודקים שוב שיש מלאי במקור

  v_note := r.tag || ' - ' || case when r.kind = 'load' then 'העמסה לרכב' else 'החזרה למחסן' end
            || ' (' || coalesce(r.created_by_name, '') || ', אושר ע"י ' || v_name || ')'
            || coalesce(' - ' || r.note, '');
  insert into transactions (type, item_id, qty, from_location_id, to_location_id, note, performed_by)
  select 'transfer', (l->>'item_id')::uuid, (l->>'qty')::numeric, v_from, v_to, v_note, auth.uid()
  from jsonb_array_elements(v_lines) l;

  update vehicle_requests set status = 'approved', decided_by = auth.uid(), decided_by_name = v_name,
         decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- 6) נתי מבטל בקשה שלו שעוד לא אושרה
create or replace function public.cancel_vehicle_move(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update vehicle_requests set status = 'cancelled'
   where id = p_id and status = 'pending' and created_by = auth.uid();
  if not found then raise exception 'אי אפשר לבטל את הבקשה הזאת'; end if;
end $$;

-- 7) מה מחכה לאישור – עכשיו גם בקשות רכב
create or replace function public.mobile_pending()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if not is_admin() then return jsonb_build_object('repacks', 0, 'counts', 0, 'vehicle', 0); end if;
  return jsonb_build_object(
    'repacks', (select count(*) from repack_log where status = 'pending'),
    'counts', (select count(*) from stock_counts where status = 'submitted'),
    'vehicle', (select count(*) from vehicle_requests where status = 'pending'));
end $$;

-- 8) מכירה מהטלפון – אותה פונקציה כמו ב-migration_v5, בתוספת p_source (מחסן / הרכב שלי).
--    קריאה בלי p_source ממשיכה לעבוד בדיוק כמו היום (מהמחסן).
drop function if exists public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text, text);
create or replace function public.mobile_sale(
  p_customer_id uuid,
  p_lines jsonb,                 -- [{"item_id": "...", "qty": 2, "unit_price": 150}]  (unit_price – מנהל בלבד)
  p_payment text,                -- cash | credit_card | bank_transfer | bit | open
  p_channel text default 'adl',  -- adl | icon_site
  p_end_customer text default null,
  p_order_ref text default null,
  p_vat_rate numeric default 18, -- 18 או 0 (ללא מע"מ)
  p_note text default null,
  p_approved_by text default null, -- מי אישר את המחיר (חובה למוכר)
  p_source text default 'warehouse' -- warehouse | vehicle (הרכב של המוכר)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_wh uuid;
  v_src_name text := '';
  v_icon uuid;
  v_is_icon boolean := false;
  v_cust uuid := p_customer_id;
  v_line jsonb;
  v_item items%rowtype;
  v_qty numeric;
  v_avail numeric;
  v_price numeric;
  v_vat numeric;
  v_total numeric;
  v_tag text;
  v_note text;
  v_seller text;
  v_inv uuid;
  v_num text;
  v_paid boolean;
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_changed boolean := false;
  v_rev numeric := 0;        -- סכום המכירה לפני מע"מ
  v_cost_total numeric := 0; -- עלות הסחורה במכירה
begin
  if not is_seller() then raise exception 'אין הרשאה למכירה'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'אין פריטים במכירה';
  end if;
  if p_payment not in ('cash', 'credit_card', 'bank_transfer', 'bit', 'open') then
    raise exception 'אמצעי תשלום לא תקין';
  end if;
  if p_channel not in ('adl', 'icon_site') then raise exception 'ערוץ מכירה לא תקין'; end if;

  if p_payment = 'bit' or p_channel = 'icon_site' then
    select c.id into v_icon from customers c where c.name like 'אייקון אייר%' order by c.created_at limit 1;
    if v_icon is null then raise exception 'הלקוח "אייקון אייר" לא נמצא במערכת'; end if;
    v_cust := v_icon;
    v_is_icon := true;
  end if;
  if v_cust is null then raise exception 'יש לבחור לקוח'; end if;
  if not v_admin and not v_is_icon and coalesce(trim(p_approved_by), '') not in ('ליאור', 'אלירן') then
    raise exception 'יש לסמן מי אישר את המחיר (ליאור או אלירן)';
  end if;

  -- מע"מ: 18% או ללא מע"מ (0%) – גם למוכר, בתיאום עם ליאור/אלירן. אייקון תמיד 18%.
  v_vat := case when v_is_icon then 18 when p_vat_rate = 0 then 0 else 18 end;

  if coalesce(p_source, 'warehouse') = 'vehicle' then
    -- מכירה מהרכב של המוכר עצמו (נתי)
    select l.id into v_wh from profiles pr join locations l on l.id = pr.location_id
      where pr.id = auth.uid() and l.type = 'vehicle';
    if v_wh is null then raise exception 'אין לך רכב במערכת – מוכרים מהמחסן'; end if;
    v_src_name := ' - מהרכב';
  else
    select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
    if v_wh is null then raise exception 'לא נמצא מחסן מרכזי'; end if;
  end if;

  select coalesce(pr.full_name, '') into v_seller from profiles pr where pr.id = auth.uid();
  v_tag := 'הזמנה #' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  v_note := v_tag || ' - מכירה מהטלפון' || case when coalesce(v_seller, '') <> '' then ' (' || v_seller || ')' else '' end || v_src_name;
  if v_is_icon then
    v_note := v_note || ' - ' || case when p_payment = 'bit' then 'תשלום בביט' else 'הזמנה מאתר אייקון' end
              || coalesce(' #' || nullif(trim(p_order_ref), ''), '')
              || coalesce(' - לקוח סופי: ' || nullif(trim(p_end_customer), ''), '');
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then v_note := v_note || ' - ' || trim(p_note); end if;
  if not v_is_icon then
    v_note := v_note || ' - מחיר אושר ע"י ' || coalesce(nullif(trim(p_approved_by), ''), coalesce(nullif(v_seller, ''), 'מנהל'));
  end if;
  v_note := v_note || ' - מחיר לפני מע"מ (' || v_vat || '%)';

  drop table if exists _mobile_lines;
  create temp table _mobile_lines (item_id uuid, qty numeric, price_incl numeric) on commit drop;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := nullif(v_line->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'כמות לא תקינה'; end if;

    select * into v_item from items where id = (v_line->>'item_id')::uuid;
    if not found then raise exception 'פריט לא נמצא'; end if;

    -- נעילת שורת המלאי כדי ששתי מכירות במקביל לא ימכרו את אותה יחידה
    select s.quantity into v_avail from stock_levels s
      where s.item_id = v_item.id and s.location_id = v_wh for update;
    v_avail := coalesce(v_avail, 0) - coalesce((select sum(m.qty) from _mobile_lines m where m.item_id = v_item.id), 0);
    if v_qty > v_avail then
      raise exception 'אין מספיק מלאי: % (במלאי %)', v_item.name, v_avail;
    end if;

    if v_is_icon then
      v_price := v_item.icon_price;
      if v_price is null then raise exception 'חסר מחיר לאייקון לפריט %', v_item.name; end if;
    else
      -- מחיר פתוח: נקבע בכל מכירה בתיאום עם ליאור/אלירן; ברירת מחדל = המחירון
      if nullif(v_line->>'unit_price', '') is not null then
        v_price := (v_line->>'unit_price')::numeric;
      else
        v_price := v_item.sale_price;
      end if;
      if v_price is null then raise exception 'חסר מחיר לפריט %', v_item.name; end if;
      if v_item.sale_price is null or v_price <> v_item.sale_price then v_changed := true; end if;
      v_rev := v_rev + v_price * v_qty;
      v_cost_total := v_cost_total + coalesce(v_item.unit_cost, 0) * v_qty;
    end if;
    if v_price < 0 then raise exception 'מחיר לא תקין'; end if;

    insert into _mobile_lines values (v_item.id, v_qty, round(v_price * (1 + v_vat / 100), 2));
  end loop;

  -- מוכר לא יכול למכור מתחת לעלות - בדיקה על כל המכירה יחד (כך שחבילה כמו
  -- מכשיר + חצי ק"ג ריח במחיר אחד עוברת), בלי לחשוף את העלות
  if not v_admin and not v_is_icon and v_rev < v_cost_total then
    raise exception 'המחיר נמוך מדי – צריך לבדוק עם ליאור או אלירן';
  end if;

  -- הורדה מהמלאי (הטריגר הקיים מעדכן את stock_levels)
  insert into transactions (type, item_id, qty, from_location_id, customer_id, unit_price, note)
    select 'install', m.item_id, m.qty, v_wh, v_cust, m.price_incl, v_note from _mobile_lines m;

  select round(sum(m.qty * m.price_incl), 2) into v_total from _mobile_lines m;
  v_paid := (not v_is_icon) and p_payment in ('cash', 'credit_card', 'bank_transfer');
  v_num := 'ADL-INV-' || to_char(v_today, 'YYYYMMDD') || '-' || (100 + floor(random() * 900))::int;

  insert into customer_invoices (invoice_number, customer_id, issue_date, due_date, total_amount, notes)
    values (v_num, v_cust, v_today, case when v_paid then v_today else v_today + 14 end, v_total, v_note)
    returning id into v_inv;
  insert into customer_invoice_lines (invoice_id, item_id, qty, unit_price)
    select v_inv, m.item_id, m.qty, m.price_incl from _mobile_lines m;
  if v_paid then
    insert into customer_invoice_payments (invoice_id, amount, paid_date, method, note)
      values (v_inv, v_total, v_today, p_payment, 'שולם בעת המכירה (טלפון)');
  end if;

  return jsonb_build_object('invoice_id', v_inv, 'invoice_number', v_num, 'total', v_total,
                            'order_tag', v_tag, 'icon', v_is_icon, 'paid', v_paid, 'vat', v_vat,
                            'price_changed', v_changed, 'source', coalesce(p_source, 'warehouse'));
end $$;


revoke all on function public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text, text, text) from public;
grant execute on function public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text, text, text) to authenticated;

revoke all on function public.my_vehicle() from public;
revoke all on function public.request_vehicle_move(text, jsonb, text) from public;
revoke all on function public.decide_vehicle_move(uuid, boolean, text) from public;
revoke all on function public.cancel_vehicle_move(uuid) from public;
revoke all on function public.mobile_pending() from public;
grant execute on function public.my_vehicle() to authenticated;
grant execute on function public.request_vehicle_move(text, jsonb, text) to authenticated;
grant execute on function public.decide_vehicle_move(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_vehicle_move(uuid) to authenticated;
grant execute on function public.mobile_pending() to authenticated;
