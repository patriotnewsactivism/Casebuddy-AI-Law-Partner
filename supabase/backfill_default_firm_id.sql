-- ================================================================
-- SELF-HEALING BACKFILL: tag 'default' rows with your real firm_id
-- ================================================================
-- Just paste this entire block into Supabase SQL Editor and click Run.
-- It finds your firm_id automatically from firm_memberships.
-- No UUIDs to copy. No variables to change. Run as-is.
-- ================================================================

DO $$
DECLARE
  v_firm_id TEXT;
BEGIN
  -- Auto-detect: grab the oldest firm_id that is NOT 'default'
  -- (this is the firm owner's UUID, created when they first signed in)
  SELECT firm_id INTO v_firm_id
  FROM public.firm_memberships
  WHERE firm_id IS NOT NULL
    AND firm_id <> 'default'
  ORDER BY claimed_at ASC
  LIMIT 1;

  IF v_firm_id IS NULL THEN
    RAISE NOTICE 'No firm membership found yet. Sign in to CaseBuddy first, then re-run this script.';
    RETURN;
  END IF;

  RAISE NOTICE 'Using firm_id: %', v_firm_id;

  -- Backfill all tables that may have 'default' rows
  UPDATE public.intake_cases    SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'intake_cases updated: % rows', ROW_COUNT;

  UPDATE public.cases           SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'cases updated: % rows', ROW_COUNT;

  UPDATE public.firm_emails     SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'firm_emails updated: % rows', ROW_COUNT;

  UPDATE public.call_recordings SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'call_recordings updated: % rows', ROW_COUNT;

  UPDATE public.sms_messages    SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'sms_messages updated: % rows', ROW_COUNT;

  UPDATE public.agent_tasks     SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'agent_tasks updated: % rows', ROW_COUNT;

  UPDATE public.deadlines       SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'deadlines updated: % rows', ROW_COUNT;

  UPDATE public.foia_requests   SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'foia_requests updated: % rows', ROW_COUNT;

  UPDATE public.firm_reports    SET firm_id = v_firm_id WHERE firm_id = 'default';
  RAISE NOTICE 'firm_reports updated: % rows', ROW_COUNT;

  RAISE NOTICE '✅ Backfill complete. All default rows now scoped to firm: %', v_firm_id;
END;
$$;
