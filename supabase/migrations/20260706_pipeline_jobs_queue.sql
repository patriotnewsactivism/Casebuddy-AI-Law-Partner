-- ============================================================================
-- Applied to prod 2026-07-06 (via management API — recorded here for history)
--
-- The autonomous document pipeline was half-deployed: documents existed but
-- pipeline_jobs (the OCR job queue), the queue_initial_ocr_job trigger
-- function, and trigger_queue_ocr were all missing — so 40 uploaded
-- documents sat in status='queued' with OCR that never ran.
--
-- This is repo migration 0013 re-applied idempotently, minus its
-- "Anon all …" testing policies (replaced with authenticated read/update;
-- job processing runs in the signed-in client via backgroundAgentEngine).
-- ============================================================================

create table if not exists public.pipeline_jobs (
  id uuid default gen_random_uuid() primary key,
  case_id text not null,
  document_id uuid references public.documents(id) on delete cascade,
  job_type text not null check (job_type in ('ocr', 'entity_extraction', 'chronology', 'issue_spotting')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts int default 0 not null,
  error_log text,
  created_at timestamptz default now() not null,
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_pipeline_jobs_status on public.pipeline_jobs(status, created_at);
create index if not exists idx_pipeline_jobs_doc_id on public.pipeline_jobs(document_id);
create index if not exists idx_pipeline_jobs_case_id on public.pipeline_jobs(case_id);

create or replace function public.queue_initial_ocr_job()
returns trigger as $$
begin
  insert into public.pipeline_jobs (case_id, document_id, job_type, status)
  values (new.case_id::text, new.id, 'ocr', 'pending');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trigger_queue_ocr on public.documents;
create trigger trigger_queue_ocr
after insert on public.documents
for each row
execute function public.queue_initial_ocr_job();

alter table public.pipeline_jobs enable row level security;

drop policy if exists "authenticated_read_pipeline_jobs" on public.pipeline_jobs;
create policy "authenticated_read_pipeline_jobs" on public.pipeline_jobs
  for select to authenticated using (true);

drop policy if exists "authenticated_update_pipeline_jobs" on public.pipeline_jobs;
create policy "authenticated_update_pipeline_jobs" on public.pipeline_jobs
  for update to authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.pipeline_jobs;
exception when duplicate_object then null;
end $$;

-- Backfill (also already run in prod): enqueue OCR for stuck documents
insert into public.pipeline_jobs (case_id, document_id, job_type, status)
select d.case_id::text, d.id, 'ocr', 'pending'
from public.documents d
where d.status = 'queued'
  and not exists (select 1 from public.pipeline_jobs j where j.document_id = d.id and j.job_type = 'ocr');
