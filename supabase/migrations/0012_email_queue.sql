-- ============================================================================
-- CaseBuddy: Email Queue Table
-- Supports the send-pending-emails cron job for agent-initiated emails.
-- ============================================================================

create table if not exists email_queue (
  id uuid default gen_random_uuid() primary key,
  agent_id text not null default 'system',
  to_email text not null,
  subject text not null,
  body_html text,
  body_text text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  case_id text,
  firm_id text,
  created_at timestamptz default now(),
  sent_at timestamptz
);

create index if not exists idx_email_queue_status on email_queue(status);
create index if not exists idx_email_queue_created on email_queue(created_at);

-- Row Level Security
alter table email_queue enable row level security;

-- Service role (cron jobs) can do anything; authenticated users can queue emails for their firm
create policy "Service role full access" on email_queue
  for all using (true) with check (true);
