begin;

alter table public.pipeline_jobs
  drop constraint if exists pipeline_jobs_job_type_check;

alter table public.pipeline_jobs
  add column if not exists firm_id text,
  add column if not exists module_id text,
  add column if not exists worker_kind text not null default 'edge',
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists result jsonb,
  add column if not exists priority integer not null default 100,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 3,
  add column if not exists lease_token uuid,
  add column if not exists leased_until timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists updated_at timestamptz not null default now();

update public.pipeline_jobs as job
set firm_id = case_row.firm_id
from public.cases as case_row
where job.case_id = case_row.id
  and job.firm_id is null;

alter table public.pipeline_jobs
  drop constraint if exists pipeline_jobs_worker_kind_check;

alter table public.pipeline_jobs
  add constraint pipeline_jobs_worker_kind_check
  check (worker_kind in ('edge', 'general', 'media'));

alter table public.pipeline_jobs
  drop constraint if exists pipeline_jobs_attempts_nonnegative_check;

alter table public.pipeline_jobs
  add constraint pipeline_jobs_attempts_nonnegative_check
  check (attempts >= 0 and max_attempts >= 1);

create index if not exists idx_pipeline_jobs_worker_claim
  on public.pipeline_jobs(worker_kind, status, priority, available_at, created_at);

create index if not exists idx_pipeline_jobs_lease
  on public.pipeline_jobs(status, leased_until)
  where status = 'processing';

create unique index if not exists idx_pipeline_jobs_idempotency
  on public.pipeline_jobs(idempotency_key)
  where idempotency_key is not null;

create table if not exists public.casebuddy_module_installations (
  id uuid primary key default gen_random_uuid(),
  firm_id text not null,
  module_id text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, module_id)
);

create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  firm_id text not null,
  case_id text references public.cases(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  source_module text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0,
  last_dispatch_error text
);

create index if not exists idx_domain_events_dispatch
  on public.domain_events(dispatched_at, occurred_at)
  where dispatched_at is null;

create index if not exists idx_domain_events_case
  on public.domain_events(firm_id, case_id, occurred_at desc);

create table if not exists public.casebuddy_module_artifacts (
  id uuid primary key default gen_random_uuid(),
  firm_id text not null,
  case_id text not null references public.cases(id) on delete cascade,
  module_id text not null,
  artifact_type text not null,
  artifact_key text not null unique,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  source_job_id uuid references public.pipeline_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_artifacts_case
  on public.casebuddy_module_artifacts(
    firm_id,
    case_id,
    module_id,
    updated_at desc
  );

alter table public.casebuddy_module_installations enable row level security;
alter table public.domain_events enable row level security;
alter table public.casebuddy_module_artifacts enable row level security;

drop policy if exists "Firm members can view module installations"
  on public.casebuddy_module_installations;

create policy "Firm members can view module installations"
on public.casebuddy_module_installations
for select
to authenticated
using (firm_id = public.get_user_firm_id());

drop policy if exists "Firm members can view domain events"
  on public.domain_events;

create policy "Firm members can view domain events"
on public.domain_events
for select
to authenticated
using (firm_id = public.get_user_firm_id());

drop policy if exists "Firm members can view module artifacts"
  on public.casebuddy_module_artifacts;

create policy "Firm members can view module artifacts"
on public.casebuddy_module_artifacts
for select
to authenticated
using (firm_id = public.get_user_firm_id());

revoke all on table public.pipeline_jobs from anon, authenticated;
revoke all on table public.casebuddy_module_installations from anon;
revoke all on table public.domain_events from anon;
revoke all on table public.casebuddy_module_artifacts from anon;

grant all on table public.pipeline_jobs to service_role;
grant all on table public.casebuddy_module_installations to service_role;
grant all on table public.domain_events to service_role;
grant all on table public.casebuddy_module_artifacts to service_role;

grant select on table public.casebuddy_module_installations to authenticated;
grant select on table public.domain_events to authenticated;
grant select on table public.casebuddy_module_artifacts to authenticated;

create or replace function public.claim_casebuddy_jobs(
  p_worker_kind text,
  p_limit integer default 5,
  p_lease_seconds integer default 900
)
returns setof public.pipeline_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.pipeline_jobs as job
    where job.status = 'pending'
      and job.worker_kind = p_worker_kind
      and job.available_at <= now()
      and job.attempts < job.max_attempts
    order by job.priority asc, job.created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 50))
  ),
  claimed as (
    update public.pipeline_jobs as job
    set status = 'processing',
        attempts = job.attempts + 1,
        started_at = coalesce(job.started_at, now()),
        lease_token = gen_random_uuid(),
        leased_until = now() + make_interval(
          secs => greatest(30, least(p_lease_seconds, 86400))
        ),
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select *
  from claimed;
end;
$$;

create or replace function public.complete_casebuddy_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.pipeline_jobs
  set status = 'completed',
      result = coalesce(p_result, '{}'::jsonb),
      error_log = null,
      completed_at = now(),
      lease_token = null,
      leased_until = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.fail_casebuddy_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.pipeline_jobs
  set status = case
        when attempts >= max_attempts then 'failed'
        else 'pending'
      end,
      error_log = left(coalesce(p_error, 'Unknown worker error'), 8000),
      available_at = case
        when attempts >= max_attempts then available_at
        else now() + make_interval(secs => least(300, attempts * 30))
      end,
      completed_at = case
        when attempts >= max_attempts then now()
        else null
      end,
      lease_token = null,
      leased_until = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.reap_casebuddy_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.pipeline_jobs
  set status = case
        when attempts >= max_attempts then 'failed'
        else 'pending'
      end,
      error_log = case
        when attempts >= max_attempts
          then coalesce(error_log, 'Worker lease expired')
        else error_log
      end,
      available_at = case
        when attempts >= max_attempts then available_at
        else now()
      end,
      completed_at = case
        when attempts >= max_attempts then now()
        else null
      end,
      lease_token = null,
      leased_until = null,
      updated_at = now()
  where status = 'processing'
    and leased_until is not null
    and leased_until < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.claim_casebuddy_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_casebuddy_job(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_casebuddy_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reap_casebuddy_jobs()
  from public, anon, authenticated;

grant execute on function public.claim_casebuddy_jobs(text, integer, integer)
  to service_role;
grant execute on function public.complete_casebuddy_job(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fail_casebuddy_job(uuid, uuid, text)
  to service_role;
grant execute on function public.reap_casebuddy_jobs()
  to service_role;

commit;
