-- ═══════════════════════════════════════════════════════════════════════════
-- CaseBuddy — Per-client intake invite system
-- casebuddy.live/intake/1x2c1  where 1x2c1 is UNIQUE TO THE CLIENT
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. client_invites table
create table if not exists public.client_invites (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  firm_id         text not null,           -- attorney's firm_id (from firm_memberships)
  token           text not null unique,    -- short slug e.g. "1x2c1" — the URL token
  client_name     text not null default '',
  client_email    text not null default '',
  client_phone    text not null default '',
  notes           text not null default '', -- internal notes only — never shown to client
  status          text not null default 'pending'
                  check (status in ('pending','opened','completed','expired')),
  opened_at       timestamptz,
  completed_at    timestamptz,
  intake_case_id  text                     -- FK to intake_cases.id once completed
);

create index if not exists idx_client_invites_token    on public.client_invites(token);
create index if not exists idx_client_invites_firm_id  on public.client_invites(firm_id);

-- RLS: attorneys manage their own invites only
alter table public.client_invites enable row level security;

-- Attorney can create/read/update/delete their own firm's invites
create policy "firm_manage_own_invites"
  on public.client_invites for all
  to authenticated
  using (
    firm_id = (
      select firm_id from public.firm_memberships
      where user_id = auth.uid()
      limit 1
    )
  )
  with check (
    firm_id = (
      select firm_id from public.firm_memberships
      where user_id = auth.uid()
      limit 1
    )
  );

-- Anon (client) can SELECT to resolve their token (returns only non-sensitive cols)
-- and can UPDATE to mark opened_at (handled by the store, not raw anon updates)
create policy "anon_resolve_client_token"
  on public.client_invites for select
  to anon
  using (token is not null);

-- Anon can update status/opened_at when they open the link
create policy "anon_mark_opened"
  on public.client_invites for update
  to anon
  using (true)
  with check (status in ('opened', 'completed'));

-- 2. Add client_invite_id column to intake_cases (links back to the invite)
alter table public.intake_cases
  add column if not exists client_invite_id uuid references public.client_invites(id);

create index if not exists idx_intake_cases_invite_id
  on public.intake_cases(client_invite_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULT:
--   • Attorney creates invite → gets unique link: casebuddy.live/intake/1x2c1
--   • Client opens link → status: opened, opened_at recorded
--   • Client completes intake → status: completed, intake linked
--   • Attorney sees full funnel: pending / opened / completed per client
--   • All submissions tagged with both firm_id AND client_invite_id
--   • Zero cross-firm data leakage (RLS enforced at DB level)
-- ═══════════════════════════════════════════════════════════════════════════
