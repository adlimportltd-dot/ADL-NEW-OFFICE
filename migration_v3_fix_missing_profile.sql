-- ============================================================
-- אדל אימפורט - מיגרציה v3: תיקון "Cannot coerce the result to a single JSON object"
-- ============================================================
-- הרצה: אחרי schema.sql ו-migration_v2. Supabase Dashboard -> SQL Editor -> הדבק והרץ.
--
-- הבעיה: משתמשים שנוצרו ידנית דרך Authentication -> Add user לא תמיד מקבלים
-- שורה תואמת בטבלת profiles (תלוי אם הטריגר on_auth_user_created כבר היה קיים
-- בזמן היצירה). קוד ה-React משתמש כעת ב-.maybeSingle() וביוצר שורת פרופיל
-- חסרה אוטומטית אם צריך - אבל זה דורש הרשאת INSERT שעדיין לא קיימת ב-RLS.
-- המדיניות הבאה מתירה למשתמש ליצור אך ורק את שורת הפרופיל של עצמו,
-- ורק עם role='technician' (לא ניתן לקבוע לעצמו 'admin' מהקליינט).
-- ============================================================

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles
  for insert
  with check (id = auth.uid() and role = 'technician');

-- ============================================================
-- לאחר הרצת המיגרציה: ודאו שהמשתמש המורשה שלכם מוגדר כמנהל
-- (אם עדיין לא רץ, ריצו את זה גם - בטוח להריץ שוב):
-- ============================================================
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'adlimportltd25@gmail.com');
