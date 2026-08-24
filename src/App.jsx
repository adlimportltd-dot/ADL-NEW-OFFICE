-- ============================================================
-- אדל אימפורט - מיגרציה v13: מודול CRM (לקוחות, לידים, הצעות מחיר)
-- ============================================================
-- הרצה: Supabase Dashboard -> SQL Editor -> הדבק והרץ.
-- בטוח להריץ שוב - כל שלב מוגן ב-IF NOT EXISTS / DROP...IF EXISTS.
-- ============================================================

-- ---------- הרחבת טבלת הלקוחות הקיימת (לא נוצרת טבלה כפולה) ----------
do $$ begin
  create type client_type as enum ('private', 'business');
exception when duplicate_object then null;
end $$;

alter table customers add column if not exists phone text;
alter table customers add column if not exists email text;
alter table customers add column if not exists client_type client_type not null default 'private';

-- ---------- לידים ומשפך מכירות ----------
do $$ begin
  create type lead_status as enum ('new', 'contacted', 'quote_sent', 'awaiting_approval', 'closed_won', 'closed_lost');
exception when duplicate_object then null;
end $$;

create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  email text,
  customer_id uuid references customers(id) on delete set null,
  status lead_status not null default 'new',
  source text,
  estimated_value numeric,
  notes text,
  follow_up_date date,
  created_at timestamptz not null default now()
);
create index if not exists leads_status_idx on leads (status);

-- ---------- הצעות מחיר ----------
do $$ begin
  create type quote_status as enum ('draft', 'sent', 'accepted', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists quotes (
  id uuid primary key default uuid_generate_v4(),
  quote_number text not null unique,
  customer_id uuid references customers(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  status quote_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists quote_lines (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references quotes(id) on delete cascade,
  item_id uuid not null references items(id),
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0)
);
create index if not exists quote_lines_quote_idx on quote_lines (quote_id);

-- ---------- RLS ----------
alter table leads enable row level security;
alter table quotes enable row level security;
alter table quote_lines enable row level security;

drop policy if exists "read leads" on leads;
create policy "read leads" on leads for select using (auth.role() = 'authenticated');
drop policy if exists "write leads" on leads;
create policy "write leads" on leads for insert with check (auth.role() = 'authenticated');
drop policy if exists "update leads" on leads;
create policy "update leads" on leads for update using (auth.role() = 'authenticated');
drop policy if exists "admin delete leads" on leads;
create policy "admin delete leads" on leads for delete using (is_admin());

drop policy if exists "read quotes" on quotes;
create policy "read quotes" on quotes for select using (auth.role() = 'authenticated');
drop policy if exists "write quotes" on quotes;
create policy "write quotes" on quotes for insert with check (auth.role() = 'authenticated');
drop policy if exists "update quotes" on quotes;
create policy "update quotes" on quotes for update using (auth.role() = 'authenticated');
drop policy if exists "admin delete quotes" on quotes;
create policy "admin delete quotes" on quotes for delete using (is_admin());

drop policy if exists "read quote_lines" on quote_lines;
create policy "read quote_lines" on quote_lines for select using (auth.role() = 'authenticated');
drop policy if exists "write quote_lines" on quote_lines;
create policy "write quote_lines" on quote_lines for insert with check (auth.role() = 'authenticated');
