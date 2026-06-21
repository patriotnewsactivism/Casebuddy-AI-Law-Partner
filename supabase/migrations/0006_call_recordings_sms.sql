-- Migration 0006: call_recordings and sms_messages tables

create table if not exists public.call_recordings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  call_sid       text not null unique,
  recording_sid  text,
  recording_url  text,
  duration       integer default 0,
  from_number    text not null default '',
  to_number      text not null default '',
  transcript     text default '',
  summary        text default '',
  key_facts      jsonb default '[]',
  status         text default 'completed',
  case_id        uuid,
  metadata       jsonb default '{}'
);

create index if not exists call_recordings_from_idx on public.call_recordings (from_number);
create index if not exists call_recordings_created_idx on public.call_recordings (created_at desc);

alter table public.call_recordings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'call_recordings' and policyname = 'call_recordings_open') then
    execute 'create policy "call_recordings_open" on public.call_recordings for all using (true) with check (true)';
  end if;
end $$;
grant all on public.call_recordings to anon, authenticated, service_role;

-- SMS messages table
create table if not exists public.sms_messages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  message_sid  text,
  from_number  text not null default '',
  to_number    text not null default '',
  body         text not null default '',
  direction    text not null check (direction in ('inbound','outbound')),
  status       text default 'delivered',
  metadata     jsonb default '{}'
);

create index if not exists sms_from_idx on public.sms_messages (from_number);
create index if not exists sms_created_idx on public.sms_messages (created_at desc);

alter table public.sms_messages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sms_messages' and policyname = 'sms_messages_open') then
    execute 'create policy "sms_messages_open" on public.sms_messages for all using (true) with check (true)';
  end if;
end $$;
grant all on public.sms_messages to anon, authenticated, service_role;
