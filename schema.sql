-- ============================================================
-- אדל אימפורט (ADL Import LTD) - סכימת מסד נתונים לניהול מלאי
-- Supabase / PostgreSQL - גרסה סופית
-- ============================================================
-- הרצה: Supabase Dashboard -> SQL Editor -> New query -> הדבק והרץ (Run)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type item_category as enum ('device', 'consumable');
create type location_type as enum ('warehouse', 'vehicle');
create type transaction_type as enum ('receive', 'transfer', 'install', 'return', 'writeoff');
create type item_condition as enum ('ok', 'faulty');
create type user_role as enum ('admin', 'technician');

-- ---------- Locations ----------
create table locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type location_type not null,
  created_at timestamptz not null default now()
);
create unique index locations_name_unique on locations (name);

-- ---------- Profiles (משתמשים + תפקיד) ----------
-- נוצר אוטומטית בעת הרשמת משתמש חדש דרך auth.users (ראה טריגר בהמשך)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'technician',
  location_id uuid references locations(id),  -- הרכב המשויך לטכנאי (ריק עבור מנהל)
  created_at timestamptz not null default now()
);

-- ---------- Items (קטלוג) ----------
create table items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category item_category not null,
  model text,
  color text,
  unit text not null,
  min_threshold numeric not null default 0,
  created_at timestamptz not null default now()
);
create unique index items_name_unique on items (name);
create index items_category_idx on items (category);

-- ---------- Customers ----------
create table customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  contact text,
  created_at timestamptz not null default now()
);

-- ---------- Stock levels ----------
create table stock_levels (
  item_id uuid not null references items(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  quantity numeric not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id)
);

-- ---------- Transactions (Audit Log - append only) ----------
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  type transaction_type not null,
  item_id uuid not null references items(id),
  qty numeric not null check (qty > 0),
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  customer_id uuid references customers(id),
  condition item_condition,
  note text,
  performed_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index transactions_item_idx on transactions (item_id);
create index transactions_customer_idx on transactions (customer_id);
create index transactions_created_idx on transactions (created_at desc);
create index transactions_type_idx on transactions (type);

-- ============================================================
-- טריגר: יצירת פרופיל אוטומטית לכל משתמש חדש שנרשם
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'technician');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- טריגר: עדכון אוטומטי של stock_levels לפי כל תנועה שנרשמת
-- ============================================================
create or replace function apply_transaction_to_stock()
returns trigger as $$
begin
  if new.type = 'receive' then
    insert into stock_levels (item_id, location_id, quantity)
    values (new.item_id, new.to_location_id, new.qty)
    on conflict (item_id, location_id)
    do update set quantity = stock_levels.quantity + new.qty, updated_at = now();

  elsif new.type = 'transfer' then
    update stock_levels set quantity = quantity - new.qty, updated_at = now()
      where item_id = new.item_id and location_id = new.from_location_id;
    insert into stock_levels (item_id, location_id, quantity)
    values (new.item_id, new.to_location_id, new.qty)
    on conflict (item_id, location_id)
    do update set quantity = stock_levels.quantity + new.qty, updated_at = now();

  elsif new.type = 'install' then
    update stock_levels set quantity = quantity - new.qty, updated_at = now()
      where item_id = new.item_id and location_id = new.from_location_id;

  elsif new.type = 'return' and new.condition = 'ok' then
    insert into stock_levels (item_id, location_id, quantity)
    values (new.item_id, new.to_location_id, new.qty)
    on conflict (item_id, location_id)
    do update set quantity = stock_levels.quantity + new.qty, updated_at = now();

  elsif new.type = 'writeoff' then
    update stock_levels set quantity = quantity - new.qty, updated_at = now()
      where item_id = new.item_id and location_id = new.from_location_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_apply_transaction
  after insert on transactions
  for each row execute function apply_transaction_to_stock();

-- ============================================================
-- Helper: בדיקת תפקיד המשתמש המחובר
-- ============================================================
create or replace function is_admin()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;

create or replace function my_location_id()
returns uuid as $$
  select location_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table items enable row level security;
alter table locations enable row level security;
alter table customers enable row level security;
alter table stock_levels enable row level security;
alter table transactions enable row level security;
alter table profiles enable row level security;

-- profiles: כל משתמש רואה ועורך רק את עצמו; מנהל רואה הכל
create policy "read own profile" on profiles for select using (id = auth.uid() or is_admin());
create policy "update own profile" on profiles for update using (id = auth.uid());
create policy "admin manage profiles" on profiles for all using (is_admin());

-- items / locations / customers: קריאה לכל מחובר, כתיבה למנהל בלבד
create policy "read items" on items for select using (auth.role() = 'authenticated');
create policy "admin write items" on items for insert with check (is_admin());
create policy "admin update items" on items for update using (is_admin());
create policy "admin delete items" on items for delete using (is_admin());

create policy "read locations" on locations for select using (auth.role() = 'authenticated');
create policy "admin write locations" on locations for insert with check (is_admin());
create policy "admin update locations" on locations for update using (is_admin());

create policy "read customers" on customers for select using (auth.role() = 'authenticated');
create policy "admin write customers" on customers for insert with check (is_admin());
create policy "admin update customers" on customers for update using (is_admin());

-- stock_levels: קריאה לכל מחובר (הדשבורד וניהול המלאי דורשים תמונה מלאה).
-- כתיבה מתבצעת אך ורק דרך הטריגר (security definer) - אין הרשאת כתיבה ישירה למשתמשים.
create policy "read stock" on stock_levels for select using (auth.role() = 'authenticated');

-- transactions: מנהל רואה הכל; טכנאי רואה/מוסיף רק תנועות שנוגעות למיקום (רכב) שלו
create policy "read transactions" on transactions for select using (
  is_admin()
  or from_location_id = my_location_id()
  or to_location_id = my_location_id()
);

create policy "insert transactions" on transactions for insert with check (
  is_admin()
  or from_location_id = my_location_id()
  or to_location_id = my_location_id()
);

-- ============================================================
-- Seed: קטלוג התחלתי - אדל אימפורט
-- ============================================================
insert into locations (name, type) values
  ('מחסן מרכזי', 'warehouse'),
  ('רכב טכנאי - צפון', 'vehicle'),
  ('רכב טכנאי - מרכז', 'vehicle');

insert into items (name, category, model, color, unit, min_threshold) values
  ('A car - לבן', 'device', 'A car', 'לבן', 'יחידה', 3),
  ('A car - שחור', 'device', 'A car', 'שחור', 'יחידה', 3),
  ('A pro car - שחור', 'device', 'A pro car', 'שחור', 'יחידה', 3),
  ('A pro car - כסוף', 'device', 'A pro car', 'כסוף', 'יחידה', 3),
  ('A pro car - זהב', 'device', 'A pro car', 'זהב', 'יחידה', 3),
  ('A 70 - לבן', 'device', 'A 70', 'לבן', 'יחידה', 3),
  ('A 70 - שחור', 'device', 'A 70', 'שחור', 'יחידה', 3),
  ('A 90 - לבן', 'device', 'A 90', 'לבן', 'יחידה', 3),
  ('A 90 - אפור', 'device', 'A 90', 'אפור', 'יחידה', 3),
  ('A 400 - שחור', 'device', 'A 400', 'שחור', 'יחידה', 3),
  ('A 400 - לבן', 'device', 'A 400', 'לבן', 'יחידה', 3),
  ('A 700 - לבן', 'device', 'A 700', 'לבן', 'יחידה', 3),
  ('A 700 - אפור', 'device', 'A 700', 'אפור', 'יחידה', 3);

insert into items (name, category, unit, min_threshold)
select 'תמצית ריח - ' || fragrance, 'consumable', 'ק"ג', 5
from unnest(array[
  'בראשית', 'פתאל', 'כרמים', 'אסטוריה', 'רויאל ביץ', 'הילטון', 'בלאק ונילה', 'בלאק יסמין',
  'דולצ׳ה', 'גרין תה', 'דיור', 'דלתא', 'ויקטוריה סיקרט', 'וניל מוסטנג', 'וניל קוקוס', 'וויט מאסק',
  'וניל פצ׳ולי', 'טום פורד', 'לבנדר', 'לטינו', 'לנור', 'מלון בוטיק דובאי', 'נאוטיקה', 'ספורט',
  'סרג׳וף', 'קדמא', 'קומבי', 'קסטרו', 'קריד', 'תומס 4', 'סקסי'
]) as fragrance;

-- ============================================================
-- לאחר הרצת הסקריפט: הפיכת המשתמש הראשון שלך למנהל (הרץ בנפרד,
-- אחרי שנרשמת פעם אחת דרך מסך ההתחברות של האפליקציה):
--
-- update profiles set role = 'admin' where id =
--   (select id from auth.users where email = 'YOUR_EMAIL_HERE');
-- ============================================================
