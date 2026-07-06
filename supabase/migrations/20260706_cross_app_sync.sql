-- ============================================================================
-- Cross-app sync: law-partner ⇄ Case-Companion ⇄ DiscoveryLens
-- Applied to prod 2026-07-06 (via management API — recorded here for history).
--
-- All three apps share this Supabase project, so records already live in the
-- same documents/cases tables. This adds provenance (source_app) + adoption
-- (synced_to) so a DiscoveryLens upload can be pushed into a law-partner or
-- companion case with a click, plus an audit feed (app_sync_events).
-- See INTEROP.md for the full contract.
-- ============================================================================

do $$ begin
  create type app_id as enum ('law-partner', 'companion', 'discoverylens');
exception when duplicate_object then null; end $$;

alter table public.documents
  add column if not exists source_app text not null default 'law-partner',
  add column if not exists synced_to text[] not null default '{}';

alter table public.cases
  add column if not exists source_app text not null default 'law-partner',
  add column if not exists synced_to text[] not null default '{}';

create index if not exists idx_documents_source_app on public.documents(source_app);
create index if not exists idx_cases_source_app on public.cases(source_app);

create table if not exists public.app_sync_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  firm_id       text,
  user_id       uuid default auth.uid(),
  entity_type   text not null check (entity_type in ('case','document')),
  entity_id     text not null,
  from_app      text not null,
  to_app        text not null,
  action        text not null default 'push' check (action in ('push','pull','update')),
  metadata      jsonb not null default '{}'::jsonb
);

create index if not exists idx_app_sync_events_entity on public.app_sync_events(entity_type, entity_id);
create index if not exists idx_app_sync_events_firm on public.app_sync_events(firm_id, created_at desc);

alter table public.app_sync_events enable row level security;

drop policy if exists "firm members read sync events" on public.app_sync_events;
create policy "firm members read sync events" on public.app_sync_events
  for select to authenticated
  using (firm_id = public.get_user_firm_id() or user_id = auth.uid());

drop policy if exists "authenticated write sync events" on public.app_sync_events;
create policy "authenticated write sync events" on public.app_sync_events
  for insert to authenticated with check (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.app_sync_events;
exception when duplicate_object then null; end $$;
