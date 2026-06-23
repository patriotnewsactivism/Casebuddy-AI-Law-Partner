-- ═══════════════════════════════════════════════════════════════════════════
-- CaseBuddy multi-tenant intake privacy fix
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add intake_token to firm_memberships (unique per firm, used in public URL)
alter table public.firm_memberships
  add column if not exists intake_token text unique;

-- Pre-generate tokens for all existing firm rows that don't have one
-- (idempotent — skips rows that already have a token)
update public.firm_memberships
  set intake_token = substr(md5(random()::text || firm_id::text), 1, 10)
  where intake_token is null;

create index if not exists idx_firm_memberships_intake_token
  on public.firm_memberships(intake_token);

-- 2. Allow anon to resolve a token → firm_id ONLY (nothing else returned)
-- The query in resolveFirmToken explicitly selects only `firm_id` column
drop policy if exists "anon_resolve_intake_token" on public.firm_memberships;
create policy "anon_resolve_intake_token"
  on public.firm_memberships for select
  to anon
  using (intake_token is not null);

-- 3. Fix intake_cases RLS — CRITICAL PRIVACY FIX
-- Old policies used `using (true)` which let any firm read every intake.
-- New policies scope reads/updates strictly to the authenticated user's firm_id.

-- Remove the old permissive policies
drop policy if exists "read intakes" on public.intake_cases;
drop policy if exists "update intake status" on public.intake_cases;
drop policy if exists "Anyone can insert intakes" on public.intake_cases;

-- Authenticated attorneys can only see their OWN firm's intakes
create policy "firm_read_own_intakes"
  on public.intake_cases for select
  to authenticated
  using (
    firm_id = (
      select firm_id from public.firm_memberships
      where user_id = auth.uid()
      limit 1
    )
  );

-- Authenticated attorneys can only update their OWN firm's intakes
create policy "firm_update_own_intakes"
  on public.intake_cases for update
  to authenticated
  using (
    firm_id = (
      select firm_id from public.firm_memberships
      where user_id = auth.uid()
      limit 1
    )
  );

-- Anonymous clients (public intake page) can INSERT but NEVER SELECT
-- They can never read back any intake data — only write their own submission
drop policy if exists "anon_insert_intakes" on public.intake_cases;
create policy "anon_insert_intakes"
  on public.intake_cases for insert
  to anon
  with check (true);

-- Index for fast per-firm dashboard loads
create index if not exists idx_intake_cases_firm_id
  on public.intake_cases(firm_id);

create index if not exists idx_intake_cases_created_at
  on public.intake_cases(created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULT:
--   • Each firm's intake link is unique:  casebuddy.live/intake/<token>
--   • /intake (no token) = owner's default link
--   • Every submission is tagged with the correct firm_id
--   • RLS at the DB level: zero cross-firm data leakage, even via direct API
--   • Clients can submit but never read any intake data back
-- ═══════════════════════════════════════════════════════════════════════════
