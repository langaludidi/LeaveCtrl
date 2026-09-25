create or replace function public.withdraw_leave_request(
  p_request_id uuid,
  p_note text default null
)
returns public.leave_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.leave_requests%rowtype;
  v_entitlement_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select r.*
    into v_request
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  where r.id = p_request_id
    and e.user_id = v_user_id
  for update of r;

  if v_request.id is null then raise exception 'request_not_found_or_not_owned'; end if;
  if v_request.status not in ('submitted','pending_approval') then
    raise exception 'request_not_withdrawable';
  end if;

  select id into v_entitlement_id
  from public.leave_entitlements
  where organisation_id = v_request.organisation_id
    and employee_id = v_request.employee_id
    and leave_type_id = v_request.leave_type_id
    and v_request.start_date between cycle_start and cycle_end
  order by cycle_start desc
  limit 1;

  insert into public.leave_ledger_entries(
    organisation_id, employee_id, leave_type_id, entitlement_id, request_id,
    entry_type, quantity, effective_date, reason, source_metadata, created_by
  )
  values (
    v_request.organisation_id, v_request.employee_id, v_request.leave_type_id,
    v_entitlement_id, v_request.id, 'leave_reversed', v_request.quantity,
    current_date, 'Withdrawn pending leave request',
    jsonb_build_object('previous_status', v_request.status),
    v_user_id
  );

  update public.leave_requests
  set status = 'withdrawn',
      updated_at = now()
  where id = v_request.id;

  insert into public.approval_actions(
    organisation_id, request_id, actor_user_id, action, note
  )
  values (
    v_request.organisation_id, v_request.id, v_user_id,
    'withdrawn', nullif(btrim(p_note), '')
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_request.organisation_id, v_user_id, 'leave_request', v_request.id,
    'leave.request.withdrawn',
    jsonb_build_object('quantity_restored', v_request.quantity)
  );

  return 'withdrawn';
end;
$$;

revoke execute on function public.withdraw_leave_request(uuid,text) from anon;
revoke execute on function public.withdraw_leave_request(uuid,text) from public;
grant execute on function public.withdraw_leave_request(uuid,text) to authenticated;

create or replace function public.request_leave_cancellation(
  p_request_id uuid,
  p_note text default null
)
returns public.leave_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.leave_requests%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select r.*
    into v_request
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  where r.id = p_request_id
    and e.user_id = v_user_id
  for update of r;

  if v_request.id is null then raise exception 'request_not_found_or_not_owned'; end if;
  if v_request.status <> 'approved' then raise exception 'request_not_approved'; end if;

  update public.leave_requests
  set status = 'cancellation_requested',
      updated_at = now()
  where id = v_request.id;

  insert into public.approval_actions(
    organisation_id, request_id, actor_user_id, action, note
  )
  values (
    v_request.organisation_id, v_request.id, v_user_id,
    'cancel_requested', nullif(btrim(p_note), '')
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_request.organisation_id, v_user_id, 'leave_request', v_request.id,
    'leave.cancellation.requested',
    jsonb_build_object('quantity', v_request.quantity)
  );

  return 'cancellation_requested';
end;
$$;

revoke execute on function public.request_leave_cancellation(uuid,text) from anon;
revoke execute on function public.request_leave_cancellation(uuid,text) from public;
grant execute on function public.request_leave_cancellation(uuid,text) to authenticated;

create or replace function public.decide_leave_cancellation(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns public.leave_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.leave_requests%rowtype;
  v_actor_employee_id uuid;
  v_entitlement_id uuid;
  v_authorised boolean := false;
  v_new_status public.leave_request_status;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select *
    into v_request
  from public.leave_requests
  where id = p_request_id
  for update;

  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status <> 'cancellation_requested' then
    raise exception 'cancellation_not_pending';
  end if;

  select e.id into v_actor_employee_id
  from public.employees e
  where e.organisation_id = v_request.organisation_id
    and e.user_id = v_user_id
    and e.employment_status = 'active'
  limit 1;

  if v_actor_employee_id = v_request.employee_id then
    raise exception 'self_approval_not_allowed';
  end if;

  v_authorised :=
    private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );

  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;

  if lower(p_decision) = 'approve' then
    select id into v_entitlement_id
    from public.leave_entitlements
    where organisation_id = v_request.organisation_id
      and employee_id = v_request.employee_id
      and leave_type_id = v_request.leave_type_id
      and v_request.start_date between cycle_start and cycle_end
    order by cycle_start desc
    limit 1;

    insert into public.leave_ledger_entries(
      organisation_id, employee_id, leave_type_id, entitlement_id, request_id,
      entry_type, quantity, effective_date, reason, source_metadata, created_by
    )
    values (
      v_request.organisation_id, v_request.employee_id, v_request.leave_type_id,
      v_entitlement_id, v_request.id, 'leave_reversed', v_request.quantity,
      current_date, 'Approved leave cancellation',
      jsonb_build_object('cancelled_by', v_user_id),
      v_user_id
    );

    v_new_status := 'cancelled';
  else
    v_new_status := 'approved';
  end if;

  update public.leave_requests
  set status = v_new_status,
      decided_at = now(),
      decided_by = v_user_id,
      updated_at = now()
  where id = v_request.id;

  insert into public.approval_actions(
    organisation_id, request_id, actor_user_id, action, note
  )
  values (
    v_request.organisation_id, v_request.id, v_user_id,
    case
      when v_new_status = 'cancelled'
        then 'cancel_approved'::public.approval_action_type
      else 'cancel_declined'::public.approval_action_type
    end,
    nullif(btrim(p_note), '')
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_request.organisation_id, v_user_id, 'leave_request', v_request.id,
    case
      when v_new_status = 'cancelled' then 'leave.cancellation.approved'
      else 'leave.cancellation.declined'
    end,
    jsonb_build_object('quantity', v_request.quantity)
  );

  return v_new_status;
end;
$$;

revoke execute on function public.decide_leave_cancellation(uuid,text,text) from anon;
revoke execute on function public.decide_leave_cancellation(uuid,text,text) from public;
grant execute on function public.decide_leave_cancellation(uuid,text,text) to authenticated;
