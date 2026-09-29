-- Collapse the repeated employee / membership / organisation bootstrap into
-- one RLS-governed read without granting any new data visibility.

create or replace function public.get_current_context_v1()
returns table(
  employee_id uuid,
  organisation_id uuid,
  first_name text,
  last_name text,
  email text,
  department_id uuid,
  manager_employee_id uuid,
  start_date date,
  organisation_name text,
  timezone text,
  country_code text,
  currency_code text,
  roles public.member_role[]
)
language sql
stable
security invoker
set search_path=''
as $$
  select
    e.id,
    e.organisation_id,
    e.first_name,
    e.last_name,
    e.email,
    e.department_id,
    e.manager_employee_id,
    e.start_date,
    o.name,
    o.timezone,
    o.country_code,
    o.currency_code,
    coalesce(
      array_agg(m.role order by m.role)
        filter (where m.role is not null),
      '{}'::public.member_role[]
    )
  from public.employees e
  join public.organisations o
    on o.id=e.organisation_id
  left join public.organisation_memberships m
    on m.organisation_id=e.organisation_id
   and m.user_id=auth.uid()
   and m.is_active
  where e.user_id=auth.uid()
    and e.employment_status='active'
  group by
    e.id,e.organisation_id,e.first_name,e.last_name,e.email,
    e.department_id,e.manager_employee_id,e.start_date,
    o.name,o.timezone,o.country_code,o.currency_code
  limit 1;
$$;

revoke all on function public.get_current_context_v1() from public, anon;
grant execute on function public.get_current_context_v1() to authenticated;
