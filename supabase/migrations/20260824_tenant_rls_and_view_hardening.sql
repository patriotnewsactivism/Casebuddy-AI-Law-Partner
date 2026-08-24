-- Tighten tenant isolation without changing application data.
-- Removes permissive legacy policies that OR around newer firm-scoped rules.

alter view public.v_discovery_case_sync set (security_invoker = true);
alter view public.v_trial_prep_cases set (security_invoker = true);

drop policy if exists "case_details_anon_all" on public.case_details;

create policy "case_details_accessible_select"
on public.case_details for select to authenticated
using (exists (
  select 1 from public.cases c
  where c.id::text = case_details.case_id
    and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
));

create policy "case_details_accessible_insert"
on public.case_details for insert to authenticated
with check (exists (
  select 1 from public.cases c
  where c.id::text = case_details.case_id
    and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
));

create policy "case_details_accessible_update"
on public.case_details for update to authenticated
using (exists (
  select 1 from public.cases c
  where c.id::text = case_details.case_id
    and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
))
with check (exists (
  select 1 from public.cases c
  where c.id::text = case_details.case_id
    and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
));

create policy "case_details_accessible_delete"
on public.case_details for delete to authenticated
using (exists (
  select 1 from public.cases c
  where c.id::text = case_details.case_id
    and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
));

drop policy if exists "Users insert intakes" on public.intake_cases;
drop policy if exists "Users read own intakes" on public.intake_cases;
drop policy if exists "Users update own intakes" on public.intake_cases;
drop policy if exists "anon can submit intake" on public.intake_cases;
drop policy if exists "anon_insert_intakes" on public.intake_cases;
drop policy if exists "firm_read_own_intakes" on public.intake_cases;
drop policy if exists "firm_update_own_intakes" on public.intake_cases;
drop policy if exists "read intakes" on public.intake_cases;
drop policy if exists "update intake status" on public.intake_cases;

create policy "intake_public_submit"
on public.intake_cases for insert to anon, authenticated
with check (firm_id is not null and length(trim(firm_id)) > 0);

create policy "intake_firm_read"
on public.intake_cases for select to authenticated
using (firm_id = public.get_user_firm_id());

create policy "intake_firm_update"
on public.intake_cases for update to authenticated
using (firm_id = public.get_user_firm_id())
with check (firm_id = public.get_user_firm_id());

drop policy if exists "authenticated_read_pipeline_jobs" on public.pipeline_jobs;
drop policy if exists "authenticated_update_pipeline_jobs" on public.pipeline_jobs;
create policy "pipeline_jobs_case_access_read"
on public.pipeline_jobs for select to authenticated
using (exists (
  select 1 from public.cases c
  where c.id::text = pipeline_jobs.case_id
    and (c.user_id = (select auth.uid()) or c.firm_id = public.get_user_firm_id())
));

revoke all on function public.queue_initial_ocr_job() from public, anon, authenticated;
revoke all on function public.handle_new_user_welcome_email() from public, anon, authenticated;
revoke all on function public.handle_updated_at() from public, anon, authenticated;