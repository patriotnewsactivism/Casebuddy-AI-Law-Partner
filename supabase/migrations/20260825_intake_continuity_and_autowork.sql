-- Intake continuity, recording custody, structured extraction, and
-- assignment-triggered background work.
--
-- Four capabilities land here:
--   1. Partial intakes survive an abandoned call so Maya can follow up.
--   2. Every intake carries an authoritative firm_id — no silent tenant drift.
--   3. Voice recordings live in a private bucket with recorded consent.
--   4. Assignment to an attorney/paralegal queues automated case work.
--
-- Anonymous callers never get direct UPDATE on intake_cases. Partial progress
-- is written through a security-definer RPC keyed on an unguessable resume
-- token, mirroring resolve_public_intake_token.

-- ── 1. intake_cases: continuity, custody, extraction, assignment ────────────

alter table public.intake_cases
  add column if not exists completion_state text not null default 'complete',
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists resume_token text,
  add column if not exists recording_consent boolean not null default false,
  add column if not exists recording_path text,
  add column if not exists recording_seconds integer not null default 0,
  add column if not exists extracted jsonb not null default '{}'::jsonb,
  add column if not exists assigned_to text,
  add column if not exists assigned_to_name text,
  add column if not exists assigned_at timestamptz,
  add column if not exists followup_count integer not null default 0,
  add column if not exists followup_last_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'intake_cases_completion_state_check'
  ) then
    alter table public.intake_cases
      add constraint intake_cases_completion_state_check
      check (completion_state in ('partial', 'complete', 'abandoned'));
  end if;
end $$;

create unique index if not exists intake_cases_resume_token_key
  on public.intake_cases (resume_token) where resume_token is not null;

-- Drives the "who dropped off and needs chasing" queue.
create index if not exists intake_cases_followup_idx
  on public.intake_cases (firm_id, completion_state, last_activity_at desc);

create index if not exists intake_cases_assigned_idx
  on public.intake_cases (firm_id, assigned_to) where assigned_to is not null;

-- ── 2. Private bucket for intake voice recordings ───────────────────────────
-- Privileged client audio. Private always; reads go through signed URLs.

insert into storage.buckets (id, name, public)
values ('intake-recordings', 'intake-recordings', false)
on conflict (id) do update set public = false;

drop policy if exists "intake_recordings_firm_read" on storage.objects;
create policy "intake_recordings_firm_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'intake-recordings'
  and (storage.foldername(name))[1] = public.get_user_firm_id()
);

-- Anonymous callers upload their own recording during the intake and never
-- read the bucket back. The path is prefixed with the firm_id so the read
-- policy above can scope it.
drop policy if exists "intake_recordings_public_insert" on storage.objects;
create policy "intake_recordings_public_insert"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'intake-recordings');

-- ── 3. Partial-intake upsert (anon, security definer) ───────────────────────

create or replace function public.upsert_public_intake(
  p_resume_token   text,
  p_firm_id        text,
  p_payload        jsonb,
  p_completion     text default 'partial'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := trim(coalesce(p_resume_token, ''));
  v_firm  text := trim(coalesce(p_firm_id, ''));
  v_id    uuid;
begin
  if length(v_token) < 16 or length(v_token) > 128 then
    raise exception 'invalid resume token';
  end if;
  if length(v_firm) = 0 then
    raise exception 'firm_id is required';
  end if;
  if p_completion not in ('partial', 'complete', 'abandoned') then
    raise exception 'invalid completion state';
  end if;

  select id into v_id from public.intake_cases where resume_token = v_token;

  if v_id is null then
    insert into public.intake_cases (
      firm_id, resume_token, completion_state, last_activity_at,
      full_name, contact, matter_type, jurisdiction, summary,
      score, disposition, status, urgency,
      intake, score_detail, transcript, extracted,
      recording_consent, recording_path, recording_seconds,
      client_invite_id
    )
    values (
      v_firm, v_token, p_completion, now(),
      coalesce(p_payload->>'full_name', 'Prospective Client'),
      coalesce(p_payload->>'contact', ''),
      coalesce(p_payload->>'matter_type', 'General Inquiry'),
      coalesce(p_payload->>'jurisdiction', ''),
      coalesce(p_payload->>'summary', ''),
      coalesce((p_payload->>'score')::int, 0),
      coalesce(p_payload->>'disposition', 'review'),
      coalesce(p_payload->>'status', 'new'),
      coalesce(p_payload->>'urgency', 'medium'),
      coalesce(p_payload->'intake', '{}'::jsonb),
      coalesce(p_payload->'score_detail', '{}'::jsonb),
      coalesce(p_payload->'transcript', '[]'::jsonb),
      coalesce(p_payload->'extracted', '{}'::jsonb),
      coalesce((p_payload->>'recording_consent')::boolean, false),
      nullif(p_payload->>'recording_path', ''),
      coalesce((p_payload->>'recording_seconds')::int, 0),
      nullif(p_payload->>'client_invite_id', '')::uuid
    )
    returning id into v_id;
    return v_id;
  end if;

  -- A finished intake is immutable from the public side; late writes from a
  -- stale tab must not reopen or overwrite it.
  if (select completion_state from public.intake_cases where id = v_id) = 'complete' then
    return v_id;
  end if;

  update public.intake_cases set
    completion_state  = p_completion,
    last_activity_at  = now(),
    full_name         = coalesce(nullif(p_payload->>'full_name', ''), full_name),
    contact           = coalesce(nullif(p_payload->>'contact', ''), contact),
    matter_type       = coalesce(nullif(p_payload->>'matter_type', ''), matter_type),
    jurisdiction      = coalesce(nullif(p_payload->>'jurisdiction', ''), jurisdiction),
    summary           = coalesce(nullif(p_payload->>'summary', ''), summary),
    score             = coalesce((p_payload->>'score')::int, score),
    disposition       = coalesce(nullif(p_payload->>'disposition', ''), disposition),
    status            = coalesce(nullif(p_payload->>'status', ''), status),
    urgency           = coalesce(nullif(p_payload->>'urgency', ''), urgency),
    intake            = case when p_payload ? 'intake'       then p_payload->'intake'       else intake end,
    score_detail      = case when p_payload ? 'score_detail' then p_payload->'score_detail' else score_detail end,
    transcript        = case when p_payload ? 'transcript'   then p_payload->'transcript'   else transcript end,
    extracted         = case when p_payload ? 'extracted'    then p_payload->'extracted'    else extracted end,
    recording_consent = coalesce((p_payload->>'recording_consent')::boolean, recording_consent),
    recording_path    = coalesce(nullif(p_payload->>'recording_path', ''), recording_path),
    recording_seconds = greatest(coalesce((p_payload->>'recording_seconds')::int, 0), recording_seconds)
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_public_intake(text, text, jsonb, text) from public;
grant execute on function public.upsert_public_intake(text, text, jsonb, text) to anon, authenticated;

-- ── 4. Resume a partial intake (anon, security definer) ─────────────────────
-- Returns only what Maya needs to pick the conversation back up. Scoring
-- internals and firm notes are deliberately withheld from the public caller.

create or replace function public.resume_public_intake(p_resume_token text)
returns table (
  intake_id        uuid,
  firm_id          text,
  completion_state text,
  full_name        text,
  contact          text,
  intake           jsonb,
  transcript       jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := trim(coalesce(p_resume_token, ''));
begin
  if length(v_token) < 16 or length(v_token) > 128 then return; end if;

  return query
  select i.id, i.firm_id, i.completion_state, i.full_name, i.contact,
         i.intake, i.transcript
  from public.intake_cases i
  where i.resume_token = v_token
    and i.completion_state <> 'complete';
end;
$$;

revoke all on function public.resume_public_intake(text) from public;
grant execute on function public.resume_public_intake(text) to anon, authenticated;

-- ── 5. Assignment queues automated case work ────────────────────────────────
-- agent_tasks already carries intake_id/case_id/firm_id, so assignment work
-- reuses it rather than introducing a parallel queue.

create or replace function public.assign_intake(
  p_intake_id uuid,
  p_assignee  text,
  p_name      text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm text;
begin
  select firm_id into v_firm from public.intake_cases where id = p_intake_id;
  if v_firm is null or v_firm <> public.get_user_firm_id() then
    return false;
  end if;

  update public.intake_cases
  set assigned_to = p_assignee,
      assigned_to_name = nullif(p_name, ''),
      assigned_at = now(),
      status = case when status = 'new' then 'routed' else status end
  where id = p_intake_id;

  -- One row per workstream so each can succeed or fail independently.
  insert into public.agent_tasks (case_id, intake_id, agent_id, task_type, status, input, firm_id)
  select '', p_intake_id, t.agent_id, t.task_type, 'queued',
         jsonb_build_object('assignee', p_assignee, 'intake_id', p_intake_id),
         v_firm
  from (values
    ('maya',      'intake_deadlines'),
    ('research',  'intake_precedent'),
    ('paralegal', 'intake_case_prep'),
    ('maya',      'intake_conflict_check')
  ) as t(agent_id, task_type)
  where not exists (
    select 1 from public.agent_tasks a
    where a.intake_id = p_intake_id and a.task_type = t.task_type
  );

  return true;
end;
$$;

revoke all on function public.assign_intake(uuid, text, text) from public;
grant execute on function public.assign_intake(uuid, text, text) to authenticated;
