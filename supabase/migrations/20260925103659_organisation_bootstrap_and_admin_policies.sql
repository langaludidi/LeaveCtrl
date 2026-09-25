create or replace function public.bootstrap_organisation(
  p_name text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_start_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_employee_id uuid;
  v_schedule_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if nullif(btrim(p_name), '') is null
     or nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null
     or nullif(btrim(p_email), '') is null then
    raise exception 'required_fields_missing';
  end if;

  insert into public.organisations(name)
  values (btrim(p_name))
  returning id into v_org_id;

  insert into public.organisation_memberships(organisation_id, user_id, role)
  values
    (v_org_id, v_user_id, 'org_admin'),
    (v_org_id, v_user_id, 'employee');

  insert into public.employees(
    organisation_id, user_id, first_name, last_name, email, start_date
  )
  values (
    v_org_id, v_user_id, btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)), p_start_date
  )
  returning id into v_employee_id;

  insert into public.work_schedules(
    organisation_id, name,
    monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
    saturday_hours, sunday_hours
  )
  values (v_org_id, 'Standard Monday to Friday', 8, 8, 8, 8, 8, 0, 0)
  returning id into v_schedule_id;

  insert into public.employee_schedule_assignments(
    organisation_id, employee_id, work_schedule_id, effective_from
  )
  values (v_org_id, v_employee_id, v_schedule_id, p_start_date);

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'organisation', v_org_id, 'organisation.bootstrapped',
    jsonb_build_object('country_code','ZA','timezone','Africa/Johannesburg')
  );

  return v_org_id;
end;
$$;

revoke all on function public.bootstrap_organisation(text,text,text,text,date) from public;
grant execute on function public.bootstrap_organisation(text,text,text,text,date) to authenticated;

create policy departments_admin_insert on public.departments
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);
create policy departments_admin_update on public.departments
for update using (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
) with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create policy employees_admin_insert on public.employees
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);
create policy employees_admin_update on public.employees
for update using (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
) with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create policy schedules_admin_insert on public.work_schedules
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);
create policy schedules_admin_update on public.work_schedules
for update using (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
) with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create policy schedule_assignments_admin_insert on public.employee_schedule_assignments
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);
create policy schedule_assignments_admin_update on public.employee_schedule_assignments
for update using (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
) with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create policy leave_types_admin_insert on public.leave_types
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);
create policy leave_types_admin_update on public.leave_types
for update using (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
) with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create policy policy_versions_admin_insert on public.leave_policy_versions
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);
