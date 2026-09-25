CREATE OR REPLACE FUNCTION public.assign_employee_schedule(p_employee_id uuid, p_work_schedule_id uuid, p_effective_from date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select e.organisation_id into v_org_id
  from public.employees e
  where e.id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  p_effective_from:=coalesce(
    p_effective_from,
    private.organisation_business_date(v_org_id)
  );

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
$function$;

CREATE OR REPLACE FUNCTION public.bootstrap_organisation(p_name text, p_first_name text, p_last_name text, p_email text, p_start_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_employee_id uuid;
  v_schedule_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if nullif(btrim(p_name),'') is null
     or nullif(btrim(p_first_name),'') is null
     or nullif(btrim(p_last_name),'') is null
     or nullif(btrim(p_email),'') is null then
    raise exception 'required_fields_missing';
  end if;

  p_start_date:=coalesce(
    p_start_date,
    (now() at time zone 'Africa/Johannesburg')::date
  );

  if exists(
    select 1
    from public.organisation_memberships m
    where m.user_id=v_user_id and m.is_active
  ) or exists(
    select 1
    from public.employees e
    where e.user_id=v_user_id and e.employment_status='active'
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  insert into public.organisations(name)
  values(btrim(p_name))
  returning id into v_org_id;

  insert into public.organisation_memberships(
    organisation_id,user_id,role
  ) values
    (v_org_id,v_user_id,'org_admin'),
    (v_org_id,v_user_id,'employee');

  insert into public.employees(
    organisation_id,user_id,first_name,last_name,email,start_date
  ) values(
    v_org_id,v_user_id,btrim(p_first_name),btrim(p_last_name),
    lower(btrim(p_email)),p_start_date
  )
  returning id into v_employee_id;

  insert into public.work_schedules(
    organisation_id,name,
    monday_hours,tuesday_hours,wednesday_hours,thursday_hours,friday_hours,
    saturday_hours,sunday_hours
  ) values(
    v_org_id,'Standard Monday to Friday',8,8,8,8,8,0,0
  )
  returning id into v_schedule_id;

  insert into public.employee_schedule_assignments(
    organisation_id,employee_id,work_schedule_id,effective_from
  ) values(
    v_org_id,v_employee_id,v_schedule_id,p_start_date
  );

  perform private.seed_za_public_holidays(v_org_id);

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'organisation',v_org_id,'organisation.bootstrapped',
    jsonb_build_object(
      'country_code','ZA',
      'timezone','Africa/Johannesburg',
      'public_holidays_seeded',true,
      'single_active_organisation_identity',true
    )
  );

  return v_org_id;
end;
$function$;