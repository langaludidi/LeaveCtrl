-- Ordinary employees need a safe workforce directory for availability views,
-- not unrestricted access to the full employee record (email, user id, reporting metadata).

create or replace function public.get_workforce_directory()
returns table(
  employee_id uuid,
  first_name text,
  last_name text,
  department_id uuid
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_business_date date;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select m.organisation_id
    into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
  order by m.created_at
  limit 1;

  if v_org_id is null then
    raise exception 'active_organisation_required';
  end if;

  v_business_date:=private.organisation_business_date(v_org_id);

  return query
  select
    e.id,
    e.first_name,
    e.last_name,
    coalesce(
      (
        select ec.department_id
        from public.employee_employment_conditions ec
        where ec.employee_id=e.id
          and ec.effective_from<=v_business_date
          and (ec.effective_to is null or ec.effective_to>=v_business_date)
        order by ec.effective_from desc
        limit 1
      ),
      e.department_id
    )
  from public.employees e
  where e.organisation_id=v_org_id
    and e.employment_status='active'
  order by e.first_name,e.last_name,e.id;
end;
$$;

revoke all on function public.get_workforce_directory()
from public,anon;
grant execute on function public.get_workforce_directory()
to authenticated;

drop policy if exists employees_read on public.employees;
create policy employees_read
on public.employees
for select
to authenticated
using (
  private.is_self_employee(id)
  or private.manages_employee(id)
  or private.has_org_role(
    organisation_id,
    array[
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'reporter'::public.member_role,
      'auditor'::public.member_role
    ]
  )
);

drop policy if exists memberships_read on public.organisation_memberships;
create policy memberships_read
on public.organisation_memberships
for select
to authenticated
using (
  user_id=(select auth.uid())
  or private.has_org_role(
    organisation_id,
    array[
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'auditor'::public.member_role
    ]
  )
);
