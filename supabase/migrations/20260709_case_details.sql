-- case_details — durable home for Maya's full intake write-up + raw call
-- transcript. Previously this only lived in browser localStorage
-- (casebuddy_case_details_${caseId}), which meant it vanished if the
-- attorney cleared their cache or opened the case on a different device.
-- This table is a write-through backup: the app keeps writing localStorage
-- for instant/offline reads, but now every save is also durably persisted
-- here so the complete transcript is never lost.

create table if not exists public.case_details (
  case_id text primary key,
  firm_id text not null default 'default',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  detailed_narrative text default '',
  key_facts jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  parties jsonb not null default '[]'::jsonb,
  witnesses text default '',
  evidence_mentioned text default '',
  financial_impact text default '',
  prior_legal_actions text default '',
  client_quotes jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  emotional_state text default '',
  incident_date text default '',
  jurisdiction text default '',
  intake_transcript jsonb not null default '[]'::jsonb
);

create trigger set_updated_at
before update on public.case_details
for each row
execute function public.handle_updated_at();

create index if not exists case_details_firm_id_idx on public.case_details (firm_id);

alter table public.case_details enable row level security;

-- Same trust model as public.cases — firm_id acts as a shared secret known
-- only to the attorney's browser (never exposed on the public intake page).
create policy "case_details_anon_all" on public.case_details
  for all to anon
  using (true)
  with check (true);

alter publication supabase_realtime add table public.case_details;
