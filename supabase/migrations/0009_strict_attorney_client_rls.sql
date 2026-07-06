-- ============================================================
-- Migration 0009: Strict Attorney-Client Privilege Isolation
-- ============================================================
-- Goal: Every row of sensitive data is STRICTLY scoped to the
-- firm that owns it.  No user from Firm A can ever read, write,
-- or enumerate any data belonging to Firm B (or unclaimed rows).
--
-- Changes:
--   1. Remove the "OR firm_id = 'default'" backdoor from intake_cases.
--   2. Add firm_id to firm_emails, call_recordings, sms_messages,
--      agent_tasks and scope every policy to get_user_firm_id().
--   3. Replace the wide-open policies on deadlines, foia_requests,
--      firm_reports with firm-scoped authenticated-only policies.
--   4. Revoke anon SELECT/UPDATE/DELETE on all sensitive tables.
--   5. Harden firm_memberships INSERT: an invite_code is now
--      required so random sign-ups cannot claim your firm_id.
-- ============================================================


-- ── HELPER: ensure get_user_firm_id() exists (idempotent) ────────────────────
-- Already created in 0008, but re-declared here for standalone safety.
CREATE OR REPLACE FUNCTION public.get_user_firm_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM public.firm_memberships WHERE user_id = auth.uid();
$$;


-- ════════════════════════════════════════════════════════════
-- 1. INTAKE_CASES — close the 'default' backdoor
-- ════════════════════════════════════════════════════════════
-- The old policy allowed any authenticated user to read rows
-- where firm_id = 'default'. That means ALL legacy intakes
-- (which defaulted to 'default') were visible to every user
-- on the platform — a catastrophic attorney-client breach.
--
-- Fix: only show rows whose firm_id exactly matches the
-- authenticated user's firm. Anonymous INSERT stays open
-- so public intake links continue to work.

DROP POLICY IF EXISTS "read intakes"         ON public.intake_cases;
DROP POLICY IF EXISTS "update intake status" ON public.intake_cases;

-- Authenticated attorneys can only read their own firm's intakes
CREATE POLICY "read intakes"
  ON public.intake_cases FOR SELECT TO authenticated
  USING (firm_id = public.get_user_firm_id());

-- Authenticated attorneys can only update their own firm's intakes
CREATE POLICY "update intake status"
  ON public.intake_cases FOR UPDATE TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

-- NOTE: "anon can submit intake" (INSERT) policy is intentionally
-- left untouched — public intake links are anonymous by design.
-- The VITE_FIRM_ID env var sets firm_id at submission time.


-- ════════════════════════════════════════════════════════════
-- 2. FIRM_EMAILS — add firm_id, enforce RLS
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.firm_emails
  ADD COLUMN IF NOT EXISTS firm_id text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS firm_emails_firm_id_idx ON public.firm_emails (firm_id);

-- Drop all wide-open policies
DROP POLICY IF EXISTS "firm_emails_open"          ON public.firm_emails;
DROP POLICY IF EXISTS "firm_emails_authenticated" ON public.firm_emails;

-- Only authenticated users see their own firm's emails
CREATE POLICY "firm_emails_authenticated"
  ON public.firm_emails FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

-- Revoke anon access entirely
REVOKE ALL ON public.firm_emails FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_emails TO authenticated;
GRANT ALL ON public.firm_emails TO service_role;


-- ════════════════════════════════════════════════════════════
-- 3. CALL_RECORDINGS — add firm_id, enforce RLS
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS firm_id text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS call_recordings_firm_id_idx ON public.call_recordings (firm_id);

DROP POLICY IF EXISTS "call_recordings_open"          ON public.call_recordings;
DROP POLICY IF EXISTS "call_recordings_authenticated" ON public.call_recordings;

CREATE POLICY "call_recordings_authenticated"
  ON public.call_recordings FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

-- Inbound Twilio webhooks write via service_role (server-side) — anon blocked
REVOKE ALL ON public.call_recordings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_recordings TO authenticated;
GRANT ALL ON public.call_recordings TO service_role;


-- ════════════════════════════════════════════════════════════
-- 4. SMS_MESSAGES — add firm_id, enforce RLS
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS firm_id text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS sms_messages_firm_id_idx ON public.sms_messages (firm_id);

DROP POLICY IF EXISTS "sms_messages_open"          ON public.sms_messages;
DROP POLICY IF EXISTS "sms_messages_authenticated" ON public.sms_messages;

CREATE POLICY "sms_messages_authenticated"
  ON public.sms_messages FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

REVOKE ALL ON public.sms_messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;


-- ════════════════════════════════════════════════════════════
-- 5. DEADLINES — enforce firm-scoped RLS, remove anon access
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "deadlines_all"              ON public.deadlines;
DROP POLICY IF EXISTS "deadlines_firm_access"      ON public.deadlines;
DROP POLICY IF EXISTS "deadlines_authenticated"    ON public.deadlines;

CREATE POLICY "deadlines_authenticated"
  ON public.deadlines FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

REVOKE ALL ON public.deadlines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deadlines TO authenticated;
GRANT ALL ON public.deadlines TO service_role;


-- ════════════════════════════════════════════════════════════
-- 6. FOIA_REQUESTS — enforce firm-scoped RLS, remove anon access
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "foia_all"           ON public.foia_requests;
DROP POLICY IF EXISTS "foia_firm_access"   ON public.foia_requests;
DROP POLICY IF EXISTS "foia_authenticated" ON public.foia_requests;

CREATE POLICY "foia_authenticated"
  ON public.foia_requests FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

REVOKE ALL ON public.foia_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foia_requests TO authenticated;
GRANT ALL ON public.foia_requests TO service_role;


-- ════════════════════════════════════════════════════════════
-- 7. AGENT_TASKS — add firm_id, enforce RLS
-- ════════════════════════════════════════════════════════════
-- agent_tasks currently has no firm_id — any logged-in user
-- can read ALL tasks for ALL firms (case notes, AI outputs, etc.)
ALTER TABLE public.agent_tasks
  ADD COLUMN IF NOT EXISTS firm_id text NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS agent_tasks_firm_id_idx ON public.agent_tasks (firm_id);

DROP POLICY IF EXISTS "agent_tasks_all"           ON public.agent_tasks;
DROP POLICY IF EXISTS "agent_tasks_authenticated" ON public.agent_tasks;

CREATE POLICY "agent_tasks_authenticated"
  ON public.agent_tasks FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

REVOKE ALL ON public.agent_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tasks TO authenticated;
GRANT ALL ON public.agent_tasks TO service_role;


-- ════════════════════════════════════════════════════════════
-- 8. FIRM_REPORTS — enforce firm-scoped RLS, remove anon access
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "firm_reports_all"           ON public.firm_reports;
DROP POLICY IF EXISTS "firm_reports_authenticated" ON public.firm_reports;

CREATE POLICY "firm_reports_authenticated"
  ON public.firm_reports FOR ALL TO authenticated
  USING  (firm_id = public.get_user_firm_id())
  WITH CHECK (firm_id = public.get_user_firm_id());

REVOKE ALL ON public.firm_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_reports TO authenticated;
GRANT ALL ON public.firm_reports TO service_role;


-- ════════════════════════════════════════════════════════════
-- 9. FIRM_MEMBERSHIPS — add invite_code requirement
-- ════════════════════════════════════════════════════════════
-- The 0008 migration noted: "the first-claim attack still requires
-- knowing the target firm's UUID." That's not strong enough — UUIDs
-- are sometimes guessable or leaked in URLs.
--
-- We add an invite_codes table. To join a firm, a user must supply
-- a valid, unused single-use code tied to their firm_id.
-- This prevents random sign-ups from claiming your firm.

CREATE TABLE IF NOT EXISTS public.invite_codes (
  code        text        PRIMARY KEY,
  firm_id     text        NOT NULL,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  is_used     boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Only firm members can see their own codes
CREATE POLICY "codes_read_own_firm"
  ON public.invite_codes FOR SELECT TO authenticated
  USING (firm_id = public.get_user_firm_id());

-- Only firm members can create codes for their own firm
CREATE POLICY "codes_insert_own_firm"
  ON public.invite_codes FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.get_user_firm_id() AND created_by = auth.uid());

-- No client-side UPDATE — code redemption is done server-side via service_role
REVOKE UPDATE ON public.invite_codes FROM anon, authenticated;
GRANT ALL ON public.invite_codes TO service_role;


-- ── Replace firm_memberships INSERT policy with invite-code check ─────────────
-- The old policy let anyone claim any firm_id they typed in.
-- The new SECURITY DEFINER function validates + redeems the code atomically.

DROP POLICY IF EXISTS "members_claim_firm" ON public.firm_memberships;

-- New function: called from the client at sign-up/onboarding.
-- Validates the invite code, claims the firm, marks code used.
-- Returns true on success, raises on failure.
CREATE OR REPLACE FUNCTION public.claim_firm_with_invite(p_invite_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm_id   text;
  v_code_row  public.invite_codes%ROWTYPE;
BEGIN
  -- 1. Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Already has a firm — idempotent no-op
  SELECT firm_id INTO v_firm_id
    FROM public.firm_memberships WHERE user_id = auth.uid();
  IF FOUND THEN
    RETURN true; -- already claimed
  END IF;

  -- 3. Look up and lock the invite code
  SELECT * INTO v_code_row
    FROM public.invite_codes
   WHERE code = p_invite_code
     AND is_used = false
     AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already-used invite code';
  END IF;

  -- 4. Mark the code redeemed
  UPDATE public.invite_codes
     SET is_used = true, used_by = auth.uid(), used_at = now()
   WHERE code = p_invite_code;

  -- 5. Claim the firm
  INSERT INTO public.firm_memberships (user_id, firm_id)
  VALUES (auth.uid(), v_code_row.firm_id);

  RETURN true;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.claim_firm_with_invite(text) TO authenticated;

-- Firm owners can still directly insert a membership for themselves
-- (first-time setup) IF they know their own firm_id from the env var.
-- We keep a restricted INSERT policy for the owner's initial claim only,
-- gated on a server-side validation step you can layer in your onboarding flow.
-- For now, direct INSERT is disabled; all claims must go through claim_firm_with_invite.
-- To bootstrap the first firm owner: insert directly via the Supabase dashboard
-- or a service_role server call.


-- ════════════════════════════════════════════════════════════
-- 10. DENY anon access to cases (belt-and-suspenders)
-- ════════════════════════════════════════════════════════════
-- 0008 correctly removed the anon policy on cases, but let's
-- explicitly revoke to be safe.
REVOKE ALL ON public.cases FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;

REVOKE ALL ON public.intake_cases FROM anon;  -- keep INSERT policy for anon intake links
-- Re-grant anon INSERT only (for the public intake form):
GRANT INSERT ON public.intake_cases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_cases TO authenticated;
GRANT ALL ON public.intake_cases TO service_role;


-- ════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════
-- Summary of what this migration enforces:
--
--   Table                | Before              | After
--   ---------------------|---------------------|---------------------------
--   intake_cases (SELECT)| any auth user       | own firm only (no 'default' bypass)
--   firm_emails          | any user (open)     | own firm only (auth required)
--   call_recordings      | any user (open)     | own firm only (auth required)
--   sms_messages         | any user (open)     | own firm only (auth required)
--   deadlines            | anon+auth (open)    | own firm only (auth required)
--   foia_requests        | anon+auth (open)    | own firm only (auth required)
--   agent_tasks          | anon+auth (open)    | own firm only (auth required)
--   firm_reports         | anon+auth (open)    | own firm only (auth required)
--   cases                | auth, firm-scoped   | same + anon revoked explicitly
--   firm_memberships     | any UUID claimable  | invite code required
--
-- Data migration note:
--   Existing rows in firm_emails, call_recordings, sms_messages,
--   and agent_tasks now have firm_id = 'default'.  Run this one-time
--   backfill in the Supabase SQL editor AFTER applying this migration
--   (replace 'your-actual-firm-uuid' with your real firm_id):
--
--     UPDATE public.firm_emails      SET firm_id = 'your-actual-firm-uuid' WHERE firm_id = 'default';
--     UPDATE public.call_recordings  SET firm_id = 'your-actual-firm-uuid' WHERE firm_id = 'default';
--     UPDATE public.sms_messages     SET firm_id = 'your-actual-firm-uuid' WHERE firm_id = 'default';
--     UPDATE public.agent_tasks      SET firm_id = 'your-actual-firm-uuid' WHERE firm_id = 'default';
--     UPDATE public.intake_cases     SET firm_id = 'your-actual-firm-uuid' WHERE firm_id = 'default';
--
