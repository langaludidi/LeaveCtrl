
create unique index if not exists employees_one_active_profile_per_user_idx
on public.employees(user_id)
where user_id is not null and employment_status='active';

create or replace function private.enforce_single_active_organisation_membership()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.is_active and exists(
    select 1
    from public.organisation_memberships m
    where m.user_id=new.user_id
      and m.is_active
      and m.organisation_id<>new.organisation_id
      and m.id<>new.id
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_single_active_organisation_membership()
from public,anon,authenticated;

drop trigger if exists enforce_single_active_organisation_membership
on public.organisation_memberships;

create trigger enforce_single_active_organisation_membership
before insert or update of organisation_id,user_id,is_active
on public.organisation_memberships
for each row
execute function private.enforce_single_active_organisation_membership();

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
set search_path=public,private
as $$
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
$$;

create or replace function public.claim_employee_invitation(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_invitation public.employee_invitations%rowtype;
  v_employee_id uuid;
  v_existing_user_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select *
    into v_invitation
  from public.employee_invitations i
  where i.token_hash=digest(p_token,'sha256')
    and i.accepted_at is null
    and i.expires_at>now()
  for update;

  if v_invitation.id is null then
    raise exception 'invitation_invalid_or_expired';
  end if;

  if lower(v_invitation.email)<>v_email then
    raise exception 'invitation_email_mismatch';
  end if;

  if exists(
    select 1
    from public.organisation_memberships m
    where m.user_id=v_user_id
      and m.is_active
      and m.organisation_id<>v_invitation.organisation_id
  ) or exists(
    select 1
    from public.employees e
    where e.user_id=v_user_id
      and e.employment_status='active'
      and e.organisation_id<>v_invitation.organisation_id
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  insert into public.organisation_memberships(
    organisation_id,user_id,role,is_active
  ) values(
    v_invitation.organisation_id,v_user_id,'employee',true
  )
  on conflict(organisation_id,user_id,role)
  do update set is_active=true;

  if v_invitation.grant_manager_role then
    insert into public.organisation_memberships(
      organisation_id,user_id,role,is_active
    ) values(
      v_invitation.organisation_id,v_user_id,'manager',true
    )
    on conflict(organisation_id,user_id,role)
    do update set is_active=true;
  end if;

  if v_invitation.employee_id is not null then
    select user_id
      into v_existing_user_id
    from public.employees
    where id=v_invitation.employee_id
    for update;

    if v_existing_user_id is not null
       and v_existing_user_id<>v_user_id then
      raise exception 'employee_access_already_claimed';
    end if;

    if exists(
      select 1
      from public.employees e
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
    returning id into v_employee_id;
  else
    if exists(
      select 1
      from public.employees e
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

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_invitation.organisation_id,v_user_id,'employee',v_employee_id,
    'employee.access_claimed',
    jsonb_build_object(
      'invitation_id',v_invitation.id,
      'single_active_organisation_identity',true
    )
  );

  return v_employee_id;
end;
$$;
