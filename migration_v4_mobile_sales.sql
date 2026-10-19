-- ============================================================
-- migration_v4_mobile_sales.sql
-- מכירה מהירה בטלפון: תפקיד "מוכר" (seller), מחירון, מחיר לאייקון,
-- חסימת מכירה מעבר למלאי, והסתרת עלויות/ספקים ממי שאינו מנהל.
-- להריץ פעם אחת ב-Supabase SQL Editor (פרויקט אדל בלבד).
-- ============================================================

-- 1) תפקיד חדש: seller (מוכר) – רואה רק את מסך המכירה בטלפון
alter type user_role add value if not exists 'seller';

-- 2) מחירון ומחיר לאייקון (לפני מע"מ) + שמות נוספים לריח
alter table items add column if not exists sale_price numeric(12,2);
alter table items add column if not exists icon_price numeric(12,2);
alter table items add column if not exists aliases text;

update items set aliases = 'נרסיסו' where name like 'תמצית ריח - לטינו (%' and aliases is null;
update items set aliases = 'אדידס'  where name like 'תמצית ריח - ספורט (%' and aliases is null;

-- 3) מי רשאי למכור: מנהל או מוכר
create or replace function public.is_seller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role::text in ('admin', 'seller'));
$$;

-- 4) הסתרת מידע רגיש ממי שאינו מנהל (עלויות, ספקים, משלוחים, הוצאות, חשבוניות).
--    רק בטבלאות שכבר יש בהן RLS פעיל, כדי לא לשבור הרשאות כתיבה קיימות.
--    כל משתמשי המערכת היום הם מנהלים – אצלם שום דבר לא משתנה.
do $$
declare
  t text;
  p record;
  sensitive text[] := array[
    'items','suppliers','shipments','shipping_rate_cards','shipping_rates',
    'expenses','expense_payments','shipment_item_costs','purchase_orders',
    'po_lines','po_payments','leads','quotes','quote_lines',
    'customer_invoices','customer_invoice_lines','customer_invoice_payments',
    'customer_returns','customer_credits'
  ];
begin
  foreach t in array sensitive loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t) then
      raise notice 'דילוג: הטבלה % לא קיימת', t;
      continue;
    end if;
    if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = t) then
      raise notice 'שים לב: בטבלה % אין RLS – לא שונתה', t;
      continue;
    end if;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select using (is_admin())', 'admin read ' || t, t);
  end loop;
end $$;

-- 5) קטלוג למסך המכירה: בלי עלות ובלי מחיר לאייקון
create or replace function public.mobile_catalog()
returns table (id uuid, name text, category text, unit text, fragrance_group text,
               aliases text, sale_price numeric, stock numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_wh uuid;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  return query
    select i.id, i.name::text, i.category::text, i.unit::text, i.fragrance_group::text,
           i.aliases::text, i.sale_price::numeric, coalesce(s.quantity, 0)::numeric
    from items i
    left join stock_levels s on s.item_id = i.id and s.location_id = v_wh
    order by i.category, i.name;
end $$;

-- 6) לקוחות אחרונים
create or replace function public.mobile_recent_customers()
returns table (id uuid, name text, phone text, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  return query
    select c.id, c.name::text, c.phone::text, max(ci.created_at)
    from customer_invoices ci join customers c on c.id = ci.customer_id
    where ci.created_at > now() - interval '120 days'
    group by c.id, c.name, c.phone
    order by 4 desc
    limit 8;
end $$;

-- 7) לקוח חדש מהטלפון
create or replace function public.mobile_add_customer(p_name text, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_seller() then raise exception 'אין הרשאה'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'שם הלקוח הוא שדה חובה'; end if;
  insert into customers (name, phone, client_type)
  values (trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), 'business')
  returning id into v_id;
  return v_id;
end $$;

-- 8) מכירה מהטלפון: בודקת מלאי (חוסמת מכירה מעבר למלאי), לוקחת מחיר מהמחירון,
--    מורידה מהמלאי, ויוצרת חשבונית לקוח – הכול בפעולה אחת.
--    ביט / הזמנה מאתר אייקון: המכירה נרשמת ללקוח "אייקון אייר" במחיר לאייקון.
create or replace function public.mobile_sale(
  p_customer_id uuid,
  p_lines jsonb,                 -- [{"item_id": "...", "qty": 2, "unit_price": 150}]  (unit_price – מנהל בלבד)
  p_payment text,                -- cash | credit_card | bank_transfer | bit | open
  p_channel text default 'adl',  -- adl | icon_site
  p_end_customer text default null,
  p_order_ref text default null,
  p_vat_rate numeric default 18, -- מנהל בלבד
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := is_admin();
  v_wh uuid;
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

  v_vat := case when v_admin and not v_is_icon then coalesce(p_vat_rate, 18) else 18 end;

  select l.id into v_wh from locations l where l.type = 'warehouse' order by l.created_at limit 1;
  if v_wh is null then raise exception 'לא נמצא מחסן מרכזי'; end if;

  select coalesce(pr.full_name, '') into v_seller from profiles pr where pr.id = auth.uid();
  v_tag := 'הזמנה #' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  v_note := v_tag || ' - מכירה מהטלפון' || case when coalesce(v_seller, '') <> '' then ' (' || v_seller || ')' else '' end;
  if v_is_icon then
    v_note := v_note || ' - ' || case when p_payment = 'bit' then 'תשלום בביט' else 'הזמנה מאתר אייקון' end
              || coalesce(' #' || nullif(trim(p_order_ref), ''), '')
              || coalesce(' - לקוח סופי: ' || nullif(trim(p_end_customer), ''), '');
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then v_note := v_note || ' - ' || trim(p_note); end if;
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
      if v_admin and nullif(v_line->>'unit_price', '') is not null then
        v_price := (v_line->>'unit_price')::numeric;
      else
        v_price := v_item.sale_price;
      end if;
      if v_price is null then raise exception 'לפריט % אין מחיר במחירון', v_item.name; end if;
    end if;
    if v_price < 0 then raise exception 'מחיר לא תקין'; end if;

    insert into _mobile_lines values (v_item.id, v_qty, round(v_price * (1 + v_vat / 100), 2));
  end loop;

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
                            'order_tag', v_tag, 'icon', v_is_icon, 'paid', v_paid, 'vat', v_vat);
end $$;

revoke all on function public.mobile_catalog() from public;
revoke all on function public.mobile_recent_customers() from public;
revoke all on function public.mobile_add_customer(text, text) from public;
revoke all on function public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text) from public;
grant execute on function public.is_seller() to authenticated;
grant execute on function public.mobile_catalog() to authenticated;
grant execute on function public.mobile_recent_customers() to authenticated;
grant execute on function public.mobile_add_customer(text, text) to authenticated;
grant execute on function public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text) to authenticated;
