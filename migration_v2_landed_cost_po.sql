-- ============================================================
-- אדל אימפורט (ADL Import LTD) - מיגרציה נוספת (v2)
-- מודולים: Landed Cost, דוחות/חיזוי, הזמנות רכש (PO), הגדרות/לוגו
-- ============================================================
-- הרצה: אחרי schema.sql הראשי. Supabase Dashboard -> SQL Editor -> הדבק והרץ.
-- בטוח להריץ גם אם חלק כבר קיים (שימוש ב-if not exists בכל מקום אפשרי).
-- ============================================================

-- ---------- עלות נחיתה ליחידה על כל פריט ----------
alter table items add column if not exists unit_cost numeric;

-- ---------- ספקים ----------
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  country text not null,
  contact text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- ---------- הזמנות רכש ----------
create type po_status as enum ('draft', 'sent', 'confirmed', 'received', 'cancelled');

create table if not exists purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  po_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  status po_status not null default 'draft',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists po_lines (
  id uuid primary key default uuid_generate_v4(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id),
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0)
);
create index if not exists po_lines_po_idx on po_lines (po_id);

-- ---------- הגדרות כלליות (כרגע: לוגו החברה) ----------
create table if not exists app_settings (
  key text primary key,
  value text
);
insert into app_settings (key, value) values ('logo_url', null), ('company_settings', null)
  on conflict (key) do nothing;

-- ---------- RLS ----------
alter table suppliers enable row level security;
alter table purchase_orders enable row level security;
alter table po_lines enable row level security;
alter table app_settings enable row level security;

drop policy if exists "read suppliers" on suppliers;
create policy "read suppliers" on suppliers for select using (auth.role() = 'authenticated');
drop policy if exists "admin write suppliers" on suppliers;
create policy "admin write suppliers" on suppliers for insert with check (is_admin());
drop policy if exists "admin update suppliers" on suppliers;
create policy "admin update suppliers" on suppliers for update using (is_admin());

drop policy if exists "read po" on purchase_orders;
create policy "read po" on purchase_orders for select using (auth.role() = 'authenticated');
drop policy if exists "admin write po" on purchase_orders;
create policy "admin write po" on purchase_orders for insert with check (is_admin());
drop policy if exists "admin update po" on purchase_orders;
create policy "admin update po" on purchase_orders for update using (is_admin());

drop policy if exists "read po_lines" on po_lines;
create policy "read po_lines" on po_lines for select using (auth.role() = 'authenticated');
drop policy if exists "admin write po_lines" on po_lines;
create policy "admin write po_lines" on po_lines for insert with check (is_admin());

drop policy if exists "read settings" on app_settings;
create policy "read settings" on app_settings for select using (true); -- ציבורי בכוונה: מאפשר הצגת לוגו במסך ההתחברות לפני אימות
drop policy if exists "admin write settings" on app_settings;
create policy "admin write settings" on app_settings for update using (is_admin());

-- ---------- Seed: ספקים לדוגמה (סין וצרפת) ----------
insert into suppliers (name, country, contact, phone, email) values
  ('Guangzhou Icon Electronics Co., Ltd.', 'China', 'Mr. Li Wei', '+86 20 1234 5678', 'sales@iconelectronics.cn'),
  ('Paris Essence Import SARL', 'France', 'Mme. Claire Dubois', '+33 1 23 45 67 89', 'contact@parisessence.fr')
on conflict do nothing;
