-- ============================================================
-- migration_v8_daily_report.sql
-- דוח יומי למנהל: מכירות לפי מוכר, מזיגות, רכב, גריעות, חריגות,
-- ממתינים לאישור, מלאי נמוך ומה צריך למזוג. קריאה בלבד – לא משנה כלום.
-- להריץ פעם אחת ב-Supabase SQL Editor של אדל (אחרי migration_v7).
-- ============================================================

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
       'vehicle', (select count(*) from vehicle_requests where status = 'pending')),

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

revoke all on function public.daily_report(date) from public;
grant execute on function public.daily_report(date) to authenticated;
