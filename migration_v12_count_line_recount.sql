-- ============================================================
-- v12: תיקון ספירה לשורה אחת בספירה השבועית
-- במקום לבטל את כל הספירה כשיש טעות בפריט אחד – סופרים שוב רק אותו,
-- מעדכנים את הכמות בשורה, והפער מחושב מחדש. נשמר תיעוד: כמה נספר קודם, מי תיקן ומתי.
-- רק מנהל (ליאור / אלירן) ורק בספירה שעוד ממתינה לאישור. המלאי עצמו לא משתנה עד "אישור ועדכון המלאי".
-- הוחל ב-Supabase ב-22.11.2026.
-- ============================================================

alter table public.stock_count_lines
  add column if not exists recounted_from numeric,
  add column if not exists recounted_by uuid,
  add column if not exists recounted_by_name text,
  add column if not exists recounted_at timestamptz;

create or replace function public.recount_count_line(p_count_id uuid, p_item_id uuid, p_new_qty numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c stock_counts%rowtype; v_l stock_count_lines%rowtype; v_name text; v_item text;
begin
  if not is_admin() then raise exception 'רק מנהל יכול לתקן ספירה'; end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'כמות לא תקינה'; end if;
  select * into v_c from stock_counts where id = p_count_id for update;
  if not found then raise exception 'הספירה לא נמצאה'; end if;
  if v_c.status::text <> 'submitted' then raise exception 'אפשר לתקן רק ספירה שממתינה לאישור'; end if;
  select * into v_l from stock_count_lines where count_id = p_count_id and item_id = p_item_id for update;
  if not found then raise exception 'הפריט לא נמצא בספירה הזאת'; end if;
  select coalesce(nullif(pr.full_name, ''), 'מנהל') into v_name from profiles pr where pr.id = auth.uid();
  update stock_count_lines
     set recounted_from = coalesce(recounted_from, counted_qty), counted_qty = p_new_qty,
         recounted_by = auth.uid(), recounted_by_name = v_name, recounted_at = now()
   where id = v_l.id;
  select coalesce(adl_scent(i.name), i.name) || ' ' || i.unit into v_item from items i where i.id = p_item_id;
  update stock_counts set note = coalesce(note || ' | ', '') || 'תיקון ספירה: ' || v_item || ' '
         || trim_scale(v_l.counted_qty)::text || ' → ' || trim_scale(p_new_qty)::text || ' (' || v_name || ')'
   where id = p_count_id;
  return jsonb_build_object('ok', true, 'old_qty', v_l.counted_qty, 'new_qty', p_new_qty);
end $$;

revoke all on function public.recount_count_line(uuid, uuid, numeric) from public;
grant execute on function public.recount_count_line(uuid, uuid, numeric) to authenticated;

-- stock_count_review עודכנה (על בסיס הגרסה החיה) כך שתחזיר לכל שורה גם
-- recounted_from, recounted_by_name, recounted_at, ושורה שתוקנה נשארת ברשימה גם אם הפער שלה ירד ל-0.
