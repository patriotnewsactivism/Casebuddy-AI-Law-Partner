-- Applied to production on 2026-08-24 after frontend cutover.
-- Tenant-scope SECURITY DEFINER RPCs and remove anonymous execution.

CREATE OR REPLACE FUNCTION public.check_conflicts(
  search_client_name text,
  similarity_threshold double precision DEFAULT 0.3
)
RETURNS TABLE(
  case_id uuid,
  case_name text,
  client_name text,
  opposing_party text,
  match_type text,
  match_field text,
  similarity_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role' AND (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH accessible_cases AS (
    SELECT c.*
    FROM public.cases c
    WHERE (SELECT auth.role()) = 'service_role'
       OR c.user_id = (SELECT auth.uid())
       OR c.firm_id = public.get_user_firm_id()
  )
  SELECT c.id, c.name, c.client_name, c.opposing_party,
         'client'::text, 'client_name'::text,
         similarity(c.client_name, search_client_name)::float
  FROM accessible_cases c
  WHERE similarity(c.client_name, search_client_name) >= similarity_threshold

  UNION ALL

  SELECT c.id, c.name, c.client_name, c.opposing_party,
         'opposing'::text, 'opposing_party'::text,
         similarity(c.opposing_party, search_client_name)::float
  FROM accessible_cases c
  WHERE c.opposing_party IS NOT NULL
    AND similarity(c.opposing_party, search_client_name) >= similarity_threshold

  UNION ALL

  SELECT c.id, c.name, c.client_name, c.opposing_party,
         'cross_conflict'::text, 'opposing_party'::text,
         similarity(c.opposing_party, search_client_name)::float
  FROM accessible_cases c
  WHERE c.opposing_party IS NOT NULL
    AND similarity(c.opposing_party, search_client_name) >= (similarity_threshold + 0.1)

  ORDER BY similarity_score DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_bates_numbers(p_project_id uuid, p_count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_start integer;
BEGIN
  IF p_count <= 0 THEN
    RAISE EXCEPTION 'p_count must be positive';
  END IF;

  IF (SELECT auth.role()) <> 'service_role' AND (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.projects p
  SET bates_counter = p.bates_counter + p_count,
      updated_at = now()
  WHERE p.id = p_project_id
    AND (
      (SELECT auth.role()) = 'service_role'
      OR p.user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.cases c
        WHERE c.id = p.case_id
          AND (
            c.user_id = (SELECT auth.uid())
            OR c.firm_id = public.get_user_firm_id()
          )
      )
    )
  RETURNING p.bates_counter - p_count INTO v_start;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Project not found or not accessible';
  END IF;

  RETURN v_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_case_analytics(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_documents_count integer;
  v_documents_analyzed integer;
  v_timeline_events integer;
  v_mock_jury_sessions integer;
BEGIN
  IF NOT (
    (SELECT auth.role()) = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id = p_case_id
        AND (
          c.user_id = (SELECT auth.uid())
          OR c.firm_id = public.get_user_firm_id()
        )
    )
  ) THEN
    RAISE EXCEPTION 'Case not found or not accessible' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_documents_count
  FROM public.documents WHERE case_id = p_case_id;

  SELECT count(*) INTO v_documents_analyzed
  FROM public.documents WHERE case_id = p_case_id AND ai_analyzed = true;

  SELECT count(*) INTO v_timeline_events
  FROM public.timeline_events WHERE case_id = p_case_id;

  SELECT count(*) INTO v_mock_jury_sessions
  FROM public.mock_jury_sessions WHERE case_id = p_case_id;

  INSERT INTO public.case_analytics (
    case_id, documents_count, documents_analyzed, timeline_events, mock_jury_sessions
  )
  VALUES (
    p_case_id, v_documents_count, v_documents_analyzed, v_timeline_events, v_mock_jury_sessions
  )
  ON CONFLICT (case_id) DO UPDATE SET
    documents_count = EXCLUDED.documents_count,
    documents_analyzed = EXCLUDED.documents_analyzed,
    timeline_events = EXCLUDED.timeline_events,
    mock_jury_sessions = EXCLUDED.mock_jury_sessions,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.user_case_role(check_case_id uuid, check_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT CASE
    WHEN (SELECT auth.role()) <> 'service_role'
         AND (check_user_id IS DISTINCT FROM (SELECT auth.uid()))
      THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.cases
      WHERE id = check_case_id AND user_id = check_user_id
    ) THEN 'owner'
    ELSE (
      SELECT role
      FROM public.case_members
      WHERE case_id = check_case_id AND user_id = check_user_id
      LIMIT 1
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_case_access(check_case_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT CASE
    WHEN (SELECT auth.role()) <> 'service_role'
         AND (check_user_id IS DISTINCT FROM (SELECT auth.uid()))
      THEN false
    ELSE
      EXISTS (
        SELECT 1 FROM public.cases
        WHERE id = check_case_id AND user_id = check_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.case_members
        WHERE case_id = check_case_id AND user_id = check_user_id
      )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_conflicts(text, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reserve_bates_numbers(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_case_analytics(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_case_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_case_access(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_conflicts(text, double precision) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_bates_numbers(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_case_analytics(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_case_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_case_access(uuid, uuid) TO authenticated, service_role;
