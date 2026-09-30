-- P0 registration / membership / role-safe onboarding state machine.
-- Authentication establishes identity only. LeaveCtrl application access requires:
-- verified email -> active organisation membership -> employee context -> required onboarding.
--
-- Existing production organisations are backfilled as onboarding-complete so this
-- migration does not unexpectedly lock established tenants. New organisations
-- created after this migration must explicitly complete initial organisation setup.

alter table public.organisations
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

update public.organisations
set onboarding_started_at=coalesce(onboarding_started_at,created_at),
    onboarding_completed_at=coalesce(onboarding_completed_at,now())
where onboarding_completed_at is null;

create or replace function public.get_access_state_v1()
returns table(
  organisation_id uuid,
  organisation_name text,
  roles public.member_role[],
  employee_id uuid,
  employee_welcome_completed_at timestamptz,
  organisation_onboarding_completed_at timestamptz
)
language sql
stable
security invoker
set search_path=''
as $$
  select
    m.organisation_id,
    o.name,
    array_agg(m.role order by m.role),
    e.id,
    e.welcome_completed_at,
    o.onboarding_completed_at
  from public.organisation_memberships m
  join public.organisations o
    on o.id=m.organisation_id
  left join public.employees e
    on e.organisation_id=m.organisation_id
   and e.user_id=auth.uid()
   and e.employment_status='active'
  where m.user_id=auth.uid()
    and m.is_active
    and private.is_verified_email_identity(auth.uid())
  group by
    m.organisation_id,o.name,e.id,e.welcome_completed_at,o.onboarding_completed_at
  order by o.name,m.organisation_id;
$$;

revoke all on function public.get_access_state_v1() from public,anon;
grant execute on function public.get_access_state_v1() to authenticated;

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

  p_start_date:=coalesce(
    p_start_date,
    (now() at time zone 'Africa/Johannesburg')::date
  );

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

  insert into public.organisation_memberships(
    organisation_id,user_id,role
  ) values
    (v_org_id,v_user_id,'org_admin'),
    (v_org_id,v_user_id,'employee');

  insert into public.employees(
    organisation_id,user_id,first_name,last_name,email,start_date,
    welcome_completed_at
  ) values(
    v_org_id,v_user_id,btrim(p_first_name),btrim(p_last_name),
    lower(btrim(p_email)),p_start_date,now()
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
  v_business_date:=private.organisation_business_date(v_org_id);
  perform private.ensure_za_leave_baseline(v_org_id,v_business_date);
  perform private.provision_employee_entitlements_for_date(
    v_employee_id,v_user_id,v_business_date,'{}'::jsonb
  );

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
      'initial_roles',jsonb_build_array('employee','org_admin'),
      'role_source','controlled_organisation_creation'
    )
  );

  return v_org_id;
end;
$function$;

revoke all on function public.bootstrap_organisation(text,text,text,text,date)
from public,anon;
grant execute on function public.bootstrap_organisation(text,text,text,text,date)
to authenticated;

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

  if not exists(
    select 1 from public.employees e
    where e.organisation_id=v_org_id
      and e.employment_status='active'
  ) then raise exception 'employee_setup_required'; end if;

  if not exists(
    select 1
    from public.employee_schedule_assignments esa
    join public.employees e on e.id=esa.employee_id
    where esa.organisation_id=v_org_id
      and e.organisation_id=v_org_id
      and e.employment_status='active'
      and esa.effective_to is null
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

revoke all on function public.complete_organisation_onboarding()
from public,anon;
grant execute on function public.complete_organisation_onboarding()
to authenticated;

create or replace function public.complete_employee_welcome()
returns timestamptz
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_profile_count integer;
  v_completed_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_user_id) then
    raise exception 'email_verification_required';
  end if;

  select count(*)
    into v_profile_count
  from public.employees e
  join public.organisation_memberships m
    on m.organisation_id=e.organisation_id
   and m.user_id=v_user_id
   and m.is_active
  where e.user_id=v_user_id
    and e.employment_status='active';

  if v_profile_count=0 then raise exception 'employee_profile_required'; end if;
  if v_profile_count>1 then raise exception 'organisation_context_required'; end if;

  update public.employees e
  set welcome_completed_at=coalesce(e.welcome_completed_at,now()),
      updated_at=case
        when e.welcome_completed_at is null then now()
        else e.updated_at
      end
  where e.user_id=v_user_id
    and e.employment_status='active'
  returning e.welcome_completed_at into v_completed_at;

  return v_completed_at;
end;
$function$;

revoke all on function public.complete_employee_welcome() from public,anon;
grant execute on function public.complete_employee_welcome() to authenticated;

create or replace function public.claim_employee_invitation(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions,private
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_invitation public.employee_invitations%rowtype;
  v_employee_id uuid;
  v_existing_user_id uuid;
  v_invalidated_count integer:=0;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_user_id) then
    raise exception 'email_verification_required';
  end if;

  select *
    into v_invitation
  from public.employee_invitations i
  where i.token_hash=digest(p_token,'sha256')
    and i.accepted_at is null
    and i.expires_at>now()
  for update;

  if v_invitation.id is null then raise exception 'invitation_invalid_or_expired'; end if;
  if lower(v_invitation.email)<>v_email then raise exception 'invitation_email_mismatch'; end if;

  if exists(
    select 1 from public.organisation_memberships m
    where m.user_id=v_user_id
      and m.is_active
      and m.organisation_id<>v_invitation.organisation_id
  ) or exists(
    select 1 from public.employees e
    where e.user_id=v_user_id
      and e.employment_status='active'
      and e.organisation_id<>v_invitation.organisation_id
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  -- Role assignment comes exclusively from the trusted invitation record.
  -- The claimant cannot supply a role, organisation id or manager flag.
  insert into public.organisation_memberships(
    organisation_id,user_id,role,is_active
  ) values(v_invitation.organisation_id,v_user_id,'employee',true)
  on conflict(organisation_id,user_id,role)
  do update set is_active=true;

  if v_invitation.grant_manager_role then
    insert into public.organisation_memberships(
      organisation_id,user_id,role,is_active
    ) values(v_invitation.organisation_id,v_user_id,'manager',true)
    on conflict(organisation_id,user_id,role)
    do update set is_active=true;
  end if;

  if v_invitation.employee_id is not null then
    select user_id
      into v_existing_user_id
    from public.employees
    where id=v_invitation.employee_id
      and organisation_id=v_invitation.organisation_id
    for update;

    if v_existing_user_id is not null and v_existing_user_id<>v_user_id then
      raise exception 'employee_access_already_claimed';
    end if;

    if exists(
      select 1 from public.employees e
      where e.user_id=v_user_id
        and e.employment_status='active'
        and e.id<>v_invitation.employee_id
    ) then
      raise exception 'account_already_linked_to_organisation';
    end if;

    update public.employees
    set user_id=v_user_id,
        updated_at=now()
    where id=v_invitation.employee_id
      and organisation_id=v_invitation.organisation_id
    returning id into v_employee_id;
  else
    if exists(
      select 1 from public.employees e
      where e.user_id=v_user_id
        and e.employment_status='active'
    ) then
      raise exception 'account_already_linked_to_organisation';
    end if;

    insert into public.employees(
      organisation_id,user_id,employee_number,first_name,last_name,email,
      start_date,department_id,manager_employee_id
    ) values(
      v_invitation.organisation_id,v_user_id,v_invitation.employee_number,
      v_invitation.first_name,v_invitation.last_name,v_invitation.email,
      v_invitation.start_date,v_invitation.department_id,
      v_invitation.manager_employee_id
    )
    returning id into v_employee_id;

    if v_invitation.work_schedule_id is not null then
      insert into public.employee_schedule_assignments(
        organisation_id,employee_id,work_schedule_id,effective_from
      ) values(
        v_invitation.organisation_id,v_employee_id,
        v_invitation.work_schedule_id,v_invitation.start_date
      );
    end if;
  end if;

  update public.employee_invitations
  set accepted_at=now()
  where id=v_invitation.id;

  update public.employee_invitations
  set expires_at=least(expires_at,now())
  where id<>v_invitation.id
    and organisation_id=v_invitation.organisation_id
    and accepted_at is null
    and expires_at>now()
    and (
      employee_id=v_employee_id
      or (
        employee_id is null
        and lower(email)=v_email
      )
    );

  get diagnostics v_invalidated_count=row_count;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_invitation.organisation_id,v_user_id,'employee',v_employee_id,
    'employee.access_claimed',
    jsonb_build_object(
      'invitation_id',v_invitation.id,
      'roles',case
        when v_invitation.grant_manager_role
          then jsonb_build_array('employee','manager')
        else jsonb_build_array('employee')
      end,
      'role_source','trusted_invitation',
      'sibling_invitations_invalidated',v_invalidated_count
    )
  );

  return v_employee_id;
end;
$function$;

revoke all on function public.claim_employee_invitation(text) from public,anon;
grant execute on function public.claim_employee_invitation(text) to authenticated;
