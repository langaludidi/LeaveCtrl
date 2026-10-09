-- Separate organisation administration from employment without rewriting historical employee records.
-- A NULL start date now means administrator-only. Existing five-argument RPC callers remain compatible.
create or replace function public.bootstrap_organisation(
  p_name text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_start_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_auth_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_org_id uuid;
  v_employee_id uuid;
  v_schedule_id uuid;
  v_business_date date;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_user_id) then
    raise exception 'email_verification_required';
  end if;

  if nullif(btrim(p_name),'') is null
     or nullif(btrim(p_first_name),'') is null
     or nullif(btrim(p_last_name),'') is null
     or nullif(btrim(p_email),'') is null then
    raise exception 'required_fields_missing';
  end if;

  if lower(btrim(p_email))<>v_auth_email then
    raise exception 'registration_email_mismatch';
  end if;

  -- Explicit employment start date opts the founder into employee provisioning.
  -- NULL creates an administrator-only identity without an employee seat.

  -- A public organisation creator may become initial org_admin only when they
  -- do not already hold active LeaveCtrl organisation membership. There is no
  -- caller-supplied role parameter.
  if exists(
    select 1 from public.organisation_memberships m
    where m.user_id=v_user_id and m.is_active
  ) or exists(
    select 1 from public.employees e
    where e.user_id=v_user_id and e.employment_status='active'
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  insert into public.organisations(
    name,onboarding_started_at,onboarding_completed_at
  )
  values(btrim(p_name),now(),null)
  returning id into v_org_id;

  insert into public.organisation_memberships(organisation_id,user_id,role)
  values (v_org_id,v_user_id,'org_admin');

  if p_start_date is not null then
    insert into public.organisation_memberships(organisation_id,user_id,role)
    values (v_org_id,v_user_id,'employee');
  end if;

  if p_start_date is not null then
  insert into public.employees(
    organisation_id,user_id,first_name,last_name,email,start_date,
    welcome_completed_at
  ) values(
    v_org_id,v_user_id,btrim(p_first_name),btrim(p_last_name),
    lower(btrim(p_email)),p_start_date,now()
  )
  returning id into v_employee_id;

  end if;

  insert into public.work_schedules(
    organisation_id,name,
    monday_hours,tuesday_hours,wednesday_hours,thursday_hours,friday_hours,
    saturday_hours,sunday_hours
  ) values(
    v_org_id,'Standard Monday to Friday',8,8,8,8,8,0,0
  )
  returning id into v_schedule_id;

  if p_start_date is not null then
  insert into public.employee_schedule_assignments(
    organisation_id,employee_id,work_schedule_id,effective_from
  ) values(
    v_org_id,v_employee_id,v_schedule_id,p_start_date
  );

  end if;

  perform private.seed_za_public_holidays(v_org_id);
  v_business_date:=private.organisation_business_date(v_org_id);
  perform private.ensure_za_leave_baseline(v_org_id,v_business_date);
  if v_employee_id is not null then
    perform private.provision_employee_entitlements_for_date(
      v_employee_id,v_user_id,v_business_date,'{}'::jsonb
    );
  end if;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'organisation',v_org_id,'organisation.bootstrapped',
    jsonb_build_object(
      'country_code','ZA',
      'timezone','Africa/Johannesburg',
      'public_holidays_seeded',true,
      'statutory_leave_baseline_seeded',true,
      'registration_intent','create_organisation',
      'initial_roles',case when v_employee_id is null
        then jsonb_build_array('org_admin')
        else jsonb_build_array('employee','org_admin') end,
      'employee_opt_in',v_employee_id is not null,
      'role_source','controlled_organisation_creation'
    )
  );

  return v_org_id;
end;
$function$;


-- No change to the function's grant or signature; original migration already governs execution.

-- Allow zero-employee organisations to complete their initial administration setup.
create or replace function public.complete_organisation_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_completed_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_user_id) then
    raise exception 'email_verification_required';
  end if;

  select m.organisation_id
    into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role='org_admin'
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'organisation_admin_required'; end if;

  -- A new administrator-only organisation may complete setup with no employees.
  -- If employees exist, each must have an active schedule assignment.
  if exists(
    select 1 from public.employees e
    where e.organisation_id=v_org_id and e.employment_status='active'
      and not exists(
        select 1 from public.employee_schedule_assignments esa
        where esa.organisation_id=v_org_id and esa.employee_id=e.id
          and esa.effective_to is null
      )
  ) then raise exception 'work_schedule_setup_required'; end if;

  if not exists(
    select 1
    from public.leave_policy_versions p
    join public.leave_types lt on lt.id=p.leave_type_id
    where p.organisation_id=v_org_id
      and lt.organisation_id=v_org_id
      and lt.code='ANNUAL'
  ) then raise exception 'annual_leave_policy_required'; end if;

  if not exists(
    select 1 from public.public_holidays ph
    where ph.organisation_id=v_org_id
  ) then raise exception 'public_holiday_setup_required'; end if;

  update public.organisations o
  set onboarding_completed_at=coalesce(o.onboarding_completed_at,now()),
      updated_at=case
        when o.onboarding_completed_at is null then now()
        else o.updated_at
      end
  where o.id=v_org_id
  returning o.onboarding_completed_at into v_completed_at;

  if not exists(
    select 1 from public.audit_events a
    where a.organisation_id=v_org_id
      and a.event_type='organisation.onboarding.completed'
  ) then
    insert into public.audit_events(
      organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
    ) values(
      v_org_id,v_user_id,'organisation',v_org_id,
      'organisation.onboarding.completed',
      jsonb_build_object(
        'completed_by',v_user_id,
        'core_readiness_verified',true
      )
    );
  end if;

  return v_completed_at;
end;
$function$;

