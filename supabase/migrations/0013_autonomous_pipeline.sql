-- ============================================================================
-- CaseBuddy Autonomous Pipeline: Documents and Job Queue
-- ============================================================================

-- 1. Documents Table (if it doesn't exist)
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  case_id text not null, -- references public.cases(id) but cases is text id
  user_id uuid not null,
  name text not null,
  file_url text,
  file_type text not null,
  file_size bigint not null,
  storage_path text,
  bates_number text,
  bates_prefix text,
  bates_formatted text,
  summary text,
  key_facts jsonb,
  favorable_findings jsonb,
  adverse_findings jsonb,
  action_items jsonb,
  entities jsonb,
  ai_analyzed boolean default false,
  ocr_text text,
  extracted_text text,
  document_type text,
  status text not null default 'queued',
  content_hash text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes for documents
create index if not exists idx_documents_case_id on public.documents(case_id);
create index if not exists idx_documents_status on public.documents(status);

-- 2. Pipeline Jobs Queue
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

-- Indexes for the queue to allow fast polling by orchestrator
create index if not exists idx_pipeline_jobs_status on public.pipeline_jobs(status, created_at);
create index if not exists idx_pipeline_jobs_doc_id on public.pipeline_jobs(document_id);
create index if not exists idx_pipeline_jobs_case_id on public.pipeline_jobs(case_id);

-- 3. Database Webhook (Trigger) for new Documents
-- Automatically inserts an 'ocr' job when a new document is created
create or replace function public.queue_initial_ocr_job()
returns trigger as $$
begin
  insert into public.pipeline_jobs (case_id, document_id, job_type, status)
  values (new.case_id, new.id, 'ocr', 'pending');
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_queue_ocr
after insert on public.documents
for each row
execute function public.queue_initial_ocr_job();

-- RLS
alter table public.documents enable row level security;
alter table public.pipeline_jobs enable row level security;

-- Policies
create policy "Users manage own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- For now, allow anon to insert documents for testing since Cases are anon-accessible via firm_id
create policy "Anon all documents" on public.documents
  for all to anon using (true) with check (true);

create policy "Anon all pipeline jobs" on public.pipeline_jobs
  for all to anon using (true) with check (true);

-- Enable Realtime so UI can listen to progress
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.pipeline_jobs;
