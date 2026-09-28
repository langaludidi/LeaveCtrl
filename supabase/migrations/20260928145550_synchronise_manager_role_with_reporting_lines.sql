-- Keep reporting-line authority and application roles aligned.
-- Assigning an employee as a manager automatically grants/reactivates the Manager
-- membership when they already have access, and pending/future invitations inherit it.

create or replace function private.sync_manager_capability_from_employee()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_manager public.employees%rowtype;
  v_had_active_role boolean := false;
begin
  if new.manager_employee_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.manager_employee_id is not distinct from old.manager_employee_id then
    return new;
  end if;

  select *
    into v_manager
  from public.employees
  where id = new.manager_employee_id
    and organisation_id = new.organisation_id
    and employment_status = 'active';

  if v_manager.id is null then
    raise exception 'invalid_manager';
  end if;

  if v_manager.user_id is not null then
    select exists(
      select 1
      from public.organisation_memberships m
      where m.organisation_id = new.organisation_id
        and m.user_id = v_manager.user_id
        and m.role = 'manager'
        and m.is_active
    ) into v_had_active_role;

    insert into public.organisation_memberships(
      organisation_id, user_id, role, is_active
    )
    values(
      new.organisation_id, v_manager.user_id, 'manager', true
    )
    on conflict(organisation_id,user_id,role)
    do update set is_active = true;

    if not v_had_active_role then
      insert into public.audit_events(
        organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
      )
      values(
        new.organisation_id,
        auth.uid(),
        'employee',
        v_manager.id,
        'manager.role.auto_granted',
        jsonb_build_object('reporting_employee_id', new.id)
      );
    end if;
  else
    update public.employee_invitations
    set grant_manager_role = true
    where employee_id = v_manager.id
      and accepted_at is null
      and expires_at > now();
  end if;

  return new;
end;
$$;

revoke all on function private.sync_manager_capability_from_employee()
  from public, anon, authenticated;

drop trigger if exists employees_sync_manager_capability on public.employees;
create trigger employees_sync_manager_capability
before insert or update of manager_employee_id
on public.employees
for each row
execute function private.sync_manager_capability_from_employee();

create or replace function private.ensure_manager_role_on_employee_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employee_id is not null
     and exists(
       select 1
       from public.employees report
       where report.organisation_id = new.organisation_id
         and report.manager_employee_id = new.employee_id
         and report.employment_status = 'active'
     ) then
    new.grant_manager_role := true;
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_manager_role_on_employee_invitation()
  from public, anon, authenticated;

drop trigger if exists employee_invitations_ensure_manager_role on public.employee_invitations;
create trigger employee_invitations_ensure_manager_role
before insert or update of employee_id, grant_manager_role
on public.employee_invitations
for each row
execute function private.ensure_manager_role_on_employee_invitation();
