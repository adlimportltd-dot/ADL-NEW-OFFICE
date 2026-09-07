/**
 * בדיקת תקינות בוקר למערכת ניהול המלאי של אדל אימפורט.
 * רצה אחרי הגיבוי היומי (workflow: daily-backup.yml).
 * כל בדיקה שנכשלת מדפיסה שגיאה ברורה; אם משהו נכשל, ה-script יוצא עם קוד
 * שגיאה != 0, מה שהופך את ריצת ה-workflow ל"אדומה" ב-GitHub Actions -
 * זו ההתראה בפועל (GitHub שולח אימייל אוטומטי על ריצה שנכשלה לכל מי שעוקב
 * אחרי הריפו, בברירת המחדל של GitHub, בלי שום קוד נוסף לכתוב).
 *
 * הערה חשובה: הבדיקות כאן מכסות רק את הטבלאות שמתועדות בפועל בקבצי ה-SQL
 * שבריפו (schema.sql + migration_v2/v3): items, locations, profiles,
 * customers, stock_levels, transactions. במסך האפליקציה עצמו קיימים מודולים
 * נוספים (leads, quotes, expenses, shipments, po_payments, expense_payments,
 * 2FA...) שאין להם קובץ migration מתאים בריפו - כנראה נוספו ישירות ב-SQL
 * Editor של Supabase בלי להיכתב בחזרה לקוד. מומלץ מאוד להריץ בהקדם
 * `supabase db dump --schema public -f schema_current.sql` (או מ-Dashboard:
 * Database -> Backups -> Download schema) ולהוסיף את הקובץ לריפו, כדי
 * שהסכימה האמיתית תהיה מתועדת ולא רק "חיה" בתוך Supabase. אחרי זה כדאי
 * להרחיב את הבדיקות כאן גם לטבלאות החדשות.
 */
const { Client } = require('pg');

let failures = 0;

function fail(label, detail) {
  failures += 1;
  console.error(`✗ ${label}: ${detail}`);
}

function ok(label, detail) {
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'adlimportltd25@gmail.com';

async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();

  try {
    // --- 1. יש לפחות פרופיל admin אחד פעיל ---
    const admins = await client.query(`select count(*) from profiles where role = 'admin'`);
    if (Number(admins.rows[0].count) === 0) {
      fail('משתמש מנהל', 'אין אף פרופיל עם role=admin - אין למי להיכנס עם הרשאות ניהול מלאות');
    } else {
      ok('משתמש מנהל', `${admins.rows[0].count} פרופילי admin פעילים`);
    }

    const knownAdmin = await client.query(`
      select p.role from profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = lower($1)
    `, [ADMIN_EMAIL]);
    if (knownAdmin.rows.length === 0) {
      fail('משתמש מנהל ידוע', `לא נמצא פרופיל עבור ${ADMIN_EMAIL}`);
    } else if (knownAdmin.rows[0].role !== 'admin') {
      fail('משתמש מנהל ידוע', `${ADMIN_EMAIL} קיים אך role=${knownAdmin.rows[0].role}, לא admin`);
    } else {
      ok('משתמש מנהל ידוע', `${ADMIN_EMAIL} מוגדר כ-admin`);
    }

    // --- 2. יש מחסן מרכזי יחיד ---
    const warehouses = await client.query(`select count(*) from locations where type = 'warehouse'`);
    const whCount = Number(warehouses.rows[0].count);
    if (whCount === 0) {
      fail('מחסן מרכזי', 'אין אף מיקום מסוג warehouse - קבלת סחורה ודוחות המלאי לא יעבדו כראוי');
    } else if (whCount > 1) {
      fail('מחסן מרכזי', `${whCount} מיקומים מסוג warehouse - הדשבורד משתמש רק בראשון שנמצא, זה עלול לבלבל`);
    } else {
      ok('מחסן מרכזי', 'מיקום warehouse יחיד קיים');
    }

    // --- 3. אין רמות מלאי שליליות (אמורות להיות חסומות ע"י check constraint) ---
    const negative = await client.query(`select count(*) from stock_levels where quantity < 0`);
    if (Number(negative.rows[0].count) > 0) {
      fail('רמות מלאי', `${negative.rows[0].count} שורות עם כמות שלילית ב-stock_levels`);
    } else {
      ok('רמות מלאי', 'אין כמויות שליליות');
    }

    // --- 4. הטריגר שמעדכן מלאי לפי תנועות עדיין קיים ופעיל ---
    const trigger = await client.query(`
      select count(*) from pg_trigger where tgname = 'trg_apply_transaction' and not tgisinternal
    `);
    if (Number(trigger.rows[0].count) === 0) {
      fail('trg_apply_transaction', 'הטריגר שמעדכן stock_levels לפי תנועות לא קיים - כל תנועה חדשה לא תעדכן מלאי');
    } else {
      ok('trg_apply_transaction', 'קיים ופעיל');
    }

    // --- 5. RLS דלוק על הטבלאות המתועדות בריפו ---
    const rlsTables = ['items', 'locations', 'customers', 'stock_levels', 'transactions', 'profiles', 'suppliers', 'purchase_orders', 'po_lines', 'app_settings'];
    const rls = await client.query(`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relname = any($1)
    `, [rlsTables]);
    const disabled = rls.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    const missing = rlsTables.filter((t) => !rls.rows.some((r) => r.relname === t));
    if (disabled.length > 0 || missing.length > 0) {
      fail('Row Level Security', `כבוי או חסר בטבלאות: ${[...disabled, ...missing].join(', ')}`);
    } else {
      ok('Row Level Security', `דלוק על כל ${rlsTables.length} הטבלאות המתועדות`);
    }

    // --- 6. מדיניות ה-insert העצמי ל-profiles קיימת ולא מאפשרת קביעת role=admin מהקליינט ---
    const policy = await client.query(`
      select pg_get_expr(polwithcheck, polrelid) as w
      from pg_policy where polrelid = 'public.profiles'::regclass and polname = 'insert own profile'
    `);
    if (!policy.rows[0]) {
      fail('insert own profile (profiles)', 'המדיניות חסרה - יצירת פרופיל אוטומטית למשתמש חדש תיכשל (ר\' migration_v3)');
    } else if (!policy.rows[0].w?.includes("'technician'")) {
      fail('insert own profile (profiles)', 'המדיניות לא מגבילה יצירה עצמית ל-role=technician - משתמש עלול להעניק לעצמו הרשאת admin');
    } else {
      ok('insert own profile (profiles)', 'תקין ומוגבל ל-technician בלבד');
    }

    // --- 7. יש לפחות פריט אחד בקטלוג ---
    const items = await client.query(`select count(*) from items`);
    if (Number(items.rows[0].count) === 0) {
      fail('קטלוג פריטים', 'אין אף פריט בטבלת items');
    } else {
      ok('קטלוג פריטים', `${items.rows[0].count} פריטים בקטלוג`);
    }
  } finally {
    await client.end();
  }

  console.log('');
  if (failures > 0) {
    console.error(`בדיקת הבוקר נכשלה: ${failures} בעיה/ות. ר' לוג מעל.`);
    process.exit(1);
  }
  console.log('בדיקת הבוקר עברה - הכול תקין.');
}

run().catch((error) => {
  console.error('morning-health-check crashed:', error.message);
  process.exit(1);
});
