-- CaseBuddy pipeline internal-auth hardening.
-- Generates independent Vault-held secrets in-database, exposes them only to
-- service_role through a restricted RPC, and repairs the cron driver so the
-- Supabase service-role credential is never used as an invocation credential.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pipeline_orchestrator_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'pipeline_orchestrator_secret',
      'CaseBuddy pipeline orchestrator caller secret'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'pipeline_worker_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'pipeline_worker_secret',
      'CaseBuddy pipeline worker caller secret'
    );
  end if;
end $$;

create or replace function public.get_pipeline_internal_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  if p_name not in ('pipeline_orchestrator_secret', 'pipeline_worker_secret') then
    raise exception 'unsupported internal secret';
  end if;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = p_name
  limit 1;

  if v_secret is null or length(v_secret) < 32 then
    raise exception 'internal secret unavailable';
  end if;

  return v_secret;
end;
$$;

revoke all on function public.get_pipeline_internal_secret(text) from public;
revoke all on function public.get_pipeline_internal_secret(text) from anon;
revoke all on function public.get_pipeline_internal_secret(text) from authenticated;
grant execute on function public.get_pipeline_internal_secret(text) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'invoke-pipeline-orchestrator'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'invoke-pipeline-orchestrator',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://jpzkumgndqsdwimbvjku.supabase.co/functions/v1/pipeline-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'pipeline_orchestrator_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);