# אדל אימפורט — מערכת ניהול מלאי ועסק

ניהול מלאי מכשירים ומתכלים, מיקומים (מחסן/רכבים), לקוחות, לידים והצעות מחיר,
הזמנות רכש ותשלומים, הוצאות, משלוחים ועלויות נחיתה. React + Tailwind +
Supabase (כולל 2FA/TOTP), ממשק עברי מלא (RTL).

---

## ⚠️ פער חשוב שהתגלה בסריקה: הסכימה בריפו לא מעודכנת

הקוד באפליקציה (`src/App.jsx`) משתמש בטבלאות ועמודות כמו `leads`, `quotes`,
`shipments`, `shipping_rate_cards`, `po_payments`, `expenses`,
`expense_payments`, וכן עמודות כמו `supplier_sku`, `fragrance_group`,
`payment_terms`, `deposit_percent`, `net_days`, `due_date` על טבלאות קיימות —
**אף אחת מהן לא מופיעה ב-`schema.sql` או בשתי המיגרציות שבריפו.** כנראה
שהשינויים האלה בוצעו ישירות ב-Supabase SQL Editor ולא נשמרו בחזרה לקוד.

המשמעות: **אם בסיס הנתונים אי-פעם ילך לאיבוד, הקבצים שבריפו הזה לא מספיקים
כדי לשחזר אותו** — הם ישחזרו רק גרסה ישנה בלי כל המודולים האלה.

**מומלץ בחום לפני כל דבר אחר:**
```bash
supabase link --project-ref <ה-project-ref האמיתי>
supabase db dump --schema public -f schema_current.sql
```
(או מ-Supabase Dashboard: **Database → Backups → Download schema**), ואז
להוסיף את הקובץ לריפו ב-commit נפרד. ה-GitHub Action היומי (ראו למטה) כבר
מייצר `pg_dump` מלא כל בוקר כרשת ביטחון בינתיים, אבל זה לא תחליף לתיעוד
הסכימה בקוד עצמו.

---

## תיקון אבטחה שבוצע בסריקה הזו

בקובץ `src/App.jsx`, ה-`useEffect` שטוען את כל נתוני העסק (`loadEverything`)
ונרשם לעדכוני Realtime היה תלוי רק ב-`session`, לא ב-`mfaPendingFactorId`.
המשמעות: **אצל משתמש עם 2FA מופעל, ברגע שהסיסמה מאומתת (אבל לפני הזנת קוד
ה-2FA), הדפדפן כבר היה שולף בפועל את כל נתוני המלאי/הלקוחות/הכספים דרך ה-API
של Supabase ברקע** — ומסך "הזן קוד 2FA" רק הסתיר את זה מבחינה ויזואלית, לא
מנע את קריאת המידע בפועל. תוקן כך שהטעינה וההרשמה ל-Realtime ממתינות
במפורש לסיום אימות ה-2FA (ר' commit).

**המלצת המשך:** התיקון הזה הוא ברמת הלקוח (React) בלבד. ההגנה האמיתית
צריכה להיות גם ברמת ה-RLS ב-Postgres — כלומר שהמדיניות (policies) על
הטבלאות הרגישות ידרשו `(auth.jwt() ->> 'aal') = 'aal2'` עבור כל משתמש עם
פקטור TOTP רשום, כדי שגם קריאת API ישירה (לא רק דרך המסך) תיחסם לפני 2FA.
כדאי לבדוק את זה מול הסכימה האמיתית לאחר שתדמפו אותה (ר' סעיף למעלה).

---

## הפעלה מקומית

### 1. בסיס הנתונים

הקבצים המתועדים בריפו (`schema.sql` → `migration_v2_landed_cost_po.sql` →
`migration_v3_fix_missing_profile.sql`, בסדר הזה) יוצרים רק את הגרסה
הבסיסית של המערכת. **הם לא מספיקים להקמת עותק זהה לסביבת הפרודקשן** עד
שתדמפו ותוסיפו את הסכימה האמיתית כמתואר למעלה.

### 2. מפתחות

```bash
cp .env.example .env
```

מלאו את שני הערכים מ-Supabase (**Project Settings → API**):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> **רק המפתח `anon public`.** מפתח `service_role` עוקף את כל ה-RLS ואסור
> שיגיע לכאן. לעולם אל תעלו קובץ `.env` עם ערכים אמיתיים ל-Git — הוא
> ב-`.gitignore`.

### 3. הרצה

```bash
npm install
npm run dev      # http://localhost:5173
```

התחברות דרך מסך login אמיתי (לא התחברות אוטומטית) — עם אפשרות 2FA/TOTP
למי שהפעיל אותו דרך מסך ההגדרות.

---

## הפעלה אוטומטית דרך GitHub (גיבוי יומי + בדיקת תקינות)

הריפו (`ADL-NEW-OFFICE`) וחיבור ה-Vercel כבר קיימים ומוגדרים. כל `git push`
ל-`main` מפרסם גרסה חדשה אוטומטית דרך Vercel — אין צורך בפעולה נוספת מעבר
לכך. מה שנוסף כאן זה שכבת **גיבוי + ניטור**, בדיוק כמו במערכת ICON AIR:

### הגדרת ה-Secrets (חד-פעמי)

ב-GitHub: **Settings → Secrets and variables → Actions** בריפו:

- **Secret** בשם `SUPABASE_DB_URL` — מחרוזת החיבור הישירה למסד הנתונים
  (Supabase Dashboard → Project Settings → Database → Connection string →
  URI, עם סיסמת מסד הנתונים - **לא** מפתח ה-anon, וגם לא אותה סיסמה כמו
  משתמשי האפליקציה).
- **Variable** (לא Secret) בשם `ADMIN_EMAIL` עם הערך
  `adlimportltd25@gmail.com` — לשימוש בדיקת התקינות בלבד.

### מה קורה כל בוקר

`.github/workflows/daily-backup.yml` רץ כל יום ב-05:00 UTC (≈08:00 בישראל):
מבצע `pg_dump` מלא (סכימה + נתונים) ושומר כ-Artifact לריפו (נשמר 90 יום,
ניתן להוריד מלשונית Actions), ואז מריץ `scripts/morning-health-check.cjs`.
אם בדיקה נכשלת, הריצה מסומנת אדומה ו-GitHub שולח מייל אוטומטי לכל מי שעוקב
אחרי הריפו — בלי הגדרת שירות התראות נוסף. אפשר גם להריץ ידנית דרך
**Actions → Daily Backup & Morning Health Check → Run workflow**.

שימו לב: בדיקת התקינות הנוכחית מכסה רק את הטבלאות המתועדות ב-`schema.sql`
(items, locations, profiles, stock_levels, transactions). מומלץ להרחיב
אותה למודולים החדשים (leads/quotes/expenses/shipments) לאחר שתשלימו את
דמפ הסכימה האמיתית.

### פרסום שינויי קוד

```bash
git add .
git commit -m "תיאור השינוי"
git push
```

Vercel מזהה את ה-push ומפרסם גרסה חדשה לבד תוך דקה-שתיים.
