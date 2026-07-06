-- ============================================================================
-- CaseBuddy: Server-Side Orchestration Tables
-- Run this in Supabase SQL Editor BEFORE deploying the code update.
-- ============================================================================

-- Firm runs — one row per "Deploy the Firm" click
create table if not exists firm_runs (
  id uuid default gen_random_uuid() primary key,
  case_id text not null,
  user_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'error')),
  specialist_id text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Individual agent work products
create table if not exists work_products (
  id uuid default gen_random_uuid() primary key,
  run_id uuid not null references firm_runs(id) on delete cascade,
  task_id text not null,
  agent_id text not null,
  agent_name text not null,
  emoji text default '⚖️',
  color_class text default 'text-gold-400',
  title text not null,
  status text not null default 'queued'
    check (status in ('queued', 'working', 'done', 'error')),
  content text default '',
  started_at bigint,
  completed_at bigint,
  unique(run_id, task_id)
);

-- Indexes
create index if not exists idx_firm_runs_case_user on firm_runs(case_id, user_id);
create index if not exists idx_work_products_run_id on work_products(run_id);

-- Row Level Security
alter table firm_runs enable row level security;
alter table work_products enable row level security;

-- firm_runs policies
create policy "Users read own runs" on firm_runs
  for select using (auth.uid() = user_id);
create policy "Users insert own runs" on firm_runs
  for insert with check (auth.uid() = user_id);
create policy "Users update own runs" on firm_runs
  for update using (auth.uid() = user_id);

-- work_products policies (scoped through firm_runs ownership)
create policy "Users read own work products" on work_products
  for select using (
    exists (select 1 from firm_runs where firm_runs.id = work_products.run_id and firm_runs.user_id = auth.uid())
  );
create policy "Users insert own work products" on work_products
  for insert with check (
    exists (select 1 from firm_runs where firm_runs.id = work_products.run_id and firm_runs.user_id = auth.uid())
  );
create policy "Users update own work products" on work_products
  for update using (
    exists (select 1 from firm_runs where firm_runs.id = work_products.run_id and firm_runs.user_id = auth.uid())
  );

-- Full replica identity so Realtime sends complete rows on UPDATE
alter table work_products replica identity full;
alter table firm_runs replica identity full;

-- Enable Realtime
alter publication supabase_realtime add table work_products;
alter publication supabase_realtime add table firm_runs;
