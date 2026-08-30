-- Forward-only public intake authorization contract.
--
-- Goals:
--   * Anonymous callers never choose authoritative firm_id.
--   * New public intake ownership is derived from a client-invite token or the
--     firm's shareable intake token on the server.
--   * Existing partial intakes may resume with their high-entropy resume token.
--   * client_invite_id is derived server-side and cannot be supplied by the client.
--   * Public invite resolution returns an explicit safe field set; internal notes
--     never leave the database.
--   * Anonymous direct INSERT is removed so the RPC cannot be bypassed.

-- ── 1. Public token resolution: explicit safe response, no internal notes ───

DROP FUNCTION IF EXISTS public.resolve_public_intake_token(text);

CREATE FUNCTION public.resolve_public_intake_token(p_token text)
RETURNS TABLE (
  firm_id text,
  invite_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  invite_status text,
  intake_mode text,
  preferred_language text,
  is_client_invite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token text := trim(coalesce(p_token, ''));
  v_invite public.client_invites%rowtype;
  v_firm text;
  v_mode text;
  v_language text;
BEGIN
  IF length(v_token) < 5 OR length(v_token) > 128 THEN
    RETURN;
  END IF;

  SELECT * INTO v_invite
  FROM public.client_invites ci
  WHERE ci.token = v_token
    AND ci.status IN ('pending', 'opened')
  LIMIT 1;

  IF FOUND THEN
    IF v_invite.status = 'pending' THEN
      UPDATE public.client_invites
      SET status = 'opened', opened_at = coalesce(opened_at, now())
      WHERE id = v_invite.id AND status = 'pending';
      v_invite.status := 'opened';
    END IF;

    -- Preserve the existing routing/language UX without exposing the notes
    -- column itself. Only these bounded metadata values leave the function.
    v_mode := substring(coalesce(v_invite.notes, '') from '\[mode:(voice|chat|form)\]');
    IF v_mode NOT IN ('voice', 'chat', 'form') THEN v_mode := null; END IF;
    v_language := CASE
      WHEN coalesce(v_invite.notes, '') ~* '(spanish|hispanic)' THEN 'es'
      ELSE 'en'
    END;

    RETURN QUERY
    SELECT
      v_invite.firm_id,
      v_invite.id,
      v_invite.client_name,
      v_invite.client_email,
      v_invite.client_phone,
      v_invite.status,
      v_mode,
      v_language,
      true;
    RETURN;
  END IF;

  SELECT fm.firm_id INTO v_firm
  FROM public.firm_memberships fm
  WHERE fm.intake_token = v_token
  LIMIT 1;

  IF v_firm IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_firm,
      null::uuid,
      ''::text,
      ''::text,
      ''::text,
      null::text,
      null::text,
      'en'::text,
      false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_intake_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_public_intake_token(text) TO anon, authenticated;

-- ── 2. Public intake upsert: derive tenant/invite ownership server-side ─────

DROP FUNCTION IF EXISTS public.upsert_public_intake(text, text, jsonb, text);

CREATE FUNCTION public.upsert_public_intake(
  p_resume_token text,
  p_route_token  text,
  p_payload      jsonb,
  p_completion   text DEFAULT 'partial'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_resume text := trim(coalesce(p_resume_token, ''));
  v_route text := trim(coalesce(p_route_token, ''));
  v_id uuid;
  v_firm text;
  v_invite_id uuid;
  v_existing_invite_id uuid;
  v_route_firm text;
  v_route_invite_id uuid;
  v_recording_path text;
BEGIN
  IF length(v_resume) < 16 OR length(v_resume) > 128 THEN
    RAISE EXCEPTION 'invalid resume token';
  END IF;
  IF p_completion NOT IN ('partial', 'complete', 'abandoned') THEN
    RAISE EXCEPTION 'invalid completion state';
  END IF;

  -- Resume tokens are capabilities for one existing row. Firm ownership is
  -- immutable once that row exists; callers never get to replace it.
  SELECT i.id, i.firm_id, i.client_invite_id
    INTO v_id, v_firm, v_existing_invite_id
  FROM public.intake_cases i
  WHERE i.resume_token = v_resume
  LIMIT 1;

  IF v_id IS NULL THEN
    -- Authenticated staff are scoped to their server-resolved membership.
    IF auth.uid() IS NOT NULL THEN
      v_firm := public.get_user_firm_id();
    END IF;

    -- Anonymous/public creation requires a valid server-resolved route token.
    IF v_firm IS NULL THEN
      IF length(v_route) < 5 OR length(v_route) > 128 THEN
        RAISE EXCEPTION 'invalid intake route';
      END IF;

      SELECT ci.firm_id, ci.id
        INTO v_firm, v_invite_id
      FROM public.client_invites ci
      WHERE ci.token = v_route
        AND ci.status IN ('pending', 'opened')
      LIMIT 1;

      IF v_firm IS NULL THEN
        SELECT fm.firm_id
          INTO v_firm
        FROM public.firm_memberships fm
        WHERE fm.intake_token = v_route
        LIMIT 1;
      END IF;
    END IF;

    IF v_firm IS NULL OR length(trim(v_firm)) = 0 THEN
      RAISE EXCEPTION 'invalid intake route';
    END IF;

    INSERT INTO public.intake_cases (
      firm_id, resume_token, completion_state, last_activity_at,
      full_name, contact, matter_type, jurisdiction, summary,
      score, disposition, status, urgency,
      intake, score_detail, transcript, extracted,
      recording_consent, recording_path, recording_seconds,
      client_invite_id
    )
    VALUES (
      v_firm, v_resume, p_completion, now(),
      coalesce(p_payload->>'full_name', 'Prospective Client'),
      coalesce(p_payload->>'contact', ''),
      coalesce(p_payload->>'matter_type', 'General Inquiry'),
      coalesce(p_payload->>'jurisdiction', ''),
      coalesce(p_payload->>'summary', ''),
      coalesce((p_payload->>'score')::int, 0),
      coalesce(p_payload->>'disposition', 'review'),
      coalesce(p_payload->>'status', 'new'),
      coalesce(p_payload->>'urgency', 'medium'),
      coalesce(p_payload->'intake', '{}'::jsonb),
      coalesce(p_payload->'score_detail', '{}'::jsonb),
      coalesce(p_payload->'transcript', '[]'::jsonb),
      coalesce(p_payload->'extracted', '{}'::jsonb),
      coalesce((p_payload->>'recording_consent')::boolean, false),
      null,
      coalesce((p_payload->>'recording_seconds')::int, 0),
      v_invite_id
    )
    RETURNING id INTO v_id;
  ELSE
    -- If the browser still has the route token, require it to resolve to the
    -- same tenant (and same invite when this intake originated from one).
    IF length(v_route) > 0 THEN
      SELECT ci.firm_id, ci.id
        INTO v_route_firm, v_route_invite_id
      FROM public.client_invites ci
      WHERE ci.token = v_route
        AND ci.status IN ('pending', 'opened', 'completed')
      LIMIT 1;

      IF v_route_firm IS NULL THEN
        SELECT fm.firm_id
          INTO v_route_firm
        FROM public.firm_memberships fm
        WHERE fm.intake_token = v_route
        LIMIT 1;
      END IF;

      IF v_route_firm IS NULL OR v_route_firm <> v_firm THEN
        RAISE EXCEPTION 'invalid intake route';
      END IF;
      IF v_existing_invite_id IS NOT NULL
         AND v_route_invite_id IS DISTINCT FROM v_existing_invite_id THEN
        RAISE EXCEPTION 'invalid intake route';
      END IF;
    END IF;

    -- A finished intake is immutable from the public side; a stale browser tab
    -- cannot reopen or overwrite it.
    IF (SELECT completion_state FROM public.intake_cases WHERE id = v_id) = 'complete' THEN
      RETURN v_id;
    END IF;
  END IF;

  v_recording_path := nullif(p_payload->>'recording_path', '');
  IF v_recording_path IS NOT NULL
     AND v_recording_path NOT LIKE (v_firm || '/' || v_id::text || '/%') THEN
    RAISE EXCEPTION 'invalid recording path';
  END IF;

  UPDATE public.intake_cases SET
    completion_state  = p_completion,
    last_activity_at  = now(),
    full_name         = coalesce(nullif(p_payload->>'full_name', ''), full_name),
    contact           = coalesce(nullif(p_payload->>'contact', ''), contact),
    matter_type       = coalesce(nullif(p_payload->>'matter_type', ''), matter_type),
    jurisdiction      = coalesce(nullif(p_payload->>'jurisdiction', ''), jurisdiction),
    summary           = coalesce(nullif(p_payload->>'summary', ''), summary),
    score             = coalesce((p_payload->>'score')::int, score),
    disposition       = coalesce(nullif(p_payload->>'disposition', ''), disposition),
    status            = coalesce(nullif(p_payload->>'status', ''), status),
    urgency           = coalesce(nullif(p_payload->>'urgency', ''), urgency),
    intake            = case when p_payload ? 'intake'       then p_payload->'intake'       else intake end,
    score_detail      = case when p_payload ? 'score_detail' then p_payload->'score_detail' else score_detail end,
    transcript        = case when p_payload ? 'transcript'   then p_payload->'transcript'   else transcript end,
    extracted         = case when p_payload ? 'extracted'    then p_payload->'extracted'    else extracted end,
    recording_consent = coalesce((p_payload->>'recording_consent')::boolean, recording_consent),
    recording_path    = coalesce(v_recording_path, recording_path),
    recording_seconds = greatest(coalesce((p_payload->>'recording_seconds')::int, 0), recording_seconds)
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_public_intake(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_public_intake(text, text, jsonb, text) TO anon, authenticated;

-- ── 3. Invite completion requires the same bearer token used to open it ─────

REVOKE ALL ON FUNCTION public.complete_client_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.complete_client_invite(uuid, uuid);

CREATE OR REPLACE FUNCTION public.complete_client_invite(
  p_token text,
  p_intake_case_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token text := trim(coalesce(p_token, ''));
  v_invite public.client_invites%rowtype;
BEGIN
  IF length(v_token) < 5 OR length(v_token) > 128 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_invite
  FROM public.client_invites ci
  WHERE ci.token = v_token
    AND ci.status IN ('pending', 'opened')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.intake_cases i
    WHERE i.id = p_intake_case_id
      AND i.client_invite_id = v_invite.id
      AND i.firm_id = v_invite.firm_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.client_invites
  SET status = 'completed',
      completed_at = coalesce(completed_at, now()),
      intake_case_id = p_intake_case_id::text
  WHERE id = v_invite.id
    AND status IN ('pending', 'opened');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_client_invite(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_client_invite(text, uuid) TO anon, authenticated;

-- ── 4. Close the direct-table anonymous bypass ──────────────────────────────
-- All public creation now goes through upsert_public_intake(), which derives
-- ownership server-side. Authenticated staff retain their existing firm-scoped
-- RLS policies and table grants.

DROP POLICY IF EXISTS "anon can submit intake" ON public.intake_cases;
DROP POLICY IF EXISTS "anon_insert_intakes" ON public.intake_cases;
DROP POLICY IF EXISTS "intake_public_submit" ON public.intake_cases;
DROP POLICY IF EXISTS "Anyone can insert intakes" ON public.intake_cases;
REVOKE INSERT ON public.intake_cases FROM anon;
