-- Keep invitation-token delivery validation internal to the Edge Function.
-- The caller identity is supplied by the already authenticated Edge Function and
-- independently re-authorised against active Organisation Admin / HR Admin membership.

create or replace function public.validate_employee_invitation_for_delivery(
  p_employee_id uuid,
  p_token text,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, extensions
as $$
declare
  v_org_id uuid;
begin
  if p_actor_user_id is null then return false; end if;
  if nullif(btrim(p_token), '') is null then return false; end if;

  select i.organisation_id
    into v_org_id
  from public.employee_invitations i
  where i.employee_id = p_employee_id
    and i.token_hash = digest(p_token, 'sha256')
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_org_id is null then return false; end if;

  return exists (
    select 1
    from public.organisation_memberships m
    where m.organisation_id = v_org_id
      and m.user_id = p_actor_user_id
      and m.is_active
      and m.role in ('org_admin','hr_admin')
  );
end;
$$;

revoke all on function public.validate_employee_invitation_for_delivery(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.validate_employee_invitation_for_delivery(uuid,text,uuid)
  to service_role;
