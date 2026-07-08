-- ============================================================================
-- Pipeline auto-driver + stale-job reaper
--
-- Context: pipeline_jobs rows were only ever advanced by a client having the
-- app open (pipeline-worker/orchestrator were invoked from the browser via
-- backgroundAgentEngine). If nobody had a tab open, or if pipeline-worker
-- died mid-run (e.g. hit the edge function's execution time limit while
-- retrying a slow/rate-limited OCR provider), a job could sit in
-- 'processing' forever with no error and nothing left to pick it up.
--
-- This migration:
--   1. Enables pg_cron + pg_net so Postgres itself can drive the pipeline.
--   2. Schedules pipeline-orchestrator to run every 2 minutes, independent
--      of whether anyone has the app open.
--   3. Schedules a reaper that requeues (or, after 3 attempts, fails) any
--      job stuck in 'processing' for more than 5 minutes, so a crashed
--      worker self-heals instead of hanging indefinitely.
--
-- REQUIRED ONE-TIME MANUAL STEP before/after running this migration — this
-- project does not have the `app.settings.service_role_key` GUC set, and
-- this repo is PUBLIC, so the real service_role key must never be committed
-- to a file. Instead, run this once in the Supabase SQL Editor, pasting your
-- actual service_role key (Project Settings -> API -> service_role):
--
--   select vault.create_secret('<PASTE_YOUR_SERVICE_ROLE_KEY>', 'pipeline_service_role_key');
--
-- The cron job below reads it from Vault at call time — the key itself never
-- touches this file or git history.
--
-- Also requires pipeline-worker and pipeline-orchestrator to actually be
-- deployed (`supabase functions deploy pipeline-worker pipeline-orchestrator`)
-- — this migration only wires up scheduling, it can't deploy the functions.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Drive the queue: invoke pipeline-orchestrator every 2 minutes.
select cron.schedule(
  'invoke-pipeline-orchestrator',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://jpzkumgndqsdwimbvjku.supabase.co/functions/v1/pipeline-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pipeline_service_role_key'
        limit 1
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Self-heal: requeue jobs stuck in 'processing' for >5 minutes (worker
-- crashed / got killed by the platform timeout before it could report back).
-- After 3 retries, give up and mark it 'failed' with a clear reason instead
-- of retrying forever.
select cron.schedule(
  'reap-stale-pipeline-jobs',
  '*/5 * * * *',
  $$
  update public.pipeline_jobs
  set status = 'pending',
      started_at = null,
      attempts = attempts + 1,
      error_log = coalesce(error_log || ' | ', '') || 'auto-requeued: stale in processing for >5min'
  where status = 'processing'
    and started_at < now() - interval '5 minutes'
    and attempts < 3;

  update public.pipeline_jobs
  set status = 'failed',
      error_log = coalesce(error_log || ' | ', '') || 'auto-failed: exceeded 3 retry attempts while stuck in processing'
  where status = 'processing'
    and started_at < now() - interval '5 minutes'
    and attempts >= 3;
  $$
);
