-- ============================================================================
-- Welcome email on signup
--
-- When a new user signs up (auth.users INSERT), fire an async webhook to
-- /api/webhooks/user-signup on Vercel, which sends a personalized welcome
-- email (onboarding tips + doc links) via the firm's existing email sender.
--
-- Follows the same net.http_post + Vault pattern already used by
-- 20260708_pipeline_cron_and_reaper.sql — the shared secret never touches
-- this file or git history (this repo is public).
--
-- REQUIRED ONE-TIME MANUAL STEP before this trigger will actually send mail
-- — run this once in the Supabase SQL Editor, pasting the same value as the
-- `CRON_SECRET` env var already configured in Vercel/Netlify:
--
--   select vault.create_secret('<PASTE_YOUR_CRON_SECRET_VALUE>', 'signup_webhook_secret');
--
-- ============================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.handle_new_user_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://casebuddy.live/api/webhooks/user-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'signup_webhook_secret'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'email', new.email,
      'display_name', coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
    )
  );
  return new;
exception when others then
  -- Never block signup if the webhook/vault secret isn't set up yet or the
  -- HTTP call fails — welcome email is best-effort, auth must still succeed.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_send_welcome_email on auth.users;

create trigger on_auth_user_created_send_welcome_email
  after insert on auth.users
  for each row
  execute function public.handle_new_user_welcome_email();
