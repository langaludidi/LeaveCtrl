-- Prevent circular reporting lines at both the current employee record and
-- effective-dated employment-condition boundaries.

create or replace function private.manager_employee_on_date(
  p_employee_id uuid,
  p_date date
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_manager uuid;
begin
  select ec.manager_employee_id
    into v_manager
  from public.employee_employment_conditions ec
  where ec.employee_id=p_employee_id
    and ec.effective_from<=p_date
    and (ec.effective_to is null or ec.effective_to>=p_date)
  order by ec.effective_from desc
  limit 1;

  if found then
    return v_manager;
  end if;

  select e.manager_employee_id
    into v_manager
  from public.employees e
  where e.id=p_employee_id;

  return v_manager;
end;
$$;

revoke all on function private.manager_employee_on_date(uuid,date)
from public,anon,authenticated;

create or replace function private.would_create_manager_cycle(
  p_employee_id uuid,
  p_manager_employee_id uuid,
  p_effective_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_cursor uuid:=p_manager_employee_id;
  v_seen uuid[]:='{}'::uuid[];
  v_steps integer:=0;
begin
  if p_manager_employee_id is null then
    return false;
  end if;

  while v_cursor is not null loop
    if v_cursor=p_employee_id then
      return true;
    end if;

    if v_cursor=any(v_seen) then
      return true;
    end if;

    v_seen:=array_append(v_seen,v_cursor);
    v_steps:=v_steps+1;

    if v_steps>100 then
      return true;
    end if;

    v_cursor:=private.manager_employee_on_date(v_cursor,p_effective_date);
  end loop;

  return false;
end;
$$;

revoke all on function private.would_create_manager_cycle(uuid,uuid,date)
from public,anon,authenticated;

create or replace function private.reject_employee_manager_cycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_date date;
begin
  if new.manager_employee_id is null then
    return new;
  end if;

  if new.manager_employee_id=new.id then
    raise exception 'employee_cannot_manage_self';
  end if;

  v_date:=private.organisation_business_date(new.organisation_id);

  if private.would_create_manager_cycle(new.id,new.manager_employee_id,v_date) then
    raise exception 'manager_cycle_not_allowed';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_employee_manager_cycle()
from public,anon,authenticated;

drop trigger if exists employees_guard_manager_cycle on public.employees;
create trigger employees_guard_manager_cycle
before insert or update of manager_employee_id
on public.employees
for each row
execute function private.reject_employee_manager_cycle();

create or replace function private.reject_condition_manager_cycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.manager_employee_id is null then
    return new;
  end if;

  if new.manager_employee_id=new.employee_id then
    raise exception 'employee_cannot_manage_self';
  end if;

  if private.would_create_manager_cycle(
    new.employee_id,
    new.manager_employee_id,
    new.effective_from
  ) then
    raise exception 'manager_cycle_not_allowed';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_condition_manager_cycle()
from public,anon,authenticated;

drop trigger if exists employee_conditions_guard_manager_cycle
on public.employee_employment_conditions;

create trigger employee_conditions_guard_manager_cycle
before insert or update of manager_employee_id,effective_from,effective_to
on public.employee_employment_conditions
for each row
execute function private.reject_condition_manager_cycle();
