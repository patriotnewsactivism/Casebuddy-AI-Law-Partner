-- Classify server-only cache/queue tables, add case-scoped RLS for legacy
-- case documents, transcriptions, settlement analyses and trial sessions,
-- add authenticated own-user policy for API usage records, close the legacy
-- null-owner projects policy, fix mutable function search paths, and remove
-- browser access to maintenance/trigger/internal queue functions.

-- ─── Server-only table classification: agent_cron_logs ──────────────────────
-- RLS on, but service_role has unrestricted access; authenticated gets a
-- read-only policy for dashboard visibility.

alter table public.agent_cron_logs enable row level security;

drop policy if exists "cron_logs_read" on public.agent_cron_logs;
create policy "cron_logs_read"
  on public.agent_cron_logs for select to authenticated
  using (true);

drop policy if exists "cron_logs_service_role" on public.agent_cron_logs;
create policy "cron_logs_service_role"
  on public.agent_cron_logs for all to service_role
  using (true) with check (true);

-- ─── Case-scoped RLS: case_documents ──────────────────────────────────────────
alter table public.case_documents enable row level security;

drop policy if exists "case_documents_case_select" on public.case_documents;
create policy "case_documents_case_select"
  on public.case_documents for select to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id = case_documents.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "case_documents_case_insert" on public.case_documents;
create policy "case_documents_case_insert"
  on public.case_documents for insert to authenticated
  with check (exists (
    select 1 from public.cases c
    where c.id = case_documents.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "case_documents_case_update" on public.case_documents;
create policy "case_documents_case_update"
  on public.case_documents for update to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id = case_documents.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ))
  with check (exists (
    select 1 from public.cases c
    where c.id = case_documents.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "case_documents_case_delete" on public.case_documents;
create policy "case_documents_case_delete"
  on public.case_documents for delete to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id = case_documents.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

-- ─── Case-scoped RLS: transcriptions ─────────────────────────────────────────
alter table public.transcriptions enable row level security;

drop policy if exists "transcriptions_case_select" on public.transcriptions;
create policy "transcriptions_case_select"
  on public.transcriptions for select to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = transcriptions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "transcriptions_case_insert" on public.transcriptions;
create policy "transcriptions_case_insert"
  on public.transcriptions for insert to authenticated
  with check (exists (
    select 1 from public.cases c
    where c.id::text = transcriptions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "transcriptions_case_update" on public.transcriptions;
create policy "transcriptions_case_update"
  on public.transcriptions for update to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = transcriptions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ))
  with check (exists (
    select 1 from public.cases c
    where c.id::text = transcriptions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "transcriptions_case_delete" on public.transcriptions;
create policy "transcriptions_case_delete"
  on public.transcriptions for delete to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = transcriptions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

-- ─── Case-scoped RLS: settlement_analyses ─────────────────────────────────────
alter table public.settlement_analyses enable row level security;

drop policy if exists "settlement_case_select" on public.settlement_analyses;
create policy "settlement_case_select"
  on public.settlement_analyses for select to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = settlement_analyses.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "settlement_case_insert" on public.settlement_analyses;
create policy "settlement_case_insert"
  on public.settlement_analyses for insert to authenticated
  with check (exists (
    select 1 from public.cases c
    where c.id::text = settlement_analyses.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "settlement_case_update" on public.settlement_analyses;
create policy "settlement_case_update"
  on public.settlement_analyses for update to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = settlement_analyses.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ))
  with check (exists (
    select 1 from public.cases c
    where c.id::text = settlement_analyses.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "settlement_case_delete" on public.settlement_analyses;
create policy "settlement_case_delete"
  on public.settlement_analyses for delete to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = settlement_analyses.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

-- ─── Case-scoped RLS: trial_sessions ──────────────────────────────────────────
alter table public.trial_sessions enable row level security;

drop policy if exists "trial_sessions_case_select" on public.trial_sessions;
create policy "trial_sessions_case_select"
  on public.trial_sessions for select to authenticated
  using (user_id = (select auth.uid())::text or exists (
    select 1 from public.cases c
    where c.id::text = trial_sessions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "trial_sessions_case_insert" on public.trial_sessions;
create policy "trial_sessions_case_insert"
  on public.trial_sessions for insert to authenticated
  with check (user_id = (select auth.uid())::text or exists (
    select 1 from public.cases c
    where c.id::text = trial_sessions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "trial_sessions_case_update" on public.trial_sessions;
create policy "trial_sessions_case_update"
  on public.trial_sessions for update to authenticated
  using (user_id = (select auth.uid())::text or exists (
    select 1 from public.cases c
    where c.id::text = trial_sessions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ))
  with check (user_id = (select auth.uid())::text or exists (
    select 1 from public.cases c
    where c.id::text = trial_sessions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "trial_sessions_case_delete" on public.trial_sessions;
create policy "trial_sessions_case_delete"
  on public.trial_sessions for delete to authenticated
  using (user_id = (select auth.uid())::text or exists (
    select 1 from public.cases c
    where c.id::text = trial_sessions.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

-- ─── Authenticated own-user policy: api_usage_log ───────────────────────────
alter table public.api_usage_log enable row level security;

drop policy if exists "api_usage_own_select" on public.api_usage_log;
create policy "api_usage_own_select"
  on public.api_usage_log for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "api_usage_own_insert" on public.api_usage_log;
create policy "api_usage_own_insert"
  on public.api_usage_log for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ─── Pipeline-job visibility by case access ──────────────────────────────────
alter table public.pipeline_jobs enable row level security;

drop policy if exists "pipeline_jobs_case_access_read" on public.pipeline_jobs;
create policy "pipeline_jobs_case_access_read"
  on public.pipeline_jobs for select to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id::text = pipeline_jobs.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

-- ─── Close the legacy null-owner projects policy ────────────────────────────
-- Previously projects with null user_id were universally manageable. Now
-- requires user_id = auth.uid() OR case ownership, closing cross-tenant access.

drop policy if exists "projects_accessible_select" on public.projects;
create policy "projects_accessible_select"
  on public.projects for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.cases c
    where c.id = projects.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "projects_accessible_insert" on public.projects;
create policy "projects_accessible_insert"
  on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()) or exists (
    select 1 from public.cases c
    where c.id = projects.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "projects_accessible_update" on public.projects;
create policy "projects_accessible_update"
  on public.projects for update to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.cases c
    where c.id = projects.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ))
  with check (user_id = (select auth.uid()) or exists (
    select 1 from public.cases c
    where c.id = projects.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

drop policy if exists "projects_accessible_delete" on public.projects;
create policy "projects_accessible_delete"
  on public.projects for delete to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.cases c
    where c.id = projects.case_id
      and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
  ));

-- ─── Add missing firm_memberships update permission ─────────────────────────
-- Needed to generate intake tokens via the scoped RPC.
grant update on public.firm_memberships to authenticated, anon;

-- ─── Fix mutable function search paths ──────────────────────────────────────
alter function public.update_updated_at_column() set search_path = public;
alter function public.user_has_case_access(uuid) set search_path = public;
alter function public.user_case_role(uuid) set search_path = public;
alter function public.check_conflicts(text, text) set search_path = public;
alter function public.claim_next_job() set search_path = public, pg_catalog;
alter function public.handle_updated_at() set search_path = public, pg_catalog;
alter function public.rls_auto_enable() set search_path = pg_catalog;
alter function public.get_pipeline_internal_secret(text) set search_path = public, vault;
alter function public.get_user_firm_id() set search_path = public, pg_catalog;
alter function public.queue_initial_ocr_job(uuid) set search_path = public;

-- ─── Remove browser access to maintenance/trigger/internal queue functions ──
-- Revoke from anon and authenticated so only service_role can call these.
revoke execute on function public.claim_next_job() from anon, authenticated;
revoke execute on function public.handle_updated_at() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.get_pipeline_internal_secret(text) from anon, authenticated;
revoke execute on function public.update_updated_at_column() from anon, authenticated;
