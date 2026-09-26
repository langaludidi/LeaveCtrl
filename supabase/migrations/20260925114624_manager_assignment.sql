create or replace function public.assign_employee_manager(
  p_employee_id uuid,
  p_manager_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select e.organisation_id into v_org_id
  from public.employees e
  where e.id = p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  if p_employee_id = p_manager_employee_id then
    raise exception 'employee_cannot_manage_self';
  end if;

  if not exists (
    select 1 from public.employees m
    where m.id = p_manager_employee_id
      and m.organisation_id = v_org_id
      and m.employment_status = 'active'
  ) then
    raise exception 'invalid_manager';
  end if;

  update public.employees
  set manager_employee_id = p_manager_employee_id,
      updated_at = now()
  where id = p_employee_id;

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'employee', p_employee_id,
    'employee.manager.assigned',
    jsonb_build_object('manager_employee_id', p_manager_employee_id)
  );
end;
$$;

revoke execute on function public.assign_employee_manager(uuid,uuid) from anon;
revoke execute on function public.assign_employee_manager(uuid,uuid) from public;
grant execute on function public.assign_employee_manager(uuid,uuid) to authenticated;
