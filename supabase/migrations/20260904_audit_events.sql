-- ============================================================
-- Migration: audit_events
-- ============================================================
-- Minimal, generic audit trail for consequential/external actions
-- (e.g. outbound email). Written server-side only, via the service
-- role — never by anon or authenticated clients directly — so the
-- log cannot be forged or erased by a compromised browser session.
--
-- Row-level security still restricts read access so a firm can
-- review its own audit trail without being able to alter it.
-- ============================================================

create table if not exists public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  event_type    text not null,
  user_id       uuid,
  firm_id       text,
  matter_id     text,
  target        text,
  payload_hash  text,
  result        text not null check (result in ('success', 'failure', 'denied')),
  detail        text
);

create index if not exists audit_events_firm_id_idx    on public.audit_events (firm_id);
create index if not exists audit_events_created_at_idx  on public.audit_events (created_at desc);
create index if not exists audit_events_event_type_idx  on public.audit_events (event_type);

alter table public.audit_events enable row level security;

-- Firm members can read their own firm's audit trail only.
create policy "audit_events_read_own_firm"
  on public.audit_events for select
  to authenticated
  using (firm_id = public.get_user_firm_id());

-- No INSERT/UPDATE/DELETE policy for anon or authenticated: writes happen
-- only via the service role from trusted server code (api/_shared/auth.ts
-- recordAuditEvent), so the trail cannot be tampered with client-side.
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
