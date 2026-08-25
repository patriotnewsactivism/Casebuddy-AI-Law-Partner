-- Standalone verification for 20260825_intake_continuity_and_autowork.sql.
--
-- The behaviours asserted here are the ones a future change could break
-- silently and expensively: a completed intake must never be reopened by a
-- stale tab, assignment must never double-queue AI work, and it must never
-- cross a tenant boundary.
--
-- Runs against a plain PostgreSQL 16 — no Supabase required. It stubs the
-- auth/storage objects the migration builds on, so it validates the migration
-- rather than the platform.
--
--   initdb -D /tmp/pgt/data -U pgtest --auth=trust
--   pg_ctl -D /tmp/pgt/data -o '-p 55432 -k /tmp/pgt' start
--   psql -h /tmp/pgt -p 55432 -U pgtest -d postgres \
--     -c 'create role anon; create role authenticated; create role service_role;'
--   psql -h /tmp/pgt -p 55432 -U pgtest -d postgres \
--     -f supabase/tests/intake_continuity_test.sql
--
-- Every line of output should read PASS.

-- Minimal stand-ins for the Supabase objects the migration builds on.
create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;

create or replace function public.get_user_firm_id() returns text
language sql stable as $$ select 'firm-under-test'::text $$;

create table if not exists public.firm_memberships (
  user_id uuid primary key default gen_random_uuid(),
  firm_id text not null,
  claimed_at timestamptz not null default now(),
  intake_token text unique
);

create table if not exists public.client_invites (id uuid primary key default gen_random_uuid());

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

\ir ../migrations/20260825_intake_continuity_and_autowork.sql

\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Reset fixtures so this suite can be re-run against the same database.
delete from public.agent_tasks where intake_id in (select id from public.intake_cases where resume_token like 'tok-%');
delete from public.intake_cases where resume_token like 'tok-%';
delete from public.firm_memberships where firm_id in ('firm-under-test', 'some-other-firm');

-- A real firm so the storage predicate and assign_intake have something to match.
insert into public.firm_memberships (firm_id) values ('firm-under-test');

-- 1. First call creates a partial row.
select 'T1 create partial: ' ||
  case when public.upsert_public_intake(
    'tok-aaaaaaaaaaaaaaaaaaaa', 'firm-under-test',
    '{"full_name":"Dana Reyes","contact":"dana@example.com"}'::jsonb, 'partial'
  ) is not null then 'PASS' else 'FAIL' end;

-- 2. Second call must UPDATE, not insert a duplicate.
select public.upsert_public_intake(
  'tok-aaaaaaaaaaaaaaaaaaaa', 'firm-under-test',
  '{"summary":"rear-ended on the 405"}'::jsonb, 'partial');
select 'T2 no duplicate: ' ||
  case when (select count(*) from public.intake_cases
             where resume_token = 'tok-aaaaaaaaaaaaaaaaaaaa') = 1
  then 'PASS' else 'FAIL' end;

-- 3. Earlier fields survive a later partial write that omits them.
select 'T3 merge keeps name: ' ||
  case when (select full_name from public.intake_cases
             where resume_token = 'tok-aaaaaaaaaaaaaaaaaaaa') = 'Dana Reyes'
  then 'PASS' else 'FAIL' end;

-- 4. Completing works.
select public.upsert_public_intake(
  'tok-aaaaaaaaaaaaaaaaaaaa', 'firm-under-test',
  '{"summary":"final"}'::jsonb, 'complete');
select 'T4 completes: ' ||
  case when (select completion_state from public.intake_cases
             where resume_token = 'tok-aaaaaaaaaaaaaaaaaaaa') = 'complete'
  then 'PASS' else 'FAIL' end;

-- 5. A stale tab must NOT reopen a completed intake or overwrite it.
select public.upsert_public_intake(
  'tok-aaaaaaaaaaaaaaaaaaaa', 'firm-under-test',
  '{"summary":"STALE OVERWRITE"}'::jsonb, 'partial');
select 'T5 complete is immutable: ' ||
  case when (select completion_state || '|' || summary from public.intake_cases
             where resume_token = 'tok-aaaaaaaaaaaaaaaaaaaa') = 'complete|final'
  then 'PASS' else 'FAIL' end;

-- 6. resume returns nothing for a completed intake.
select 'T6 no resume when complete: ' ||
  case when (select count(*) from public.resume_public_intake('tok-aaaaaaaaaaaaaaaaaaaa')) = 0
  then 'PASS' else 'FAIL' end;

-- 7. resume DOES return an unfinished one.
select public.upsert_public_intake(
  'tok-bbbbbbbbbbbbbbbbbbbb', 'firm-under-test',
  '{"full_name":"Sam Poole"}'::jsonb, 'abandoned');
select 'T7 resume unfinished: ' ||
  case when (select full_name from public.resume_public_intake('tok-bbbbbbbbbbbbbbbbbbbb')) = 'Sam Poole'
  then 'PASS' else 'FAIL' end;

-- 8. Short/garbage tokens are rejected.
select 'T8 rejects short token: ' ||
  case when (select count(*) from public.resume_public_intake('short')) = 0
  then 'PASS' else 'FAIL' end;

-- 9. Assignment queues exactly the four workstreams.
select public.assign_intake(
  (select id from public.intake_cases where resume_token = 'tok-bbbbbbbbbbbbbbbbbbbb'),
  'personal-injury', 'Personal Injury');
select 'T9 queues 4 workstreams: ' ||
  case when (select count(*) from public.agent_tasks
             where intake_id = (select id from public.intake_cases
                                where resume_token = 'tok-bbbbbbbbbbbbbbbbbbbb')) = 4
  then 'PASS' else 'FAIL' end;

-- 10. Re-assigning must not duplicate the queue.
select public.assign_intake(
  (select id from public.intake_cases where resume_token = 'tok-bbbbbbbbbbbbbbbbbbbb'),
  'someone-else', 'Other');
select 'T10 reassign is idempotent: ' ||
  case when (select count(*) from public.agent_tasks
             where intake_id = (select id from public.intake_cases
                                where resume_token = 'tok-bbbbbbbbbbbbbbbbbbbb')) = 4
  then 'PASS' else 'FAIL' end;

-- 11. Assignment is refused across tenants.
select public.upsert_public_intake(
  'tok-cccccccccccccccccccc', 'some-other-firm', '{}'::jsonb, 'partial');
select 'T11 cross-tenant assign refused: ' ||
  case when public.assign_intake(
    (select id from public.intake_cases where resume_token = 'tok-cccccccccccccccccccc'),
    'attacker', '') = false
  then 'PASS' else 'FAIL' end;

-- 12. completion_state constraint holds.

do $$
declare ok boolean := false;
begin
  begin
    perform public.upsert_public_intake('tok-dddddddddddddddddddd','firm-under-test','{}'::jsonb,'nonsense');
  exception when others then
    ok := (sqlerrm = 'invalid completion state');
  end;
  raise notice 'T12 bad completion state rejected: %', case when ok then 'PASS' else 'FAIL' end;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    perform public.upsert_public_intake('tok-eeeeeeeeeeeeeeeeeeee','','{}'::jsonb,'partial');
  exception when others then
    ok := (sqlerrm = 'firm_id is required');
  end;
  raise notice 'T13 empty firm_id rejected: %', case when ok then 'PASS' else 'FAIL' end;
end $$;

-- Storage upload predicate: real firm prefix accepted, unknown firm rejected.
select 'T14 known firm prefix ok: ' ||
  case when public.intake_firm_exists((storage.foldername('firm-under-test/abc/rec.webm'))[1])
  then 'PASS' else 'FAIL' end;
select 'T15 unknown firm prefix rejected: ' ||
  case when public.intake_firm_exists((storage.foldername('not-a-firm/abc/rec.webm'))[1]) = false
  then 'PASS' else 'FAIL' end;
select 'T16 recordings bucket is private: ' ||
  case when (select public from storage.buckets where id = 'intake-recordings') = false
  then 'PASS' else 'FAIL' end;
