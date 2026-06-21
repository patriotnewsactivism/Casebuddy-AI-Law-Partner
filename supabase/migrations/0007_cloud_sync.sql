-- Migration 0007: Cloud-first sync — replaces localStorage
-- Tables: deadlines, foia_requests, agent_tasks, firm_reports
-- Run in Supabase SQL editor → Dashboard → SQL → New query → Run

-- ── DEADLINES ────────────────────────────────────────────────────────────────
create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  firm_id text not null default 'default',
  case_id text default '',
  case_name text not null default '',
  deadline_type text not null default 'filing',
  title text not null default '',
  due_date date not null,
  priority text not null default 'medium',
  status text not null default 'pending',
  notes text default '',
  assigned_agent text default 'sol',
  reminder_sent boolean not null default false
);
create index if not exists deadlines_firm_id_idx on public.deadlines (firm_id);
create index if not exists deadlines_due_date_idx on public.deadlines (due_date asc);
alter table public.deadlines enable row level security;
drop policy if exists "deadlines_all" on public.deadlines;
create policy "deadlines_all" on public.deadlines for all to anon, authenticated using (true) with check (true);
alter publication supabase_realtime add table public.deadlines;
create trigger set_deadlines_updated_at before update on public.deadlines
  for each row execute function public.handle_updated_at();

-- ── FOIA REQUESTS ────────────────────────────────────────────────────────────
create table if not exists public.foia_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  firm_id text not null default 'default',
  case_id text default '',
  requester_name text not null default '',
  agency text not null default '',
  request_date date not null default now(),
  subject text not null default '',
  description text default '',
  status text not null default 'submitted',
  tracking_number text default '',
  due_date date,
  response_received boolean not null default false,
  response_date date,
  documents_received int default 0,
  notes text default '',
  assigned_agent text default 'sierra'
);
create index if not exists foia_firm_id_idx on public.foia_requests (firm_id);
create index if not exists foia_status_idx on public.foia_requests (status);
alter table public.foia_requests enable row level security;
drop policy if exists "foia_all" on public.foia_requests;
create policy "foia_all" on public.foia_requests for all to anon, authenticated using (true) with check (true);
alter publication supabase_realtime add table public.foia_requests;
create trigger set_foia_updated_at before update on public.foia_requests
  for each row execute function public.handle_updated_at();

-- ── AGENT WORKFLOW TASKS ─────────────────────────────────────────────────────
create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  case_id text not null,
  intake_id uuid references public.intake_cases(id) on delete set null,
  agent_id text not null,
  task_type text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error text default ''
);
create index if not exists agent_tasks_case_id_idx on public.agent_tasks (case_id);
create index if not exists agent_tasks_status_idx on public.agent_tasks (status);
alter table public.agent_tasks enable row level security;
drop policy if exists "agent_tasks_all" on public.agent_tasks;
create policy "agent_tasks_all" on public.agent_tasks for all to anon, authenticated using (true) with check (true);
alter publication supabase_realtime add table public.agent_tasks;
create trigger set_agent_tasks_updated_at before update on public.agent_tasks
  for each row execute function public.handle_updated_at();

-- ── FIRM REPORTS ─────────────────────────────────────────────────────────────
create table if not exists public.firm_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  firm_id text not null default 'default',
  report_type text not null default 'full',
  case_id text default '',
  title text not null default '',
  generated_by text not null default 'system',
  sections jsonb not null default '[]'::jsonb,
  summary text default '',
  status text not null default 'complete',
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists firm_reports_firm_id_idx on public.firm_reports (firm_id);
create index if not exists firm_reports_created_at_idx on public.firm_reports (created_at desc);
create index if not exists firm_reports_case_id_idx on public.firm_reports (case_id);
alter table public.firm_reports enable row level security;
drop policy if exists "firm_reports_all" on public.firm_reports;
create policy "firm_reports_all" on public.firm_reports for all to anon, authenticated using (true) with check (true);