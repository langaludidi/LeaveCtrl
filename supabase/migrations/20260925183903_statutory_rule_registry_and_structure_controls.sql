
create table if not exists public.statutory_leave_rules (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_code text not null,
  rule_code text not null,
  name text not null,
  effective_from date not null,
  effective_to date,
  calculation_method text not null,
  parameters jsonb not null default '{}'::jsonb,
  legal_reference text not null,
  source_reference text not null,
  verified_at timestamptz not null default now(),
  unique (jurisdiction_code, rule_code, effective_from)
);

alter table public.statutory_leave_rules enable row level security;

drop policy if exists "authenticated users can read statutory leave rules"
  on public.statutory_leave_rules;

create policy "authenticated users can read statutory leave rules"
  on public.statutory_leave_rules
  for select
  to authenticated
  using (true);

revoke all on public.statutory_leave_rules from anon;
grant select on public.statutory_leave_rules to authenticated;

insert into public.statutory_leave_rules(
  jurisdiction_code, rule_code, name, effective_from, calculation_method,
  parameters, legal_reference, source_reference, verified_at
)
values
(
  'ZA','ANNUAL','Annual leave','1998-12-01','annual_leave_floor',
  jsonb_build_object(
    'minimum_consecutive_days',21,
    'alternative_days_worked_ratio',17,
    'alternative_hours_worked_ratio',17,
    'public_holiday_cannot_count_as_annual_leave',true,
    'grant_deadline_months_after_cycle',6
  ),
  'Basic Conditions of Employment Act 75 of 1997, section 20',
  'https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Annual-Leave.aspx',
  now()
),
(
  'ZA','SICK','Sick leave','1998-12-01','six_weeks_per_36_month_cycle',
  jsonb_build_object(
    'cycle_months',36,
    'full_cycle_weeks',6,
    'first_six_months_days_worked_ratio',26,
    'certificate_more_than_consecutive_days',2,
    'certificate_more_than_absences_in_eight_weeks',2
  ),
  'Basic Conditions of Employment Act 75 of 1997, section 22 and section 23',
  'https://www.labour.gov.za/DocumentCenter/Acts/Basic%20Conditions%20of%20Employment/Act%20-%20Basic%20Conditions%20of%20Employment.pdf',
  now()
),
(
  'ZA','FAMILY_RESPONSIBILITY','Family responsibility leave','1998-12-01','fixed_days_with_eligibility',
  jsonb_build_object(
    'days_per_annual_cycle',3,
    'minimum_service_months',4,
    'minimum_days_worked_per_week',4,
    'reasonable_proof_may_be_required',true
  ),
  'Basic Conditions of Employment Act 75 of 1997, section 27',
  'https://www.labour.gov.za/documentcenter/pages/basic-guide-to-family-responsibility-leave.aspx',
  now()
),
(
  'ZA','PARENTAL_INTERIM','Parental leave — interim constitutional regime','2025-10-03','shared_parental_pool_manual_allocation',
  jsonb_build_object(
    'shared_pool','four_months_plus_10_days',
    'single_employed_parent_full_pool',true,
    'shared_by_agreement',true,
    'manual_allocation_required',true,
    'uif_benefit_not_equated_to_leave_entitlement',true
  ),
  'Van Wyk and Others v Minister of Employment and Labour; Commission for Gender Equality and Another v Minister of Employment and Labour and Others, CCT 308/23 and CCT 309/23',
  'https://www.concourt.org.za/index.php/judgement/617-a-werner-van-wyk-and-others-v-minister-of-employment-and-labour-b-commission-for-gender-equality-and-another-v-minister-of-employment-and-labour-and-others',
  now()
)
on conflict (jurisdiction_code, rule_code, effective_from)
do update set
  name=excluded.name,
  calculation_method=excluded.calculation_method,
  parameters=excluded.parameters,
  legal_reference=excluded.legal_reference,
  source_reference=excluded.source_reference,
  verified_at=excluded.verified_at;

update public.leave_types
set is_statutory=true
where code='ANNUAL'
  and organisation_id in (
    select id from public.organisations where country_code='ZA'
  );

create or replace function public.create_department(
  p_name text,
  p_code text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'department_name_required'; end if;

  insert into public.departments(organisation_id,name,code)
  values(v_org_id,btrim(p_name),nullif(upper(btrim(p_code)),''))
  returning id into v_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'department',v_id,'department.created',
    jsonb_build_object('name',btrim(p_name),'code',nullif(upper(btrim(p_code)),''))
  );

  return v_id;
end;
$$;

revoke execute on function public.create_department(text,text) from public,anon;
grant execute on function public.create_department(text,text) to authenticated;

create or replace function public.assign_employee_department(
  p_employee_id uuid,
  p_department_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select e.organisation_id into v_org_id
  from public.employees e
  where e.id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  if p_department_id is not null and not exists(
    select 1 from public.departments d
    where d.id=p_department_id and d.organisation_id=v_org_id and d.active
  ) then
    raise exception 'invalid_department';
  end if;

  update public.employees
  set department_id=p_department_id,updated_at=now()
  where id=p_employee_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'employee',p_employee_id,'employee.department.changed',
    jsonb_build_object('department_id',p_department_id)
  );
end;
$$;

revoke execute on function public.assign_employee_department(uuid,uuid) from public,anon;
grant execute on function public.assign_employee_department(uuid,uuid) to authenticated;

create or replace function public.create_work_schedule(
  p_name text,
  p_monday_hours numeric default 8,
  p_tuesday_hours numeric default 8,
  p_wednesday_hours numeric default 8,
  p_thursday_hours numeric default 8,
  p_friday_hours numeric default 8,
  p_saturday_hours numeric default 0,
  p_sunday_hours numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'schedule_name_required'; end if;

  if least(
    p_monday_hours,p_tuesday_hours,p_wednesday_hours,p_thursday_hours,
    p_friday_hours,p_saturday_hours,p_sunday_hours
  ) < 0 or greatest(
    p_monday_hours,p_tuesday_hours,p_wednesday_hours,p_thursday_hours,
    p_friday_hours,p_saturday_hours,p_sunday_hours
  ) > 24 then
    raise exception 'invalid_schedule_hours';
  end if;

  insert into public.work_schedules(
    organisation_id,name,
    monday_hours,tuesday_hours,wednesday_hours,thursday_hours,friday_hours,
    saturday_hours,sunday_hours
  ) values(
    v_org_id,btrim(p_name),
    p_monday_hours,p_tuesday_hours,p_wednesday_hours,p_thursday_hours,p_friday_hours,
    p_saturday_hours,p_sunday_hours
  )
  returning id into v_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'work_schedule',v_id,'work_schedule.created',
    jsonb_build_object('name',btrim(p_name))
  );

  return v_id;
end;
$$;

revoke execute on function public.create_work_schedule(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.create_work_schedule(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.assign_employee_schedule(
  p_employee_id uuid,
  p_work_schedule_id uuid,
  p_effective_from date default current_date
)
returns void
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select e.organisation_id into v_org_id
  from public.employees e
  where e.id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  if not exists(
    select 1 from public.work_schedules ws
    where ws.id=p_work_schedule_id and ws.organisation_id=v_org_id
  ) then
    raise exception 'invalid_work_schedule';
  end if;

  update public.employee_schedule_assignments
  set effective_to=p_effective_from - 1
  where employee_id=p_employee_id
    and effective_to is null
    and effective_from < p_effective_from;

  if exists(
    select 1 from public.employee_schedule_assignments
    where employee_id=p_employee_id
      and effective_from=p_effective_from
  ) then
    update public.employee_schedule_assignments
    set work_schedule_id=p_work_schedule_id,effective_to=null
    where employee_id=p_employee_id
      and effective_from=p_effective_from;
  else
    insert into public.employee_schedule_assignments(
      organisation_id,employee_id,work_schedule_id,effective_from
    ) values(
      v_org_id,p_employee_id,p_work_schedule_id,p_effective_from
    );
  end if;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'employee',p_employee_id,'employee.schedule.changed',
    jsonb_build_object('work_schedule_id',p_work_schedule_id,'effective_from',p_effective_from)
  );
end;
$$;

revoke execute on function public.assign_employee_schedule(uuid,uuid,date) from public,anon;
grant execute on function public.assign_employee_schedule(uuid,uuid,date) to authenticated;
