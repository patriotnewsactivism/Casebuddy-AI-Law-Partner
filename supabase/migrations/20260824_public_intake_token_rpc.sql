-- Resolve public intake links without granting anon SELECT/UPDATE across token tables.

create or replace function public.resolve_public_intake_token(p_token text)
returns table (
  firm_id text,
  invite_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  notes text,
  invite_status text,
  is_client_invite boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := trim(coalesce(p_token, ''));
  v_invite public.client_invites%rowtype;
  v_firm text;
begin
  if length(v_token) < 5 or length(v_token) > 64 then return; end if;

  select * into v_invite
  from public.client_invites ci
  where ci.token = v_token and ci.status <> 'expired'
  limit 1;

  if found then
    if v_invite.status = 'pending' then
      update public.client_invites
      set status = 'opened', opened_at = coalesce(opened_at, now())
      where id = v_invite.id and status = 'pending';
      v_invite.status := 'opened';
    end if;

    return query select v_invite.firm_id, v_invite.id, v_invite.client_name,
      v_invite.client_email, v_invite.client_phone, v_invite.notes,
      v_invite.status, true;
    return;
  end if;

  select fm.firm_id into v_firm
  from public.firm_memberships fm
  where fm.intake_token = v_token
  limit 1;

  if v_firm is not null then
    return query select v_firm, null::uuid, ''::text, ''::text, ''::text,
      ''::text, null::text, false;
  end if;
end;
$$;

revoke all on function public.resolve_public_intake_token(text) from public;
grant execute on function public.resolve_public_intake_token(text) to anon, authenticated;

create or replace function public.complete_client_invite(p_invite_id uuid, p_intake_case_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.intake_cases i
    where i.id = p_intake_case_id and i.client_invite_id = p_invite_id
  ) then return false; end if;

  update public.client_invites
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      intake_case_id = p_intake_case_id::text
  where id = p_invite_id and status in ('pending', 'opened');

  return found;
end;
$$;

revoke all on function public.complete_client_invite(uuid, uuid) from public;
grant execute on function public.complete_client_invite(uuid, uuid) to anon, authenticated;