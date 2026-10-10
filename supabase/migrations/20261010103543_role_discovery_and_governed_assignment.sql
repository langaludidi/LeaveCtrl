-- Additive access is governed by organisation administrators, never signup claims.
alter table public.employee_invitations
  add column assigned_roles public.member_role[] not null default array['employee']::public.member_role[];
update public.employee_invitations set assigned_roles=array['employee','manager']::public.member_role[]
where grant_manager_role;
alter table public.employee_invitations add constraint invitation_roles_include_employee
  check (cardinality(assigned_roles)>0 and 'employee'=any(assigned_roles) and array_position(assigned_roles,null) is null);

create or replace function public.set_employee_access_roles(
  p_employee_id uuid, p_roles public.member_role[], p_expected_roles public.member_role[], p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_org uuid;
  v_employee public.employees%rowtype;
  v_before public.member_role[];
  v_roles public.member_role[];
  v_pending boolean;
begin
  if v_actor is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_actor) then raise exception 'email_verification_required'; end if;
  select e.organisation_id into v_org from public.employees e where e.id=p_employee_id;
  if v_org is null or not private.has_org_role(v_org,array['org_admin']::public.member_role[]) then
    raise exception 'not_authorised';
  end if;
  -- Serialise administrator edits and re-check authority after acquiring the lock.
  perform 1 from public.organisations where id=v_org for update;
  if not private.has_org_role(v_org,array['org_admin']::public.member_role[]) then raise exception 'not_authorised'; end if;
  select * into v_employee from public.employees where id=p_employee_id and organisation_id=v_org for update;
  if v_employee.employment_status<>'active' then raise exception 'employee_not_active'; end if;
  if v_employee.user_id=v_actor then raise exception 'self_role_change_not_allowed'; end if;
  if p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null
    or not ('employee'=any(p_roles)) or nullif(btrim(p_reason),'') is null then
    raise exception 'invalid_role_assignment';
  end if;
  select array_agg(distinct r order by r) into v_roles from unnest(p_roles) r;
  v_pending:=v_employee.user_id is null;
  if v_pending then
    perform 1 from public.employee_invitations where employee_id=p_employee_id
      and organisation_id=v_org and accepted_at is null and expires_at>now() for update;
    if not found then raise exception 'active_invitation_required'; end if;
    select array_agg(distinct r order by r) into v_before
    from public.employee_invitations i cross join lateral unnest(
      i.assigned_roles || case when i.grant_manager_role then array['manager']::public.member_role[] else '{}'::public.member_role[] end
    ) r where i.employee_id=p_employee_id and i.organisation_id=v_org and i.accepted_at is null and i.expires_at>now();
  else
    select array_agg(m.role order by m.role) into v_before from public.organisation_memberships m
      where m.organisation_id=v_org and m.user_id=v_employee.user_id and m.is_active;
    if v_before is null then raise exception 'active_membership_required'; end if;
  end if;
  if p_expected_roles is null or array_position(p_expected_roles,null) is not null
    or not (v_before @> p_expected_roles and v_before <@ p_expected_roles) then
    raise exception 'roles_changed_refresh_required';
  end if;
  if 'manager'=any(v_before) and not ('manager'=any(v_roles)) and exists(
    select 1 from public.employees e left join public.employee_current_conditions c on c.employee_id=e.id
    where e.organisation_id=v_org and coalesce(c.manager_employee_id,e.manager_employee_id)=p_employee_id and e.employment_status='active'
  ) then raise exception 'reassign_direct_reports_before_removing_manager'; end if;
  if not v_pending and 'org_admin'=any(v_before) and not ('org_admin'=any(v_roles)) and (
    select count(*) from public.organisation_memberships m where m.organisation_id=v_org and m.role='org_admin' and m.is_active
  )<=1 then raise exception 'last_organisation_admin_required'; end if;
  if v_pending then
    update public.employee_invitations set assigned_roles=v_roles, grant_manager_role=('manager'=any(v_roles))
      where employee_id=p_employee_id and organisation_id=v_org and accepted_at is null and expires_at>now();
  else
    update public.organisation_memberships set is_active=false where organisation_id=v_org
      and user_id=v_employee.user_id and is_active and not (role=any(v_roles));
    insert into public.organisation_memberships(organisation_id,user_id,role,is_active)
      select v_org,v_employee.user_id,r,true from unnest(v_roles) r
      on conflict(organisation_id,user_id,role) do update set is_active=true;
  end if;
  insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload)
    values(v_org,v_actor,'employee',p_employee_id,'employee.access_roles.changed',
      jsonb_build_object('before',v_before,'after',v_roles,'pending_invitation',v_pending,'reason',btrim(p_reason)));
  return jsonb_build_object('roles',v_roles,'pending_invitation',v_pending);
end;
$$;
revoke all on function public.set_employee_access_roles(uuid,public.member_role[],public.member_role[],text) from public,anon;
grant execute on function public.set_employee_access_roles(uuid,public.member_role[],public.member_role[],text) to authenticated;

create or replace function public.prepare_employee_access_invitation(
  p_employee_id uuid,
  p_grant_manager_role boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_schedule_id uuid;
  v_token text;
  v_roles public.member_role[];
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_user_id) then raise exception 'email_verification_required'; end if;

  select *
    into v_employee
  from public.employees
  where id = p_employee_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_employee.organisation_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  perform 1 from public.organisations where id=v_employee.organisation_id for update;
  select * into v_employee from public.employees where id=p_employee_id for update;
  if not private.has_org_role(v_employee.organisation_id,array['org_admin','hr_admin']::public.member_role[]) then raise exception 'not_authorised'; end if;
  if v_employee.employment_status<>'active' then raise exception 'employee_not_active'; end if;

  -- Reissuing through the legacy CSV/recovery path preserves the reviewed pending roles.
  select array_agg(distinct r order by r) into v_roles from public.employee_invitations i
    cross join lateral unnest(i.assigned_roles || case when i.grant_manager_role then array['manager']::public.member_role[] else '{}'::public.member_role[] end) r
    where i.employee_id=v_employee.id and i.organisation_id=v_employee.organisation_id and i.accepted_at is null and i.expires_at>now();
  v_roles:=coalesce(v_roles,array['employee']::public.member_role[]);
  if p_grant_manager_role and not ('manager'=any(v_roles)) then v_roles:=v_roles||array['manager']::public.member_role[]; end if;

  if v_employee.user_id is not null then
    raise exception 'employee_already_has_access';
  end if;

  select esa.work_schedule_id
    into v_schedule_id
  from public.employee_schedule_assignments esa
  where esa.employee_id = v_employee.id
    and esa.effective_from <= current_date
    and (esa.effective_to is null or esa.effective_to >= current_date)
  order by esa.effective_from desc
  limit 1;

  update public.employee_invitations
  set expires_at = now()
  where employee_id = v_employee.id
    and accepted_at is null
    and expires_at > now();

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.employee_invitations(
    organisation_id, employee_id, email, first_name, last_name,
    employee_number, department_id, manager_employee_id, work_schedule_id,
    start_date, grant_manager_role, token_hash, created_by, assigned_roles
  )
  values (
    v_employee.organisation_id, v_employee.id, v_employee.email,
    v_employee.first_name, v_employee.last_name, v_employee.employee_number,
    v_employee.department_id, v_employee.manager_employee_id, v_schedule_id,
    v_employee.start_date, 'manager'=any(v_roles),
    extensions.digest(v_token, 'sha256'), v_user_id, v_roles
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_employee.organisation_id, v_user_id, 'employee', v_employee.id,
    'employee.access_invitation.prepared',
    jsonb_build_object('manager_role_requested', p_grant_manager_role)
  );

  return v_token;
end;
$$;

revoke execute on function public.prepare_employee_access_invitation(uuid,boolean) from anon;
revoke execute on function public.prepare_employee_access_invitation(uuid,boolean) from public;
grant execute on function public.prepare_employee_access_invitation(uuid,boolean) to authenticated;


create or replace function public.add_employee_with_access_roles(
  p_email text,p_first_name text,p_last_name text,p_start_date date,
  p_roles public.member_role[] default array['employee']::public.member_role[],
  p_employee_number text default null,p_department_id uuid default null,
  p_manager_employee_id uuid default null,p_work_schedule_id uuid default null,
  p_prepare_invitation boolean default true,p_existing_employee_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_org uuid; v_result jsonb; v_roles public.member_role[]; v_existing public.employees%rowtype;
begin
  if v_actor is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_actor) then raise exception 'email_verification_required'; end if;
  select m.organisation_id into v_org from public.organisation_memberships m where m.user_id=v_actor
    and m.is_active and m.role in ('org_admin','hr_admin') order by m.created_at limit 1;
  if v_org is null then raise exception 'not_authorised'; end if;
  if (select count(distinct organisation_id) from public.organisation_memberships where user_id=v_actor and is_active)<>1 then raise exception 'organisation_context_required'; end if;
  perform 1 from public.organisations where id=v_org for update;
  if not private.has_org_role(v_org,array['org_admin','hr_admin']::public.member_role[]) then raise exception 'not_authorised'; end if;
  if p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null or not ('employee'=any(p_roles)) then
    raise exception 'invalid_role_assignment';
  end if;
  select array_agg(distinct r order by r) into v_roles from unnest(p_roles) r;
  if not private.has_org_role(v_org,array['org_admin']::public.member_role[]) and
    not (v_roles <@ array['employee','manager']::public.member_role[]) then raise exception 'organisation_admin_required'; end if;
  if not p_prepare_invitation and v_roles<>array['employee']::public.member_role[] then raise exception 'invitation_required_for_roles'; end if;
  if p_existing_employee_id is not null then
    if not p_prepare_invitation then raise exception 'invitation_required_for_roles'; end if;
    select * into v_existing from public.employees where id=p_existing_employee_id and organisation_id=v_org for update;
    if not found or v_existing.employment_status<>'active' then raise exception 'not_authorised'; end if;
    if v_existing.user_id is not null then raise exception 'employee_already_has_access'; end if;
    -- Do not overwrite a pending role decision through the invitation recovery path.
    if exists(select 1 from public.employee_invitations where employee_id=p_existing_employee_id and accepted_at is null and expires_at>now()) then
      raise exception 'invitation_already_pending';
    end if;
    v_result:=jsonb_build_object('employee_id',p_existing_employee_id,'invitation_token',
      public.prepare_employee_access_invitation(p_existing_employee_id,'manager'=any(v_roles)));
  else
    v_result:=public.add_employee_record(p_email,p_first_name,p_last_name,p_start_date,p_employee_number,
      p_department_id,p_manager_employee_id,p_work_schedule_id,'manager'=any(v_roles),p_prepare_invitation);
  end if;
  -- Creation and trusted invitation roles commit together, before any email is sent.
  update public.employee_invitations set assigned_roles=v_roles where employee_id=(v_result->>'employee_id')::uuid
    and organisation_id=v_org and accepted_at is null and expires_at>now();
  insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload)
    values(v_org,v_actor,'employee',(v_result->>'employee_id')::uuid,'employee.access_roles.prepared',
      jsonb_build_object('roles',v_roles,'invitation_prepared',p_prepare_invitation));
  return v_result;
end;
$$;
revoke all on function public.add_employee_with_access_roles(text,text,text,date,public.member_role[],text,uuid,uuid,uuid,boolean,uuid) from public,anon;
grant execute on function public.add_employee_with_access_roles(text,text,text,date,public.member_role[],text,uuid,uuid,uuid,boolean,uuid) to authenticated;

create or replace function public.get_my_invitation_context(p_token text)
returns table(organisation_name text,assigned_roles public.member_role[])
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_email text;
begin
  if v_actor is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_actor) then raise exception 'email_verification_required'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=v_actor;
  return query select o.name,
    (select array_agg(distinct r order by r) from unnest(i.assigned_roles ||
      case when i.grant_manager_role then array['manager']::public.member_role[] else '{}'::public.member_role[] end) r)
    from public.employee_invitations i join public.organisations o on o.id=i.organisation_id
    where i.token_hash=extensions.digest(p_token,'sha256') and lower(i.email)=v_email
      and i.accepted_at is null and i.expires_at>now();
end;
$$;
revoke all on function public.get_my_invitation_context(text) from public,anon;
grant execute on function public.get_my_invitation_context(text) to authenticated;

create or replace function public.claim_employee_invitation(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_email text;
  v_invitation public.employee_invitations%rowtype;
  v_employee_id uuid;
  v_existing_user_id uuid;
  v_invalidated_count integer:=0;
  v_org uuid;
  v_roles public.member_role[];
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(v_user_id) then
    raise exception 'email_verification_required';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id=v_user_id;
  select i.organisation_id into v_org from public.employee_invitations i
    where i.token_hash=extensions.digest(p_token,'sha256') and lower(i.email)=v_email
      and i.accepted_at is null and i.expires_at>now();
  if v_org is null then raise exception 'invitation_invalid_or_expired'; end if;
  -- Lock order matches administrator role edits: organisation, employee, invitation.
  perform 1 from public.organisations where id=v_org for update;
  perform 1 from public.employees e where e.organisation_id=v_org and e.id=(
    select i.employee_id from public.employee_invitations i where i.token_hash=extensions.digest(p_token,'sha256')
  ) for update;

  select *
    into v_invitation
  from public.employee_invitations i
  where i.token_hash=extensions.digest(p_token,'sha256')
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

  -- Roles come only from the trusted invitation, never from claimant metadata.
  select array_agg(distinct r order by r) into v_roles from unnest(v_invitation.assigned_roles ||
    case when v_invitation.grant_manager_role then array['manager']::public.member_role[] else '{}'::public.member_role[] end) r;
  insert into public.organisation_memberships(organisation_id,user_id,role,is_active)
    select v_invitation.organisation_id,v_user_id,r,true from unnest(v_roles) r
    on conflict(organisation_id,user_id,role) do update set is_active=true;

  if v_invitation.employee_id is not null then
    select user_id
      into v_existing_user_id
    from public.employees
    where id=v_invitation.employee_id
      and organisation_id=v_invitation.organisation_id
    for update;

    if not found then raise exception 'invitation_employee_invalid'; end if;
    if exists(select 1 from public.employees where id=v_invitation.employee_id and employment_status<>'active') then raise exception 'employee_not_active'; end if;

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
      'roles',to_jsonb(v_roles),
      'role_source','trusted_invitation',
      'sibling_invitations_invalidated',v_invalidated_count
    )
  );

  return v_employee_id;
end;
$function$;

revoke all on function public.claim_employee_invitation(text) from public,anon;
grant execute on function public.claim_employee_invitation(text) to authenticated;
