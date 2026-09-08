-- CASEBUDDY: Maya public-intake routing + recording privacy hardening
--
-- Goals:
--   * Never trust a browser-selected firm_id when an opaque intake token exists.
--   * Preserve the current upsert_public_intake() signature for rollout safety.
--   * Remove general anonymous INSERT permission from intake-recordings.
--   * Keep recordings private, purpose-limited, retention-bound and auditable.
--
-- The browser now attaches X-Intake-Token automatically on /intake/<token>.
-- PostgREST exposes request headers through request.headers, allowing the
-- database to independently resolve the receiving firm.

-- ── 1. Recording privacy metadata ────────────────────────────────────────────

alter table public.intake_cases
  add column if not exists recording_consent_at timestamptz,
  add column if not exists recording_purpose text,
  add column if not exists recording_retention_until timestamptz,
  add column if not exists recording_deleted_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'intake_cases_recording_purpose_check'
  ) then
    alter table public.intake_cases
      add constraint intake_cases_recording_purpose_check
      check (recording_purpose is null or recording_purpose = 'intake_accuracy');
  end if;
end $$;

create index if not exists intake_recordings_retention_idx
  on public.intake_cases (recording_retention_until)
  where recording_path is not null and recording_deleted_at is null;

create or replace function public.set_intake_recording_privacy_metadata()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.recording_consent then
    new.recording_consent_at := coalesce(new.recording_consent_at, now());
    new.recording_purpose := 'intake_accuracy';
  end if;

  if new.recording_path is not null and length(trim(new.recording_path)) > 0 then
    if not new.recording_consent then
      raise exception 'recording path requires affirmative consent';
    end if;
    new.recording_purpose := 'intake_accuracy';
    new.recording_retention_until := coalesce(
      new.recording_retention_until,
      now() + interval '90 days'
    );
    new.recording_deleted_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_intake_recording_privacy_metadata on public.intake_cases;
create trigger trg_intake_recording_privacy_metadata
before insert or update of recording_consent, recording_path, recording_retention_until
on public.intake_cases
for each row execute function public.set_intake_recording_privacy_metadata();

-- ── 2. Auditable recording access ────────────────────────────────────────────

create table if not exists public.intake_recording_access_events (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid references public.intake_cases(id) on delete cascade,
  firm_id text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint intake_recording_access_action_check
    check (action in ('playback_granted', 'playback_denied', 'purged'))
);

create index if not exists intake_recording_access_events_idx
  on public.intake_recording_access_events (firm_id, intake_id, created_at desc);

alter table public.intake_recording_access_events enable row level security;

drop policy if exists intake_recording_access_read on public.intake_recording_access_events;
create policy intake_recording_access_read
on public.intake_recording_access_events
for select to authenticated
using (firm_id = public.get_user_firm_id());

revoke insert, update, delete on public.intake_recording_access_events from anon, authenticated;

-- ── 3. Request-bound intake routing ──────────────────────────────────────────

create or replace function public.request_intake_token()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_headers jsonb;
  v_token text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_token := trim(coalesce(v_headers->>'x-intake-token', ''));
  if length(v_token) < 5 or length(v_token) > 128 then return null; end if;
  return v_token;
end;
$$;

revoke all on function public.request_intake_token() from public;
grant execute on function public.request_intake_token() to anon, authenticated, service_role;

create or replace function public.resolve_request_intake_route(p_claimed_firm text default null)
returns table (firm_id text, invite_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_token text := public.request_intake_token();
  v_claimed text := trim(coalesce(p_claimed_firm, ''));
  v_firm text;
  v_invite uuid;
  v_count integer;
begin
  if v_token is not null then
    select r.firm_id, r.invite_id
      into v_firm, v_invite
    from public.resolve_public_intake_token(v_token) r
    limit 1;

    if v_firm is null then
      raise exception 'invalid public intake token' using errcode = '42501';
    end if;
    if v_claimed <> '' and v_claimed <> v_firm then
      raise exception 'intake firm does not match referral token' using errcode = '42501';
    end if;
    return query select v_firm, v_invite;
    return;
  end if;

  -- Signed-in staff can only use their own firm.
  if (select auth.uid()) is not null then
    v_firm := public.get_user_firm_id();
    if v_firm is null then
      raise exception 'firm membership required' using errcode = '42501';
    end if;
    if v_claimed <> '' and v_claimed <> v_firm then
      raise exception 'intake firm does not match signed-in firm' using errcode = '42501';
    end if;
    return query select v_firm, null::uuid;
    return;
  end if;

  -- Generic /intake is safe only for a truly single-firm deployment. In a
  -- multi-tenant deployment a referral token is required; never guess.
  select count(distinct fm.firm_id), min(fm.firm_id)
    into v_count, v_firm
  from public.firm_memberships fm
  where fm.firm_id is not null and length(trim(fm.firm_id)) > 0;

  if v_count <> 1 or v_firm is null then
    raise exception 'a firm-specific intake link is required' using errcode = '42501';
  end if;
  if v_claimed <> '' and v_claimed <> v_firm then
    raise exception 'intake firm does not match canonical firm' using errcode = '42501';
  end if;

  return query select v_firm, null::uuid;
end;
$$;

revoke all on function public.resolve_request_intake_route(text) from public;
grant execute on function public.resolve_request_intake_route(text) to anon, authenticated, service_role;

create or replace function public.resolve_request_intake_firm(p_claimed_firm text)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select r.firm_id from public.resolve_request_intake_route(p_claimed_firm) r limit 1;
$$;

revoke all on function public.resolve_request_intake_firm(text) from public;
grant execute on function public.resolve_request_intake_firm(text) to anon, authenticated, service_role;

-- Direct table inserts are still supported for the text/form intake code path,
-- but the database now validates the firm against the referral token itself.
drop policy if exists "intake_public_submit" on public.intake_cases;
create policy "intake_public_submit"
on public.intake_cases for insert to anon, authenticated
with check (
  firm_id = public.resolve_request_intake_firm(firm_id)
);

-- ── 4. Harden the existing checkpoint RPC without changing its signature ────

create or replace function public.upsert_public_intake(
  p_resume_token   text,
  p_firm_id        text,
  p_payload        jsonb,
  p_completion     text default 'partial'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_token text := trim(coalesce(p_resume_token, ''));
  v_firm text;
  v_invite uuid;
  v_id uuid;
  v_recording_path text;
begin
  if length(v_token) < 16 or length(v_token) > 128 then
    raise exception 'invalid resume token';
  end if;
  if p_completion not in ('partial', 'complete', 'abandoned') then
    raise exception 'invalid completion state';
  end if;

  select r.firm_id, r.invite_id into v_firm, v_invite
  from public.resolve_request_intake_route(p_firm_id) r
  limit 1;

  select id into v_id
  from public.intake_cases
  where resume_token = v_token;

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
      coalesce(nullif(p_payload->>'full_name', ''), 'Prospective Client'),
      coalesce(p_payload->>'contact', ''),
      coalesce(nullif(p_payload->>'matter_type', ''), 'General Inquiry'),
      coalesce(p_payload->>'jurisdiction', ''),
      coalesce(p_payload->>'summary', ''),
      greatest(0, least(100, coalesce((p_payload->>'score')::int, 0))),
      coalesce(nullif(p_payload->>'disposition', ''), 'review'),
      coalesce(nullif(p_payload->>'status', ''), 'new'),
      coalesce(nullif(p_payload->>'urgency', ''), 'medium'),
      coalesce(p_payload->'intake', '{}'::jsonb),
      coalesce(p_payload->'score_detail', '{}'::jsonb),
      coalesce(p_payload->'transcript', '[]'::jsonb),
      coalesce(p_payload->'extracted', '{}'::jsonb),
      coalesce((p_payload->>'recording_consent')::boolean, false),
      null,
      0,
      v_invite
    )
    returning id into v_id;
    return v_id;
  end if;

  if (select firm_id from public.intake_cases where id = v_id) <> v_firm then
    raise exception 'resume token belongs to a different firm' using errcode = '42501';
  end if;

  -- A finished intake is immutable from the public side; stale tabs cannot
  -- reopen or overwrite it.
  if (select completion_state from public.intake_cases where id = v_id) = 'complete' then
    return v_id;
  end if;

  v_recording_path := nullif(trim(coalesce(p_payload->>'recording_path', '')), '');
  if v_recording_path is not null then
    if coalesce((p_payload->>'recording_consent')::boolean, false) is not true then
      raise exception 'recording consent is required';
    end if;
    if left(v_recording_path, length(v_firm || '/' || v_id::text || '/'))
         <> (v_firm || '/' || v_id::text || '/')
       or position('..' in v_recording_path) > 0 then
      raise exception 'invalid recording custody path' using errcode = '42501';
    end if;
  end if;

  update public.intake_cases set
    completion_state  = p_completion,
    last_activity_at  = now(),
    full_name         = coalesce(nullif(p_payload->>'full_name', ''), full_name),
    contact           = coalesce(nullif(p_payload->>'contact', ''), contact),
    matter_type       = coalesce(nullif(p_payload->>'matter_type', ''), matter_type),
    jurisdiction      = coalesce(nullif(p_payload->>'jurisdiction', ''), jurisdiction),
    summary           = coalesce(nullif(p_payload->>'summary', ''), summary),
    score             = greatest(0, least(100, coalesce((p_payload->>'score')::int, score))),
    disposition       = coalesce(nullif(p_payload->>'disposition', ''), disposition),
    status            = coalesce(nullif(p_payload->>'status', ''), status),
    urgency           = coalesce(nullif(p_payload->>'urgency', ''), urgency),
    intake            = case when p_payload ? 'intake' then p_payload->'intake' else intake end,
    score_detail      = case when p_payload ? 'score_detail' then p_payload->'score_detail' else score_detail end,
    transcript        = case when p_payload ? 'transcript' then p_payload->'transcript' else transcript end,
    extracted         = case when p_payload ? 'extracted' then p_payload->'extracted' else extracted end,
    recording_consent = coalesce((p_payload->>'recording_consent')::boolean, recording_consent),
    recording_path    = coalesce(v_recording_path, recording_path),
    recording_seconds = case
      when v_recording_path is not null
        then greatest(coalesce((p_payload->>'recording_seconds')::int, 0), recording_seconds)
      else recording_seconds
    end,
    client_invite_id = coalesce(v_invite, client_invite_id)
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_public_intake(text, text, jsonb, text) from public;
grant execute on function public.upsert_public_intake(text, text, jsonb, text)
  to anon, authenticated, service_role;

-- ── 5. Remove broad anonymous recording-bucket write authority ───────────────

insert into storage.buckets (id, name, public)
values ('intake-recordings', 'intake-recordings', false)
on conflict (id) do update set public = false;

drop policy if exists "intake_recordings_public_insert" on storage.objects;

-- The old existence predicate is retained for migration compatibility but is
-- no longer callable from public browser roles.
revoke execute on function public.intake_firm_exists(text) from anon, authenticated;
grant execute on function public.intake_firm_exists(text) to service_role;

-- Existing authenticated firm-scoped SELECT policy remains in place. New
-- browser uploads use server-issued createSignedUploadUrl()/uploadToSignedUrl().
