-- resolve_public_intake_token() may mark a pending invite as opened, so callers
-- that invoke it cannot be declared STABLE. Recreate the route helpers as
-- VOLATILE (the default) while preserving their security-definer boundary.

create or replace function public.resolve_request_intake_route(p_claimed_firm text default null)
returns table (firm_id text, invite_id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_token text := public.request_intake_token();
  v_claimed text := trim(coalesce(p_claimed_firm, ''));
  v_firm text;
  v_invite uuid;
  v_count integer;
begin
  if v_token is not null then
    select r.firm_id, r.invite_id
      into v_firm, v_invite
    from public.resolve_public_intake_token(v_token) r
    limit 1;

    if v_firm is null then
      raise exception 'invalid public intake token' using errcode = '42501';
    end if;
    if v_claimed <> '' and v_claimed <> v_firm then
      raise exception 'intake firm does not match referral token' using errcode = '42501';
    end if;
    return query select v_firm, v_invite;
    return;
  end if;

  if (select auth.uid()) is not null then
    v_firm := public.get_user_firm_id();
    if v_firm is null then
      raise exception 'firm membership required' using errcode = '42501';
    end if;
    if v_claimed <> '' and v_claimed <> v_firm then
      raise exception 'intake firm does not match signed-in firm' using errcode = '42501';
    end if;
    return query select v_firm, null::uuid;
    return;
  end if;

  select count(distinct fm.firm_id), min(fm.firm_id)
    into v_count, v_firm
  from public.firm_memberships fm
  where fm.firm_id is not null and length(trim(fm.firm_id)) > 0;

  if v_count <> 1 or v_firm is null then
    raise exception 'a firm-specific intake link is required' using errcode = '42501';
  end if;
  if v_claimed <> '' and v_claimed <> v_firm then
    raise exception 'intake firm does not match canonical firm' using errcode = '42501';
  end if;

  return query select v_firm, null::uuid;
end;
$$;

revoke all on function public.resolve_request_intake_route(text) from public;
grant execute on function public.resolve_request_intake_route(text) to anon, authenticated, service_role;

create or replace function public.resolve_request_intake_firm(p_claimed_firm text)
returns text
language sql
volatile
security definer
set search_path = public, pg_catalog
as $$
  select r.firm_id from public.resolve_request_intake_route(p_claimed_firm) r limit 1;
$$;

revoke all on function public.resolve_request_intake_firm(text) from public;
grant execute on function public.resolve_request_intake_firm(text) to anon, authenticated, service_role;
