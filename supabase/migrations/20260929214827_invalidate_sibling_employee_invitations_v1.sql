-- LeaveCtrl V1: invalidate every sibling retry token when employee access is claimed.

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

  insert into public.organisation_memberships(organisation_id,user_id,role,is_active)
  values(v_invitation.organisation_id,v_user_id,'employee',true)
  on conflict(organisation_id,user_id,role)
  do update set is_active=true;

  if v_invitation.grant_manager_role then
    insert into public.organisation_memberships(organisation_id,user_id,role,is_active)
    values(v_invitation.organisation_id,v_user_id,'manager',true)
    on conflict(organisation_id,user_id,role)
    do update set is_active=true;
  end if;

  if v_invitation.employee_id is not null then
    select user_id
      into v_existing_user_id
    from public.employees
    where id=v_invitation.employee_id
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
      or (employee_id is null and lower(email)=v_email)
    );

  get diagnostics v_invalidated_count = row_count;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_invitation.organisation_id,v_user_id,'employee',v_employee_id,
    'employee.access_claimed',
    jsonb_build_object(
      'invitation_id',v_invitation.id,
      'single_active_organisation_identity',true,
      'sibling_invitations_invalidated',v_invalidated_count
    )
  );

  return v_employee_id;
end;
$function$;

revoke execute on function public.claim_employee_invitation(text) from public,anon;
grant execute on function public.claim_employee_invitation(text) to authenticated;

-- Clean up retry tokens created before sibling invalidation was enforced.
update public.employee_invitations i
set expires_at=least(i.expires_at,now())
where i.accepted_at is null
  and i.expires_at>now()
  and exists(
    select 1 from public.employees e
    where e.id=i.employee_id
      and e.user_id is not null
  );
