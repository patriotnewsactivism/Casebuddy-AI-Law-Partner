-- Migration 0005: firm_emails table for inbound/outbound email tracking
-- Run in Supabase Dashboard → SQL Editor

create table if not exists public.firm_emails (
  id            uuid primary key default gen_random_uuid(),
  received_at   timestamptz not null default now(),
  direction     text not null check (direction in ('inbound', 'outbound')),
  from_address  text not null default '',
  from_name     text not null default '',
  to_address    text not null default '',
  agent_id      text not null default 'maya',
  subject       text not null default '',
  body          text not null default '',
  intent        text not null default 'general',
  replied       boolean not null default false,
  read          boolean not null default false,
  starred       boolean not null default false,
  thread_id     uuid,
  metadata      jsonb not null default '{}'
);

create index if not exists firm_emails_agent_idx     on public.firm_emails (agent_id);
create index if not exists firm_emails_direction_idx on public.firm_emails (direction);
create index if not exists firm_emails_received_idx  on public.firm_emails (received_at desc);

alter table public.firm_emails enable row level security;
create policy "firm_emails_open" on public.firm_emails for all using (true) with check (true);

-- Grant access
grant all on public.firm_emails to anon, authenticated, service_role;
