-- Repair existing pipeline cron installations after dedicated-secret hardening.
--
-- Before applying this migration, create a Vault secret named
-- pipeline_orchestrator_secret and configure the same value as the
-- PIPELINE_ORCHESTRATOR_SECRET Edge Function secret.
--
-- This migration intentionally does not use the Supabase service-role key as an
-- invocation credential.

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

-- Remove any previous version of the driver job, regardless of its old header.
select cron.unschedule(jobid)
from cron.job
where jobname = 'invoke-pipeline-orchestrator';

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
