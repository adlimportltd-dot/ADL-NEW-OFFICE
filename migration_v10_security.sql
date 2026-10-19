-- ============================================================
-- migration_v10_security.sql
-- תיקוני אבטחה לפי בדיקת Supabase (Security Advisor). לא משנה שום נתון.
-- 1) טבלאות הגיבוי מ-13/14.10 היו פתוחות לקריאה דרך האינטרנט (בלי RLS)
--    – כולל עלויות. נועלים אותן (הנתונים נשארים, רק לא נגישים מבחוץ).
-- 2) פונקציות שאפשר היה להפעיל בלי להתחבר (anon) – סוגרים. אף מסך לא
--    משתמש בהן לפני התחברות.
-- 3) פונקציות עזר פנימיות (_repack_apply, _waste_apply וכו') – רק הפונקציות
--    הראשיות מפעילות אותן; אף משתמש לא יכול להפעיל אותן ישירות.
-- 4) search_path קבוע לפונקציות ותיקות (המלצת אבטחה של Supabase).
-- להריץ פעם אחת ב-Supabase SQL Editor של אדל.
-- ============================================================

-- 1) נעילת טבלאות הגיבוי
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'backup\_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 2) אין הפעלת פונקציות בלי התחברות
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 3) פונקציות עזר פנימיות – לאף משתמש ישירות
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('_repack_check', '_repack_apply', '_vehicle_lines_check', '_waste_apply')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 4) search_path קבוע
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('handle_new_user', 'apply_transaction_to_stock', 'is_admin', 'my_location_id', 'adl_pack_kg', 'adl_scent')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
