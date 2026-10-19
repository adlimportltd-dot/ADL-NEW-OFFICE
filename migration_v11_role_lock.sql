-- ============================================================
-- migration_v11_role_lock.sql
-- תיקון אבטחה מהסקירה המלאה (19.10). לא משנה שום נתון.
-- 1) משתמש רגיל לא יכול לשנות לעצמו תפקיד (למשל להפוך ל"מנהל")
--    או מיקום. רק מנהל, או הרצה ידנית ב-SQL Editor.
-- 2) רישום תנועות מלאי ישירות – רק מנהלים. נתי ממשיך לעבוד כרגיל:
--    מכירה, מזיגה, פחת ורכב עוברים דרך פונקציות שבודקות הכל ומבקשות אישור.
-- להריץ פעם אחת ב-Supabase SQL Editor של אדל (ADL NEW OFFICE).
-- ============================================================

-- 1) אין עדכון עצמי של הפרופיל. מנהלים ממשיכים דרך "admin manage profiles".
drop policy if exists "update own profile" on public.profiles;

-- שכבת הגנה נוספת: גם אם תיפתח בעתיד מדיניות עדכון, שינוי תפקיד/מיקום נחסם
create or replace function public._guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.role is distinct from old.role or new.location_id is distinct from old.location_id) then
    raise exception 'אין הרשאה לשנות תפקיד או מיקום';
  end if;
  return new;
end $$;
revoke all on function public._guard_profile_role() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before update on public.profiles
  for each row execute function public._guard_profile_role();

-- 2) תנועות מלאי ישירות – מנהלים בלבד
drop policy if exists "insert transactions" on public.transactions;
create policy "insert transactions" on public.transactions
  for insert with check (is_admin());
