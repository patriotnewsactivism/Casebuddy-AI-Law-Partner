-- Maya Live Voice: session facts and intake linkage
-- Supports progressive fact recording during live calls and post-call synthesis.

-- ── intake_call_facts ────────────────────────────────────────────────────────
-- Facts recorded by Maya's record_case_fact tool during live voice sessions.
-- Service-role INSERT only (the server writes during the call), firm-member SELECT.

create table if not exists public.intake_call_facts (
  id          uuid primary key default gen_random_uuid(),
  intake_id   uuid not null references public.intake_cases(id) on delete cascade,
  category    text not null check (category in (
    'incident_date', 'party', 'injury', 'damage', 'evidence',
    'timeline', 'narrative', 'witness', 'financial', 'prior_legal', 'contact_info'
  )),
  description text not null,
  fact_date   text, -- free-form date as stated by the caller
  created_at  timestamptz not null default now()
);

comment on table public.intake_call_facts is
  'Facts recorded progressively by Maya during live voice intake calls.';

-- RLS: only service-role can INSERT; firm members can SELECT via intake join.
alter table public.intake_call_facts enable row level security;

create policy intake_call_facts_service_insert on public.intake_call_facts
  for insert to service_role
  with check (true);

create policy intake_call_facts_firm_select on public.intake_call_facts
  for select to authenticated
  using (
    exists (
      select 1 from public.intake_cases ic
      where ic.id = intake_call_facts.intake_id
        and ic.firm_id = public.get_user_firm_id()
    )
  );

-- Index for efficient joins
create index if not exists idx_intake_call_facts_intake_id
  on public.intake_call_facts(intake_id);

-- ── intake_cases additions ───────────────────────────────────────────────────
-- Track the live voice session and store the synthesized memorandum.

alter table public.intake_cases
  add column if not exists live_voice_session_id text,
  add column if not exists intake_memorandum text;

comment on column public.intake_cases.live_voice_session_id is
  'Session ID of the live voice call that produced this intake (audit trail).';
comment on column public.intake_cases.intake_memorandum is
  'Synthesized intake memorandum from the post-call analysis pipeline.';
