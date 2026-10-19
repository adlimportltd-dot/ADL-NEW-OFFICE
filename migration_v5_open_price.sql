-- ============================================================
-- migration_v5_open_price.sql
-- מחיר פתוח במכירה מהטלפון: המוכר מקליד מחיר בכל מכירה, אחרי תיאום
-- עם ליאור או אלירן, ומסמן מי אישר. אי אפשר למכור מתחת לעלות (על כל המכירה יחד).
-- להריץ פעם אחת ב-Supabase SQL Editor של אדל (אחרי migration_v4).
-- ============================================================

drop function if exists public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text);

create or replace function public.mobile_sale(
  p_customer_id uuid,
  p_lines jsonb,                 -- [{"item_id": "...", "qty": 2, "unit_price": 150}]  (unit_price – מנהל בלבד)
  p_payment text,                -- cash | credit_card | bank_transfer | bit | open
  p_channel text default 'adl',  -- adl | icon_site
  p_end_customer text default null,
  p_order_ref text default null,
  p_vat_rate numeric default 18, -- מנהל בלבד
  p_note text default null,
  p_approved_by text default null -- מי אישר את המחיר (חובה למוכר)
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
                            'price_changed', v_changed);
end $$;

revoke all on function public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text, text) from public;
grant execute on function public.mobile_sale(uuid, jsonb, text, text, text, text, numeric, text, text) to authenticated;
