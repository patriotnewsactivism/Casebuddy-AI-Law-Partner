-- CaseBuddy Agent Infrastructure Tables
-- Run in Supabase SQL editor: Dashboard → SQL → New query → Run
-- Or via: supabase db push

-- ── agent_deadlines ──────────────────────────────────────────────────────────
-- Sol reads from this table in the daily cron.
-- Frontend syncs localStorage deadlines here on load.

create table if not exists public.agent_deadlines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  firm_id text not null default 'default',
  case_title text not null default '',
  label text not null default '',
  type text not null default 'filing-deadline',
  due_date date not null,
  reminder_days int not null default 7,
  notes text default '',
  completed boolean not null default false,
  completed_at timestamptz,
  alert_sent boolean not null default false,
  alert_sent_at timestamptz
);

create index if not exists agent_deadlines_firm_id_idx on public.agent_deadlines (firm_id);
create index if not exists agent_deadlines_due_date_idx on public.agent_deadlines (due_date);
create index if not exists agent_deadlines_completed_idx on public.agent_deadlines (completed) where completed = false;

alter table public.agent_deadlines enable row level security;
create policy "deadlines_firm_access" on public.agent_deadlines
  for all using (true) with check (true);

alter publication supabase_realtime add table public.agent_deadlines;


-- ── agent_cron_logs ──────────────────────────────────────────────────────────
-- Audit trail of every background agent run

create table if not exists public.agent_cron_logs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz default now() not null,
  job text not null,
  log text default '',
  cases_loaded int default 0,
  deadlines_checked int default 0,
  alerts_sent int default 0,
  emails_sent int default 0,
  error text default null
);

create index if not exists agent_cron_logs_ran_at_idx on public.agent_cron_logs (ran_at desc);
create index if not exists agent_cron_logs_job_idx on public.agent_cron_logs (job);

alter table public.agent_cron_logs enable row level security;
create policy "cron_logs_service_role" on public.agent_cron_logs
  for all to service_role using (true) with check (true);
-- Authenticated users can read logs (for the Settings → Agent Logs panel)
create policy "cron_logs_read" on public.agent_cron_logs
  for select to authenticated using (true);


-- ── agent_research_flags ─────────────────────────────────────────────────────
-- Lex processes these overnight — attorneys flag cases for research

create table if not exists public.agent_research_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  firm_id text not null default 'default',
  case_id text not null,
  case_title text not null default '',
  query text not null,
  researched boolean not null default false,
  results text default null,
  updated_at timestamptz default now()
);

create index if not exists research_flags_firm_idx on public.agent_research_flags (firm_id);
create index if not exists research_flags_researched_idx on public.agent_research_flags (researched) where researched = false;

alter table public.agent_research_flags enable row level security;
create policy "research_flags_access" on public.agent_research_flags
  for all using (true) with check (true);


-- ── agent_notifications ──────────────────────────────────────────────────────
-- In-app notification bell (future use)

create table if not exists public.agent_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  firm_id text not null default 'default',
  agent_id text not null,
  title text not null,
  body text not null,
  type text not null default 'info',  -- info | warning | error | success
  read boolean not null default false,
  link text default null
);

create index if not exists notifications_firm_idx on public.agent_notifications (firm_id);
create index if not exists notifications_read_idx on public.agent_notifications (read) where read = false;

alter table public.agent_notifications enable row level security;
create policy "notifications_access" on public.agent_notifications
  for all using (true) with check (true);

alter publication supabase_realtime add table public.agent_notifications;
