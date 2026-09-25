
create or replace function public.exit_employee(
  p_employee_id uuid,
  p_end_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_employee public.employees%rowtype;
  v_request public.leave_requests%rowtype;
  v_toil public.toil_requests%rowtype;
  v_entitlement_id uuid;
  v_leave_closed integer:=0;
  v_toil_closed integer:=0;
  v_was_org_admin boolean:=false;
  v_other_org_admins integer:=0;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if p_end_date>current_date then raise exception 'future_exit_not_supported_v1'; end if;

  select *
    into v_employee
  from public.employees
  where id=p_employee_id
  for update;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;
  if v_employee.employment_status<>'active' then raise exception 'employee_not_active'; end if;
  if p_end_date<v_employee.start_date then raise exception 'exit_before_start_date'; end if;

  if not private.has_org_role(
    v_employee.organisation_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  if v_employee.user_id=v_user_id then
    raise exception 'cannot_exit_own_profile';
  end if;

  if v_employee.user_id is not null then
    select exists(
      select 1
      from public.organisation_memberships m
      where m.organisation_id=v_employee.organisation_id
        and m.user_id=v_employee.user_id
        and m.role='org_admin'
        and m.is_active
    )
    into v_was_org_admin;

    if v_was_org_admin then
      select count(distinct m.user_id)
        into v_other_org_admins
      from public.organisation_memberships m
      where m.organisation_id=v_employee.organisation_id
        and m.role='org_admin'
        and m.is_active
        and m.user_id<>v_employee.user_id;

      if v_other_org_admins=0 then
        raise exception 'last_org_admin_cannot_exit';
      end if;
    end if;
  end if;

  if exists(
    select 1
    from public.leave_requests lr
    where lr.employee_id=v_employee.id
      and lr.status in ('submitted','pending_approval','approved','cancellation_requested')
      and lr.start_date<=p_end_date
      and lr.end_date>p_end_date
  ) then
    raise exception 'active_absence_crosses_exit_date';
  end if;

  for v_request in
    select *
    from public.leave_requests lr
    where lr.employee_id=v_employee.id
      and lr.status in ('submitted','pending_approval','approved','cancellation_requested')
      and lr.start_date>p_end_date
    order by lr.start_date,lr.created_at
    for update
  loop
    select lea.id
      into v_entitlement_id
    from public.leave_entitlements lea
    where lea.organisation_id=v_request.organisation_id
      and lea.employee_id=v_request.employee_id
      and lea.leave_type_id=v_request.leave_type_id
      and v_request.start_date between lea.cycle_start and lea.cycle_end
    order by lea.cycle_start desc
    limit 1;

    insert into public.leave_ledger_entries(
      organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
      entry_type,quantity,effective_date,reason,source_metadata,created_by
    ) values(
      v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,
      v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,
      current_date,'Employment ended before requested absence',
      jsonb_build_object(
        'previous_status',v_request.status,
        'employment_end_date',p_end_date,
        'offboarding',true
      ),
      v_user_id
    );

    update public.leave_requests
    set
      status=case
        when v_request.status in ('submitted','pending_approval') then 'withdrawn'::public.leave_request_status
        else 'cancelled'::public.leave_request_status
      end,
      decided_at=now(),
      decided_by=v_user_id,
      updated_at=now()
    where id=v_request.id;

    insert into public.approval_actions(
      organisation_id,request_id,actor_user_id,action,note
    ) values(
      v_request.organisation_id,
      v_request.id,
      v_user_id,
      case
        when v_request.status in ('submitted','pending_approval')
          then 'withdrawn'::public.approval_action_type
        else 'cancel_approved'::public.approval_action_type
      end,
      'Closed automatically during employee offboarding'
    );

    insert into public.audit_events(
      organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
    ) values(
      v_request.organisation_id,v_user_id,'leave_request',v_request.id,
      'leave.request.closed_on_employee_exit',
      jsonb_build_object(
        'previous_status',v_request.status,
        'quantity_restored',v_request.quantity,
        'employment_end_date',p_end_date
      )
    );

    v_leave_closed:=v_leave_closed+1;
  end loop;

  for v_toil in
    select *
    from public.toil_requests tr
    where tr.employee_id=v_employee.id
      and tr.status in ('pending_approval','approved','cancellation_requested')
      and tr.leave_date>p_end_date
    order by tr.leave_date,tr.created_at
    for update
  loop
    insert into public.toil_ledger_entries(
      organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
    ) values(
      v_toil.organisation_id,v_toil.employee_id,'reversed',v_toil.hours,
      current_date,'Employment ended before requested TOIL',v_user_id
    );

    update public.toil_requests
    set
      status=case
        when v_toil.status='pending_approval' then 'withdrawn'
        else 'cancelled'
      end,
      decided_at=now(),
      decided_by=v_user_id,
      updated_at=now()
    where id=v_toil.id;

    insert into public.audit_events(
      organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
    ) values(
      v_toil.organisation_id,v_user_id,'toil_request',v_toil.id,
      'toil.request.closed_on_employee_exit',
      jsonb_build_object(
        'previous_status',v_toil.status,
        'hours_restored',v_toil.hours,
        'employment_end_date',p_end_date
      )
    );

    v_toil_closed:=v_toil_closed+1;
  end loop;

  update public.employee_employment_conditions
  set effective_to=p_end_date
  where employee_id=v_employee.id
    and effective_from<=p_end_date
    and (effective_to is null or effective_to>p_end_date);

  update public.employee_schedule_assignments
  set effective_to=p_end_date
  where employee_id=v_employee.id
    and effective_from<=p_end_date
    and (effective_to is null or effective_to>p_end_date);

  update public.employee_remuneration_history
  set effective_to=p_end_date
  where employee_id=v_employee.id
    and effective_from<=p_end_date
    and (effective_to is null or effective_to>p_end_date);

  update public.employee_invitations
  set expires_at=least(expires_at,now())
  where employee_id=v_employee.id
    and accepted_at is null
    and expires_at>now();

  if v_employee.user_id is not null then
    update public.organisation_memberships
    set is_active=false
    where organisation_id=v_employee.organisation_id
      and user_id=v_employee.user_id
      and is_active;
  end if;

  update public.employees
  set
    employment_status='exited',
    end_date=p_end_date,
    updated_at=now()
  where id=v_employee.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_employee.organisation_id,v_user_id,'employee',v_employee.id,
    'employee.exited',
    jsonb_build_object(
      'end_date',p_end_date,
      'reason',btrim(p_reason),
      'leave_requests_closed',v_leave_closed,
      'toil_requests_closed',v_toil_closed,
      'access_deactivated',v_employee.user_id is not null
    )
  );

  return jsonb_build_object(
    'employee_id',v_employee.id,
    'status','exited',
    'end_date',p_end_date,
    'leave_requests_closed',v_leave_closed,
    'toil_requests_closed',v_toil_closed,
    'access_deactivated',v_employee.user_id is not null
  );
end;
$$;

revoke execute on function public.exit_employee(uuid,date,text)
from public,anon;
grant execute on function public.exit_employee(uuid,date,text)
to authenticated;
