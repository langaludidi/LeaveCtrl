
create or replace function public.validate_employee_invitation_for_delivery(
  p_employee_id uuid,
  p_token text
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,private,extensions
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then return false; end if;
  if nullif(btrim(p_token),'') is null then return false; end if;

  select i.organisation_id
    into v_org_id
  from public.employee_invitations i
  where i.employee_id=p_employee_id
    and i.token_hash=digest(p_token,'sha256')
    and i.accepted_at is null
    and i.expires_at>now()
  order by i.created_at desc
  limit 1;

  if v_org_id is null then return false; end if;

  return private.has_org_role(
    v_org_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  );
end;
$$;

revoke execute on function public.validate_employee_invitation_for_delivery(uuid,text)
from public,anon;
grant execute on function public.validate_employee_invitation_for_delivery(uuid,text)
to authenticated;
