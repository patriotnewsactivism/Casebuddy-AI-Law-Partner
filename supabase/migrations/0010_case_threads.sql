-- Migration 0010: case_threads — 2-way attorney ↔ user communication
-- Every message is tied to a case, attributed to a sender (user or AI agent/attorney),
-- and carries enough metadata for the automation engine to dispatch the right AI employee.

create table if not exists public.case_threads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  firm_id         text not null default 'default',
  case_id         text not null,
  case_title      text not null default '',
  subject         text not null default '',
  status          text not null default 'open'   check (status in ('open','resolved','pending')),
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  participants    text[] not null default '{}',   -- agent ids + 'user'
  last_message_at timestamptz not null default now(),
  unread_count    int not null default 0,
  metadata        jsonb not null default '{}'
);

create index if not exists case_threads_case_idx    on public.case_threads (case_id);
create index if not exists case_threads_firm_idx    on public.case_threads (firm_id);
create index if not exists case_threads_status_idx  on public.case_threads (status);
create index if not exists case_threads_updated_idx on public.case_threads (updated_at desc);

alter table public.case_threads enable row level security;
create policy "case_threads_open" on public.case_threads for all using (true) with check (true);
alter publication supabase_realtime add table public.case_threads;

-- ── case_messages ────────────────────────────────────────────────────────────

create table if not exists public.case_messages (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  thread_id       uuid not null references public.case_threads(id) on delete cascade,
  case_id         text not null,
  firm_id         text not null default 'default',
  sender_type     text not null check (sender_type in ('user','agent','attorney')),
  sender_id       text not null,
  sender_name     text not null default '',
  direction       text not null check (direction in ('user_to_agent','agent_to_user')),
  body            text not null,
  read            boolean not null default false,
  triggers_automation   boolean not null default false,
  automation_target     text default null,
  automation_status     text not null default 'none' check (automation_status in ('none','queued','running','complete','error')),
  automation_result     text default null,
  attachment_url  text default null,
  attachment_name text default null,
  attachment_type text default null,
  metadata        jsonb not null default '{}'
);

create index if not exists case_messages_thread_idx  on public.case_messages (thread_id, created_at);
create index if not exists case_messages_case_idx    on public.case_messages (case_id);
create index if not exists case_messages_automation  on public.case_messages (automation_status) where automation_status in ('queued','running');
create index if not exists case_messages_unread_idx  on public.case_messages (read) where read = false;

alter table public.case_messages enable row level security;
create policy "case_messages_open" on public.case_messages for all using (true) with check (true);
alter publication supabase_realtime add table public.case_messages;

-- Auto-update thread on new message
create or replace function public.update_thread_on_message()
returns trigger language plpgsql as $$
begin
  update public.case_threads
  set updated_at = now(),
      last_message_at = now(),
      unread_count = unread_count + case when NEW.direction = 'agent_to_user' then 1 else 0 end
  where id = NEW.thread_id;
  return NEW;
end;
$$;

drop trigger if exists trg_thread_on_message on public.case_messages;
create trigger trg_thread_on_message
  after insert on public.case_messages
  for each row execute function public.update_thread_on_message();
