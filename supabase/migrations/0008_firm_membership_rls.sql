-- Replaces user_metadata.firm_id JWT claim with a server-side firm_memberships
-- table. The old approach was exploitable: `user_metadata` is client-writable,
-- so any signed-in user could call supabase.auth.updateUser({ data: { firm_id:
-- 'victim-firm-uuid' } }) and gain access to another firm's cases.
--
-- New model:
--   - firm_memberships(user_id PK, firm_id TEXT) — PRIMARY KEY on user_id so a
--     user can only claim one firm. No UPDATE policy, so the claim is immutable
--     from the client once set.
--   - get_user_firm_id() SECURITY DEFINER — reads from firm_memberships; used
--     by all firm-scoped RLS policies.
--   - All RLS on cases, intake_cases, and agent tables updated to use this
--     function instead of auth.jwt() -> 'user_metadata'.
-- Run: supabase db push   — or paste into Dashboard → SQL editor.

-- ── firm_memberships ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.firm_memberships (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id    text        NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firm_memberships ENABLE ROW LEVEL SECURITY;

-- Users can read their own membership (for the client to sync localStorage)
CREATE POLICY "members_read_own"
  ON public.firm_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can INSERT their own membership on first sign-in to claim a firm.
-- PRIMARY KEY on user_id prevents re-claiming (only one firm per user ever).
-- Note: the first-claim attack (a user claiming any arbitrary UUID on sign-up)
-- still requires knowing the target firm's UUID. For invite-code hardening,
-- add an invite_codes table and validate here in a future migration.
CREATE POLICY "members_claim_firm"
  ON public.firm_memberships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE policy — client cannot change firm membership once claimed.

-- ── helper: SECURITY DEFINER lookup so RLS doesn't recurse ──────────────────

CREATE OR REPLACE FUNCTION public.get_user_firm_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM public.firm_memberships WHERE user_id = auth.uid();
$$;

-- ── cases: replace user_metadata claim with firm_memberships lookup ───────────

DROP POLICY IF EXISTS "cases_same_firm_authenticated" ON public.cases;

CREATE POLICY "cases_same_firm_authenticated"
  ON public.cases FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

-- ── intake_cases: add firm_id for multi-firm isolation ───────────────────────
-- The public intake link submits anonymously; firm_id is set by the client
-- from the VITE_FIRM_ID env var (burned into the bundle). Existing rows keep
-- the 'default' sentinel so the backwards-compat OR clause below finds them.

ALTER TABLE public.intake_cases
  ADD COLUMN IF NOT EXISTS firm_id text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS intake_cases_firm_id_idx
  ON public.intake_cases (firm_id);

-- Drop old open policies installed by 0001 / 0003
DROP POLICY IF EXISTS "read intakes"          ON public.intake_cases;
DROP POLICY IF EXISTS "update intake status"  ON public.intake_cases;

-- Authenticated firm members read only their firm's intakes.
-- `firm_id = 'default'` backwards-compat for rows that predate this migration.
CREATE POLICY "read intakes"
  ON public.intake_cases FOR SELECT TO authenticated
  USING (
    firm_id = public.get_user_firm_id()
    OR firm_id = 'default'
  );

CREATE POLICY "update intake status"
  ON public.intake_cases FOR UPDATE TO authenticated
  USING (
    firm_id = public.get_user_firm_id()
    OR firm_id = 'default'
  )
  WITH CHECK (
    firm_id = public.get_user_firm_id()
    OR firm_id = 'default'
  );

-- The anonymous INSERT policy ("anon can submit intake") is intentionally left
-- open — prospects hit the public intake link without being signed in.

-- ── agent_deadlines: scope to firm ───────────────────────────────────────────

DROP POLICY IF EXISTS "deadlines_firm_access" ON public.agent_deadlines;

CREATE POLICY "deadlines_firm_access"
  ON public.agent_deadlines FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id() OR firm_id = 'default')
  WITH CHECK (firm_id = public.get_user_firm_id() OR firm_id = 'default');

-- ── agent_research_flags: scope to firm ──────────────────────────────────────

DROP POLICY IF EXISTS "research_flags_access" ON public.agent_research_flags;

CREATE POLICY "research_flags_access"
  ON public.agent_research_flags FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id() OR firm_id = 'default')
  WITH CHECK (firm_id = public.get_user_firm_id() OR firm_id = 'default');

-- ── agent_notifications: scope to firm ───────────────────────────────────────

DROP POLICY IF EXISTS "notifications_access" ON public.agent_notifications;

CREATE POLICY "notifications_access"
  ON public.agent_notifications FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id() OR firm_id = 'default')
  WITH CHECK (firm_id = public.get_user_firm_id() OR firm_id = 'default');
