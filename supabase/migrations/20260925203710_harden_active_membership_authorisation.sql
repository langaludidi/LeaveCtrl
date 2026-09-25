
create or replace function private.is_self_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.employees e
    join public.organisation_memberships m
      on m.organisation_id=e.organisation_id
     and m.user_id=e.user_id
     and m.is_active
    where e.id=employee
      and e.user_id=auth.uid()
      and e.employment_status='active'
  )
$$;

create or replace function private.manages_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select exists (
    select 1
    from public.employee_employment_conditions ec
    join public.employees manager on manager.id=ec.manager_employee_id
    join public.organisation_memberships membership
      on membership.organisation_id=ec.organisation_id
     and membership.user_id=manager.user_id
     and membership.is_active
    where ec.employee_id=employee
      and ec.effective_from<=current_date
      and (ec.effective_to is null or ec.effective_to>=current_date)
      and manager.user_id=auth.uid()
      and manager.organisation_id=ec.organisation_id
      and manager.employment_status='active'
  )
  or exists (
    select 1
    from public.employees report
    join public.employees manager on manager.id=report.manager_employee_id
    join public.organisation_memberships membership
      on membership.organisation_id=report.organisation_id
     and membership.user_id=manager.user_id
     and membership.is_active
    where report.id=employee
      and not exists(
        select 1
        from public.employee_employment_conditions ec
        where ec.employee_id=report.id
          and ec.effective_from<=current_date
          and (ec.effective_to is null or ec.effective_to>=current_date)
      )
      and manager.user_id=auth.uid()
      and manager.organisation_id=report.organisation_id
      and manager.employment_status='active'
  );
$$;

revoke execute on function private.capture_condition_from_schedule_assignment()
from public,anon,authenticated;
revoke execute on function private.reprice_liability_after_condition_change()
from public,anon,authenticated;
