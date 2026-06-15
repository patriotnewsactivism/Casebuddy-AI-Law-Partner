-- CaseBuddy intake pipeline table.
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run),
-- or via `supabase db push` if you use the CLI.

create extension if not exists "pgcrypto";

create table if not exists public.intake_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null default 'Prospective Client',
  contact text default '',
  matter_type text default 'General Inquiry',
  jurisdiction text default '',
  summary text default '',
  score int not null default 0,
  disposition text not null default 'review',   -- accepted | review | denied
  status text not null default 'new',            -- new | accepted | denied | routed
  recommended_department text default '',
  recommended_agent_id text default '',
  urgency text default 'medium',                 -- low | medium | high
  intake jsonb not null default '{}'::jsonb,
  score_detail jsonb not null default '{}'::jsonb,
  transcript jsonb not null default '[]'::jsonb
);

create index if not exists intake_cases_created_at_idx
  on public.intake_cases (created_at desc);

-- Row-level security.
alter table public.intake_cases enable row level security;

-- A prospect (anon) submitting an intake link needs to INSERT.
drop policy if exists "anon can submit intake" on public.intake_cases;
create policy "anon can submit intake"
  on public.intake_cases for insert
  to anon, authenticated
  with check (true);

-- The firm dashboard (also using the anon key in this single-tenant app) needs
-- to READ and UPDATE workflow status. Tighten these to authenticated-only or a
-- firm_id check when you add real auth / multi-tenancy.
drop policy if exists "read intakes" on public.intake_cases;
create policy "read intakes"
  on public.intake_cases for select
  to anon, authenticated
  using (true);

drop policy if exists "update intake status" on public.intake_cases;
create policy "update intake status"
  on public.intake_cases for update
  to anon, authenticated
  using (true)
  with check (true);

-- Enable realtime so new intakes stream into the dashboard live.
alter publication supabase_realtime add table public.intake_cases;
