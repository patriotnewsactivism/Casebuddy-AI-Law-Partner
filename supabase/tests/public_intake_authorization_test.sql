-- Standalone verification for the public intake authorization contract.
-- Runs on plain PostgreSQL 16 with minimal Supabase auth/storage stubs.
-- Roles anon/authenticated/service_role must exist before this file is run.
-- Every emitted T* line must end in PASS.

create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;

create or replace function public.get_user_firm_id() returns text
language sql stable as $$ select null::text $$;

create table if not exists public.firm_memberships (
  user_id uuid primary key default gen_random_uuid(),
  firm_id text not null,
  claimed_at timestamptz not null default now(),
  intake_token text unique
);

create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  firm_id text not null,
  token text not null unique,
  client_name text not null default '',
  client_email text not null default '',
  client_phone text not null default '',
  notes text not null default '',
  status text not null default 'pending',
  opened_at timestamptz,
  completed_at timestamptz,
  intake_case_id text
);

create table if not exists public.intake_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  firm_id text,
  client_invite_id uuid references public.client_invites(id),
  full_name text not null default 'Prospective Client',
  contact text default '',
  matter_type text default 'General Inquiry',
  jurisdiction text default '',
  summary text default '',
  score int not null default 0,
  disposition text not null default 'review',
  status text not null default 'new',
  recommended_department text default '',
  recommended_agent_id text default '',
  urgency text default 'medium',
  intake jsonb not null default '{}'::jsonb,
  score_detail jsonb not null default '{}'::jsonb,
  transcript jsonb not null default '[]'::jsonb
);
alter table public.intake_cases enable row level security;

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
  error text default '',
  firm_id text
);

-- Apply the historical RPC/continuity migrations and then the forward-only
-- authorization contract exactly as repository ordering requires.
\ir ../migrations/20260824_public_intake_token_rpc.sql
\ir ../migrations/20260825_intake_continuity_and_autowork.sql
\ir ../migrations/20260830_public_intake_authorization_contract.sql

\set QUIET on
\pset tuples_only on
\pset format unaligned

truncate public.agent_tasks restart identity cascade;
truncate public.intake_cases restart identity cascade;
truncate public.client_invites restart identity cascade;
delete from public.firm_memberships;

insert into public.firm_memberships (firm_id, intake_token) values
  ('firm-a', 'route-token-firm-a'),
  ('firm-b', 'route-token-firm-b');

insert into public.client_invites (
  id, firm_id, token, client_name, client_email, client_phone, notes, status
) values
  ('11111111-1111-1111-1111-111111111111', 'firm-a', 'invite-token-a',
   'Alex Client', 'alex@example.com', '555-111-2222',
   '[mode:chat] Spanish speaking. INTERNAL STRATEGY MUST NOT LEAK', 'pending'),
  ('22222222-2222-2222-2222-222222222222', 'firm-b', 'invite-token-b',
   'Blair Client', 'blair@example.com', '555-333-4444', '', 'pending'),
  ('33333333-3333-3333-3333-333333333333', 'firm-a', 'expired-token-a',
   'Expired Client', '', '', 'SHOULD NOT RESOLVE', 'expired');

-- T1: a firm share token creates under its server-resolved firm.
select public.upsert_public_intake(
  'resume-aaaaaaaaaaaaaaaaaaaa', 'route-token-firm-a',
  '{"full_name":"Dana Reyes"}'::jsonb, 'partial'
);
select 'T1 server-derived firm: ' || case when (
  select firm_id from public.intake_cases
  where resume_token = 'resume-aaaaaaaaaaaaaaaaaaaa'
) = 'firm-a' then 'PASS' else 'FAIL' end;

-- T2: a caller cannot substitute the public firm_id itself for authorization.
do $$
declare ok boolean := false;
begin
  begin
    perform public.upsert_public_intake(
      'resume-bbbbbbbbbbbbbbbbbbbb', 'firm-a', '{}'::jsonb, 'partial'
    );
  exception when others then
    ok := (sqlerrm = 'invalid intake route');
  end;
  raise notice 'T2 raw firm id rejected: %', case when ok then 'PASS' else 'FAIL' end;
end $$;

-- T3: another valid token maps only to its own tenant.
select public.upsert_public_intake(
  'resume-cccccccccccccccccccc', 'route-token-firm-b', '{}'::jsonb, 'partial'
);
select 'T3 second tenant bound: ' || case when (
  select firm_id from public.intake_cases
  where resume_token = 'resume-cccccccccccccccccccc'
) = 'firm-b' then 'PASS' else 'FAIL' end;

-- T4: client_invite_id comes from the bearer invite, never from payload.
select public.upsert_public_intake(
  'resume-dddddddddddddddddddd', 'invite-token-a',
  '{"client_invite_id":"22222222-2222-2222-2222-222222222222","full_name":"Alex Client"}'::jsonb,
  'partial'
);
select 'T4 invite ownership server-derived: ' || case when (
  select client_invite_id from public.intake_cases
  where resume_token = 'resume-dddddddddddddddddddd'
) = '11111111-1111-1111-1111-111111111111'::uuid then 'PASS' else 'FAIL' end;

-- T5: resolver returns bounded metadata and does not expose free-form notes.
select 'T5 resolver omits notes: ' || case when not (
  select to_jsonb(r) ? 'notes'
  from public.resolve_public_intake_token('invite-token-a') r
) then 'PASS' else 'FAIL' end;
select 'T6 bounded mode/language: ' || case when (
  select intake_mode || '|' || preferred_language
  from public.resolve_public_intake_token('invite-token-a')
) = 'chat|es' then 'PASS' else 'FAIL' end;

-- T7: invalid, malformed and expired tokens do not resolve.
select 'T7 invalid token hidden: ' || case when
  (select count(*) from public.resolve_public_intake_token('no-such-token')) = 0
  and (select count(*) from public.resolve_public_intake_token('bad')) = 0
  and (select count(*) from public.resolve_public_intake_token('expired-token-a')) = 0
then 'PASS' else 'FAIL' end;

-- T8: a resume token can update the same row without re-supplying route token.
select public.upsert_public_intake(
  'resume-aaaaaaaaaaaaaaaaaaaa', '', '{"summary":"resumed safely"}'::jsonb, 'partial'
);
select 'T8 resume capability works: ' || case when (
  select firm_id || '|' || summary from public.intake_cases
  where resume_token = 'resume-aaaaaaaaaaaaaaaaaaaa'
) = 'firm-a|resumed safely' then 'PASS' else 'FAIL' end;

-- T9: a different firm's route token cannot be paired with that resume token.
do $$
declare ok boolean := false;
begin
  begin
    perform public.upsert_public_intake(
      'resume-aaaaaaaaaaaaaaaaaaaa', 'route-token-firm-b',
      '{"summary":"cross-firm overwrite"}'::jsonb, 'partial'
    );
  exception when others then
    ok := (sqlerrm = 'invalid intake route');
  end;
  raise notice 'T9 cross-firm route swap rejected: %', case when ok then 'PASS' else 'FAIL' end;
end $$;

-- T10/T11: recording paths must be scoped to the authoritative firm/intake id.
do $$
declare ok boolean := false;
begin
  begin
    perform public.upsert_public_intake(
      'resume-aaaaaaaaaaaaaaaaaaaa', '',
      '{"recording_path":"firm-b/not-this-intake/recording.webm"}'::jsonb,
      'partial'
    );
  exception when others then
    ok := (sqlerrm = 'invalid recording path');
  end;
  raise notice 'T10 foreign recording path rejected: %', case when ok then 'PASS' else 'FAIL' end;
end $$;

select public.upsert_public_intake(
  'resume-aaaaaaaaaaaaaaaaaaaa', '',
  jsonb_build_object(
    'recording_path',
    'firm-a/' || (select id::text from public.intake_cases where resume_token='resume-aaaaaaaaaaaaaaaaaaaa') || '/recording.webm'
  ),
  'partial'
);
select 'T11 correct recording path accepted: ' || case when (
  select recording_path is not null from public.intake_cases
  where resume_token = 'resume-aaaaaaaaaaaaaaaaaaaa'
) then 'PASS' else 'FAIL' end;

-- T12-T14: invite completion requires the same token, correct linked intake,
-- and cannot be replayed after completion.
select 'T12 wrong invite token rejected: ' || case when
  public.complete_client_invite('invite-token-b', (
    select id from public.intake_cases where resume_token='resume-dddddddddddddddddddd'
  )) = false then 'PASS' else 'FAIL' end;

select 'T13 correct invite completes: ' || case when
  public.complete_client_invite('invite-token-a', (
    select id from public.intake_cases where resume_token='resume-dddddddddddddddddddd'
  )) = true then 'PASS' else 'FAIL' end;

select 'T14 completed invite replay rejected: ' || case when
  public.complete_client_invite('invite-token-a', (
    select id from public.intake_cases where resume_token='resume-dddddddddddddddddddd'
  )) = false then 'PASS' else 'FAIL' end;

-- T15-T17: the anonymous table bypass is gone; only the RPC remains executable.
select 'T15 no anon insert policy: ' || case when not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='intake_cases'
    and cmd='INSERT' and roles::text like '%anon%'
) then 'PASS' else 'FAIL' end;

select 'T16 anon table INSERT revoked: ' || case when
  has_table_privilege('anon', 'public.intake_cases', 'INSERT') = false
then 'PASS' else 'FAIL' end;

select 'T17 anon RPC execute retained: ' || case when
  has_function_privilege('anon', 'public.upsert_public_intake(text,text,jsonb,text)', 'EXECUTE')
then 'PASS' else 'FAIL' end;
