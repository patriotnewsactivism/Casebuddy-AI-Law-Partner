-- ============================================================================
-- Pipeline auto-driver + stale-job reaper
--
-- pg_cron drives pipeline-orchestrator independently of browser sessions, while
-- the reaper recovers jobs left in processing by a crashed worker.
--
-- REQUIRED ONE-TIME SECRET SETUP before applying this migration:
--
--   select vault.create_secret(
--     '<PASTE_A_HIGH_ENTROPY_ORCHESTRATOR_SECRET>',
--     'pipeline_orchestrator_secret'
--   );
--
-- The same value must be configured as PIPELINE_ORCHESTRATOR_SECRET on the
-- pipeline-orchestrator Edge Function. Do NOT use or store the service-role key
-- as the cron invocation credential.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Fail rather than installing a cron job that can never authenticate.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'pipeline_orchestrator_secret'
      and coalesce(decrypted_secret, '') <> ''
  ) then
    raise exception 'Missing Vault secret pipeline_orchestrator_secret';
  end if;
end
$$;

-- Drive the queue: invoke pipeline-orchestrator every 2 minutes.
select cron.schedule(
  'invoke-pipeline-orchestrator',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://jpzkumgndqsdwimbvjku.supabase.co/functions/v1/pipeline-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pipeline_orchestrator_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Self-heal jobs stuck in processing for more than five minutes.
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
