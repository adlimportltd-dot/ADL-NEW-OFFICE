-- ============================================================
-- migration_v9_waste.sql
-- דוגמאות ופחת: כל יציאה מהמלאי שאינה מכירה נרשמת עם סיבה.
-- עד 1 ק"ג ועד 200 ₪ – יורד מהמלאי מיד. מעל זה – אצל נתי ממתין לאישור
-- של ליאור או אלירן (אצל מנהל – מיד). נתי לא רואה שווי בשקלים.
-- להריץ פעם אחת ב-Supabase SQL Editor של אדל (אחרי migration_v8).
-- לא משנה מלאי. מוסיף טבלה אחת (waste_log), ומעדכן את mobile_pending ואת daily_report.
-- ============================================================

create table if not exists public.waste_log (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  reason text not null check (reason in ('sample', 'spill', 'defective', 'internal', 'other')),
  customer_name text,
  note text,
  location_id uuid not null references locations(id),
  lines jsonb not null,            -- [{"item_id","qty","name"}]
  kg numeric not null default 0,
  value numeric not null default 0,
  status text not null check (status in ('done', 'pending', 'approved', 'rejected')),
  created_by uuid not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);
create index if not exists waste_log_created_idx on public.waste_log (created_at desc);
alter table public.waste_log enable row level security;
-- קריאה: מנהל רואה הכול; מוכר רואה רק את שלו. (השווי בשקלים מוסתר ממנו במסך ובפונקציה my_waste.)
drop policy if exists "read waste_log" on public.waste_log;
create policy "read waste_log" on public.waste_log for select using (is_admin());

-- הרשומות האחרונות של המשתמש – בלי שווי בשקלים
create or replace function public.my_waste()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'tag', w.tag, 'reason', w.reason, 'customer', w.customer_name,
            'lines', w.lines, 'status', w.status, 'created_at', w.created_at, 'decided_by', w.decided_by_name,
            'decision_note', w.decision_note) order by w.created_at desc), '[]'::jsonb)
          from (select * from waste_log where created_by = auth.uid() order by created_at desc limit 10) w);
end $$;

create or replace function public._waste_apply(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w waste_log%rowtype; v_note text;
begin
  select * into w from waste_log where id = p_id;
  v_note := w.tag || ' - ' || case w.reason when 'sample' then 'דוגמה ללקוח' when 'spill' then 'שפיכה / שבר'
              when 'defective' then 'מוצר פגום' when 'internal' then 'שימוש פנימי' else 'אחר' end
            || coalesce(': ' || nullif(trim(w.customer_name), ''), '')
            || ' (' || coalesce(w.created_by_name, '') || ')'
            || coalesce(' - ' || nullif(trim(w.note), ''), '')
            || case when w.decided_by_name is not null then ' - אושר ע"י ' || w.decided_by_name else '' end;
  insert into transactions (type, item_id, qty, from_location_id, note, performed_by)
  select 'writeoff', (l->>'item_id')::uuid, (l->>'qty')::numeric, w.location_id, v_note, w.created_by
  from jsonb_array_elements(w.lines) l;
end $$;
revoke all on function public._waste_apply(uuid) from public, authenticated;

create or replace function public.record_waste(
  p_reason text, p_lines jsonb, p_source text default 'warehouse',
  p_customer text default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loc uuid; v_lines jsonb; v_kg numeric := 0; v_value numeric := 0; v_name text;
  v_status text; v_tag text; v_id uuid;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if p_reason not in ('sample', 'spill', 'defective', 'internal', 'other') then raise exception 'יש לבחור סיבה'; end if;
  if p_reason = 'sample' and coalesce(trim(p_customer), '') = '' then raise exception 'דוגמה – יש לכתוב לאיזה לקוח'; end if;
  if p_reason = 'other' and coalesce(trim(p_note), '') = '' then raise exception 'יש לכתוב מה קרה'; end if;

  if coalesce(p_source, 'warehouse') = 'vehicle' then
    select l.id into v_loc from profiles pr join locations l on l.id = pr.location_id
     where pr.id = auth.uid() and l.type = 'vehicle';
    if v_loc is null then raise exception 'אין לך רכב במערכת'; end if;
  else
    select l.id into v_loc from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  end if;

  v_lines := _vehicle_lines_check(p_lines, v_loc);   -- בודק כמויות ומלאי במקור
  select coalesce(sum((l->>'qty')::numeric * coalesce(adl_pack_kg(i.unit), 0)), 0),
         coalesce(sum((l->>'qty')::numeric * coalesce(i.unit_cost, 0)), 0)
    into v_kg, v_value
    from jsonb_array_elements(v_lines) l join items i on i.id = (l->>'item_id')::uuid;

  select coalesce(nullif(pr.full_name, ''), 'משתמש') into v_name from profiles pr where pr.id = auth.uid();
  v_status := case when (v_kg > 1 or v_value > 200) and not is_admin() then 'pending' else 'done' end;
  v_tag := 'פחת #' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));

  insert into waste_log (tag, reason, customer_name, note, location_id, lines, kg, value, status, created_by, created_by_name)
  values (v_tag, p_reason, nullif(trim(coalesce(p_customer, '')), ''), nullif(trim(coalesce(p_note, '')), ''),
          v_loc, v_lines, v_kg, round(v_value, 2), v_status, auth.uid(), v_name)
  returning id into v_id;

  if v_status = 'done' then perform _waste_apply(v_id); end if;
  return jsonb_build_object('id', v_id, 'tag', v_tag, 'status', v_status);   -- בלי שווי – גם נתי קורא לזה
end $$;

create or replace function public.decide_waste(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare w waste_log%rowtype; v_name text; v_chk jsonb;
begin
  if not is_admin() then raise exception 'רק ליאור או אלירן מאשרים'; end if;
  select * into w from waste_log where id = p_id for update;
  if not found then raise exception 'הרישום לא נמצא'; end if;
  if w.status <> 'pending' then raise exception 'הרישום כבר טופל'; end if;
  select coalesce(nullif(pr.full_name, ''), 'מנהל') into v_name from profiles pr where pr.id = auth.uid();
  if p_approve then
    v_chk := _vehicle_lines_check(w.lines, w.location_id);   -- בודקים שוב שיש מלאי
  elsif coalesce(trim(p_note), '') = '' then
    raise exception 'כתוב בקצרה למה נדחה';
  end if;
  update waste_log set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_by_name = v_name, decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = w.id;
  if p_approve then perform _waste_apply(w.id); end if;
  return jsonb_build_object('ok', true);
end $$;

-- מה מחכה לאישור – עכשיו גם פחת
create or replace function public.mobile_pending()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if not is_admin() then return jsonb_build_object('repacks', 0, 'counts', 0, 'vehicle', 0, 'waste', 0); end if;
  return jsonb_build_object(
    'repacks', (select count(*) from repack_log where status = 'pending'),
    'counts', (select count(*) from stock_counts where status = 'submitted'),
    'vehicle', (select count(*) from vehicle_requests where status = 'pending'),
    'waste', (select count(*) from waste_log where status = 'pending'));
end $$;

-- דוח יומי – אותו דוח, בתוספת דוגמאות ופחת וממתינים לאישור פחת
create or replace function public.daily_report(p_day date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Jerusalem')::date - 1);
  v_from timestamptz;
  v_to timestamptz;
  v_wh uuid;
  v_sales jsonb;
begin
  if not is_admin() then raise exception 'אין הרשאה'; end if;
  v_from := v_day::timestamp at time zone 'Asia/Jerusalem';
  v_to := (v_day + 1)::timestamp at time zone 'Asia/Jerusalem';
  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;

  -- מכירות: כל החשבוניות של היום (מהטלפון ומהמערכת), בלי מבוטלות.
  -- הסכום כולל מע"מ; "ללא" / (0%) = בלי מע"מ. רווח משוער = לפני מע"מ פחות עלות.
  with inv as (
    select i.id, i.invoice_number, i.total_amount::numeric as total, i.notes,
           coalesce(nullif(p.full_name, ''), 'לא ידוע') as seller,
           c.name as customer,
           case when i.notes like '%(0\%)%' or i.notes like '%ללא%' then 0 else 18 end as vat,
           (select coalesce(sum(l.qty * coalesce(it.unit_cost, 0)), 0)
              from customer_invoice_lines l join items it on it.id = l.item_id where l.invoice_id = i.id) as cost,
           (select coalesce(sum(pp.amount), 0) from customer_invoice_payments pp where pp.invoice_id = i.id) as paid,
           (i.notes like '%מהרכב%') as from_vehicle
      from customer_invoices i
      left join profiles p on p.id = i.created_by
      left join customers c on c.id = i.customer_id
     where i.created_at >= v_from and i.created_at < v_to and i.status::text <> 'void'
  ), inv2 as (
    select *, round(total / (1 + vat / 100.0), 2) as ex_vat from inv
  )
  select jsonb_build_object(
    'count', (select count(*) from inv2),
    'total', (select coalesce(sum(total), 0) from inv2),
    'ex_vat', (select coalesce(sum(ex_vat), 0) from inv2),
    'profit', (select coalesce(round(sum(ex_vat - cost), 2), 0) from inv2),
    'unpaid_count', (select count(*) from inv2 where paid < total - 0.01),
    'unpaid_total', (select coalesce(sum(total - paid), 0) from inv2 where paid < total - 0.01),
    'by_seller', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select seller as name, count(*) as count, sum(total) as total, round(sum(ex_vat - cost), 2) as profit,
               count(*) filter (where from_vehicle) as from_vehicle
          from inv2 group by seller) x),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('num', invoice_number, 'customer', customer, 'seller', seller,
               'total', total, 'vat', vat, 'paid', paid >= total - 0.01, 'from_vehicle', from_vehicle,
               'below_cost', ex_vat < cost) order by total desc), '[]'::jsonb) from inv2)
  ) into v_sales;

  return jsonb_build_object(
    'day', v_day,
    'sales', v_sales,

    -- מזיגות מהטלפון
    'repacks', (select coalesce(jsonb_agg(jsonb_build_object('tag', r.tag, 'scent', r.scent, 'by', r.created_by_name,
                  'in_kg', r.in_kg, 'out_kg', r.out_kg, 'status', r.status, 'reason', r.reason) order by r.created_at), '[]'::jsonb)
                from repack_log r where r.created_at >= v_from and r.created_at < v_to),
    -- מזיגות שנרשמו במערכת הרגילה (לא מהטלפון)
    'repacks_desktop', (select count(distinct split_part(t.note, ' - ', 1)) from transactions t
                         where t.type = 'repack' and t.created_at >= v_from and t.created_at < v_to
                           and coalesce(t.note, '') not like 'מזיגה #%'),

    -- רכב
    'vehicle', (select coalesce(jsonb_agg(jsonb_build_object('tag', v.tag, 'kind', v.kind, 'by', v.created_by_name,
                  'status', v.status, 'lines', v.lines, 'decided_by', v.decided_by_name) order by v.created_at), '[]'::jsonb)
                from vehicle_requests v
               where (v.created_at >= v_from and v.created_at < v_to) or (v.decided_at >= v_from and v.decided_at < v_to)),

    -- גריעות (פחת, דוגמאות, התאמות ספירה)
    'writeoffs', (select coalesce(jsonb_agg(jsonb_build_object('item', i.name, 'qty', t.qty, 'note', t.note,
                    'value', round(t.qty * coalesce(i.unit_cost, 0), 2)) order by t.created_at), '[]'::jsonb)
                  from transactions t join items i on i.id = t.item_id
                 where t.type = 'writeoff' and t.created_at >= v_from and t.created_at < v_to),

    -- דוגמאות ופחת שנרשמו (כולל ממתינים ונדחים)
    'waste', (select coalesce(jsonb_agg(jsonb_build_object('tag', w.tag, 'reason', w.reason, 'customer', w.customer_name,
                'by', w.created_by_name, 'status', w.status, 'lines', w.lines, 'value', w.value, 'note', w.note) order by w.created_at), '[]'::jsonb)
              from waste_log w where w.created_at >= v_from and w.created_at < v_to),

    -- ספירות שבועיות שנשלחו / אושרו
    'counts', (select coalesce(jsonb_agg(jsonb_build_object('by', c.counted_by_name, 'status', c.status,
                  'approved_by', c.approved_by_name,
                  'diff_ils', (select coalesce(sum(round((l.counted_qty - l.system_qty) * coalesce(l.unit_cost, 0), 2)), 0)
                                 from stock_count_lines l where l.count_id = c.id))), '[]'::jsonb)
               from stock_counts c
              where (c.submitted_at >= v_from and c.submitted_at < v_to) or (c.approved_at >= v_from and c.approved_at < v_to)),

    -- מחכים לאישור עכשיו
    'pending', jsonb_build_object(
       'repacks', (select count(*) from repack_log where status = 'pending'),
       'counts', (select count(*) from stock_counts where status = 'submitted'),
       'vehicle', (select count(*) from vehicle_requests where status = 'pending'),
       'waste', (select count(*) from waste_log where status = 'pending')),

    -- מלאי נמוך (מתחת לסף המינימום שהוגדר לפריט, בכל המיקומים יחד)
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('item', x.name, 'qty', x.qty, 'min', x.min_threshold) order by x.name), '[]'::jsonb)
                  from (select i.name, i.min_threshold, coalesce(sum(s.quantity), 0) as qty
                          from items i left join stock_levels s on s.item_id = i.id
                         where i.min_threshold > 0 and i.name not like '%בדיקה%'
                         group by i.id, i.name, i.min_threshold
                        having coalesce(sum(s.quantity), 0) <= i.min_threshold) x),

    -- צריך למזוג: אין חצאים או גלונים על המדף, אבל יש ממה למזוג (חבית / גלון)
    'to_pour', (select coalesce(jsonb_agg(jsonb_build_object('scent', x.scent, 'unit', x.unit) order by x.scent, x.unit), '[]'::jsonb)
                from (select adl_scent(i.name) as scent, i.unit
                        from items i left join stock_levels s on s.item_id = i.id and s.location_id = v_wh
                       where i.category::text = 'consumable' and i.unit in ('5 ק"ג', 'חצי ק"ג')
                         and adl_scent(i.name) is not null and i.name not like '%בדיקה%'
                         and coalesce(s.quantity, 0) <= 0
                         and exists (select 1 from items b join stock_levels sb on sb.item_id = b.id and sb.location_id = v_wh
                                      where adl_scent(b.name) = adl_scent(i.name) and sb.quantity > 0
                                        and adl_pack_kg(b.unit) > adl_pack_kg(i.unit))) x)
  );
end $$;


revoke all on function public.my_waste() from public;
revoke all on function public.record_waste(text, jsonb, text, text, text) from public;
revoke all on function public.decide_waste(uuid, boolean, text) from public;
revoke all on function public.mobile_pending() from public;
revoke all on function public.daily_report(date) from public;
grant execute on function public.my_waste() to authenticated;
grant execute on function public.record_waste(text, jsonb, text, text, text) to authenticated;
grant execute on function public.decide_waste(uuid, boolean, text) to authenticated;
grant execute on function public.mobile_pending() to authenticated;
grant execute on function public.daily_report(date) to authenticated;
