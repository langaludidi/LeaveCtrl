-- First authoritative LeaveCtrl workflow slice.
-- Adds holiday-aware calculation, tighter manager visibility, balance projection,
-- initial annual-leave configuration and governed submit/decision RPCs.

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  source_reference text,
  created_at timestamptz not null default now(),
  unique (organisation_id, holiday_date)
);

alter table public.public_holidays enable row level security;

create policy public_holidays_read on public.public_holidays
for select using (private.is_org_member(organisation_id));

create policy public_holidays_admin_insert on public.public_holidays
for insert with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create policy public_holidays_admin_update on public.public_holidays
for update using (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
) with check (
  private.has_org_role(organisation_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role])
);

create index public_holidays_org_date_idx
on public.public_holidays(organisation_id, holiday_date);

create or replace function private.manages_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees report
    join public.employees manager on manager.id = report.manager_employee_id
    where report.id = employee
      and manager.user_id = auth.uid()
      and manager.organisation_id = report.organisation_id
      and manager.employment_status = 'active'
  )
$$;

grant execute on function private.manages_employee(uuid) to authenticated;

drop policy if exists entitlements_read on public.leave_entitlements;
create policy entitlements_read on public.leave_entitlements
for select using (
  private.is_self_employee(employee_id)
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role]
  )
);

drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests
for select using (
  private.is_self_employee(employee_id)
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role]
  )
);

drop policy if exists leave_requests_employee_insert on public.leave_requests;
drop policy if exists leave_requests_employee_update_own_draft on public.leave_requests;

drop policy if exists ledger_read on public.leave_ledger_entries;
create policy ledger_read on public.leave_ledger_entries
for select using (
  private.is_self_employee(employee_id)
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role]
  )
);

drop policy if exists approvals_read on public.approval_actions;
create policy approvals_read on public.approval_actions
for select using (
  exists (
    select 1
    from public.leave_requests r
    where r.id = request_id
      and (
        private.is_self_employee(r.employee_id)
        or private.manages_employee(r.employee_id)
        or private.has_org_role(
          r.organisation_id,
          array['hr_admin'::public.member_role,'org_admin'::public.member_role,'auditor'::public.member_role]
        )
      )
  )
);

create or replace view public.leave_balances
with (security_invoker = true)
as
select
  l.organisation_id,
  l.employee_id,
  l.leave_type_id,
  coalesce(sum(l.quantity), 0)::numeric(10,2) as available_balance
from public.leave_ledger_entries l
group by l.organisation_id, l.employee_id, l.leave_type_id;

grant select on public.leave_balances to authenticated;

create or replace function public.configure_initial_leave_policy(
  p_annual_days numeric,
  p_cycle_start date,
  p_cycle_end date
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
  v_leave_type_id uuid;
  v_policy_id uuid;
  v_entitlement_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select e.organisation_id, e.id
    into v_org_id, v_employee_id
  from public.employees e
  join public.organisation_memberships m
    on m.organisation_id = e.organisation_id
   and m.user_id = v_user_id
   and m.is_active
  where e.user_id = v_user_id
  order by e.created_at
  limit 1;

  if v_org_id is null or not private.has_org_role(v_org_id, array['org_admin'::public.member_role,'hr_admin'::public.member_role]) then
    raise exception 'not_authorised';
  end if;

  if p_annual_days <= 0 or p_cycle_end < p_cycle_start then
    raise exception 'invalid_policy_configuration';
  end if;

  insert into public.leave_types(
    organisation_id, code, name, unit, is_statutory, requires_approval, colour_token
  )
  values (v_org_id, 'ANNUAL', 'Annual Leave', 'days', false, true, 'teal')
  on conflict (organisation_id, code)
  do update set name = excluded.name, active = true
  returning id into v_leave_type_id;

  select id into v_policy_id
  from public.leave_policy_versions
  where organisation_id = v_org_id
    and leave_type_id = v_leave_type_id
    and effective_from = p_cycle_start
  order by version desc
  limit 1;

  if v_policy_id is null then
    insert into public.leave_policy_versions(
      organisation_id, leave_type_id, version, effective_from, effective_to,
      entitlement_method, entitlement_amount, cycle_months,
      negative_balance_allowed, approval_rule, statutory_source
    )
    values (
      v_org_id, v_leave_type_id, 1, p_cycle_start, p_cycle_end,
      'fixed_days', p_annual_days, 12, false,
      '{"mode":"manager"}'::jsonb,
      '{"status":"employer_configured","requires_review":true}'::jsonb
    )
    returning id into v_policy_id;
  end if;

  insert into public.leave_entitlements(
    organisation_id, employee_id, leave_type_id, policy_version_id,
    cycle_start, cycle_end, opening_entitlement
  )
  values (
    v_org_id, v_employee_id, v_leave_type_id, v_policy_id,
    p_cycle_start, p_cycle_end, p_annual_days
  )
  on conflict (employee_id, leave_type_id, cycle_start)
  do update set
    cycle_end = excluded.cycle_end,
    policy_version_id = excluded.policy_version_id,
    opening_entitlement = excluded.opening_entitlement
  returning id into v_entitlement_id;

  if not exists (
    select 1 from public.leave_ledger_entries
    where entitlement_id = v_entitlement_id
      and entry_type = 'entitlement_granted'
  ) then
    insert into public.leave_ledger_entries(
      organisation_id, employee_id, leave_type_id, entitlement_id,
      entry_type, quantity, effective_date, reason, source_metadata, created_by
    )
    values (
      v_org_id, v_employee_id, v_leave_type_id, v_entitlement_id,
      'entitlement_granted', p_annual_days, p_cycle_start,
      'Initial annual leave entitlement',
      jsonb_build_object('source','organisation_setup'),
      v_user_id
    );
  end if;

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'leave_policy_version', v_policy_id,
    'leave.policy.initialised',
    jsonb_build_object('annual_days', p_annual_days, 'cycle_start', p_cycle_start, 'cycle_end', p_cycle_end)
  );

  return v_policy_id;
end;
$$;

revoke execute on function public.configure_initial_leave_policy(numeric,date,date) from anon;
revoke execute on function public.configure_initial_leave_policy(numeric,date,date) from public;
grant execute on function public.configure_initial_leave_policy(numeric,date,date) to authenticated;

create or replace function public.submit_leave_request(
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text default null
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
  v_policy_id uuid;
  v_entitlement_id uuid;
  v_schedule public.work_schedules%rowtype;
  v_request_id uuid;
  v_date date;
  v_hours numeric(5,2);
  v_quantity numeric(10,2) := 0;
  v_balance numeric(10,2) := 0;
  v_negative_allowed boolean := false;
  v_is_holiday boolean;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_end_date < p_start_date then raise exception 'invalid_date_range'; end if;

  select e.organisation_id, e.id
    into v_org_id, v_employee_id
  from public.employees e
  where e.user_id = v_user_id
    and e.employment_status = 'active'
  order by e.created_at
  limit 1;

  if v_employee_id is null then raise exception 'employee_profile_required'; end if;

  if not exists (
    select 1 from public.leave_types lt
    where lt.id = p_leave_type_id and lt.organisation_id = v_org_id and lt.active
  ) then raise exception 'leave_type_not_available'; end if;

  select lpv.id, lpv.negative_balance_allowed
    into v_policy_id, v_negative_allowed
  from public.leave_policy_versions lpv
  where lpv.organisation_id = v_org_id
    and lpv.leave_type_id = p_leave_type_id
    and lpv.effective_from <= p_start_date
    and (lpv.effective_to is null or lpv.effective_to >= p_start_date)
  order by lpv.effective_from desc, lpv.version desc
  limit 1;

  if v_policy_id is null then raise exception 'leave_policy_not_configured'; end if;

  select lea.id into v_entitlement_id
  from public.leave_entitlements lea
  where lea.organisation_id = v_org_id
    and lea.employee_id = v_employee_id
    and lea.leave_type_id = p_leave_type_id
    and p_start_date between lea.cycle_start and lea.cycle_end
  order by lea.cycle_start desc
  limit 1;

  if v_entitlement_id is null then raise exception 'leave_entitlement_not_configured'; end if;

  select ws.* into v_schedule
  from public.employee_schedule_assignments esa
  join public.work_schedules ws on ws.id = esa.work_schedule_id
  where esa.employee_id = v_employee_id
    and esa.effective_from <= p_start_date
    and (esa.effective_to is null or esa.effective_to >= p_start_date)
  order by esa.effective_from desc
  limit 1;

  if v_schedule.id is null then raise exception 'work_schedule_not_configured'; end if;

  insert into public.leave_requests(
    organisation_id, employee_id, leave_type_id, policy_version_id,
    start_date, end_date, quantity, status, note, submitted_at
  )
  values (
    v_org_id, v_employee_id, p_leave_type_id, v_policy_id,
    p_start_date, p_end_date, 0, 'pending_approval', nullif(btrim(p_note), ''), now()
  )
  returning id into v_request_id;

  v_date := p_start_date;
  while v_date <= p_end_date loop
    v_hours := case extract(isodow from v_date)::int
      when 1 then v_schedule.monday_hours
      when 2 then v_schedule.tuesday_hours
      when 3 then v_schedule.wednesday_hours
      when 4 then v_schedule.thursday_hours
      when 5 then v_schedule.friday_hours
      when 6 then v_schedule.saturday_hours
      when 7 then v_schedule.sunday_hours
    end;

    select exists (
      select 1 from public.public_holidays ph
      where ph.organisation_id = v_org_id and ph.holiday_date = v_date
    ) into v_is_holiday;

    if coalesce(v_hours,0) <= 0 then
      insert into public.leave_request_days(
        organisation_id, request_id, leave_date, scheduled_hours, chargeable_quantity, exclusion_reason
      ) values (v_org_id, v_request_id, v_date, coalesce(v_hours,0), 0, 'non_working_day');
    elsif v_is_holiday then
      insert into public.leave_request_days(
        organisation_id, request_id, leave_date, scheduled_hours, chargeable_quantity, exclusion_reason
      ) values (v_org_id, v_request_id, v_date, v_hours, 0, 'public_holiday');
    else
      insert into public.leave_request_days(
        organisation_id, request_id, leave_date, scheduled_hours, chargeable_quantity
      ) values (v_org_id, v_request_id, v_date, v_hours, 1);
      v_quantity := v_quantity + 1;
    end if;

    v_date := v_date + 1;
  end loop;

  if v_quantity <= 0 then raise exception 'no_chargeable_working_days'; end if;

  select coalesce(sum(quantity),0) into v_balance
  from public.leave_ledger_entries
  where organisation_id = v_org_id
    and employee_id = v_employee_id
    and leave_type_id = p_leave_type_id;

  if not v_negative_allowed and v_balance < v_quantity then
    raise exception 'insufficient_leave_balance';
  end if;

  update public.leave_requests
  set quantity = v_quantity, updated_at = now()
  where id = v_request_id;

  insert into public.leave_ledger_entries(
    organisation_id, employee_id, leave_type_id, entitlement_id, request_id,
    entry_type, quantity, effective_date, reason, source_metadata, created_by
  )
  values (
    v_org_id, v_employee_id, p_leave_type_id, v_entitlement_id, v_request_id,
    'leave_reserved', -v_quantity, p_start_date,
    'Pending leave request reservation',
    jsonb_build_object('request_status','pending_approval'),
    v_user_id
  );

  insert into public.approval_actions(
    organisation_id, request_id, actor_user_id, action, note
  )
  values (v_org_id, v_request_id, v_user_id, 'submitted', null);

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'leave_request', v_request_id,
    'leave.request.submitted',
    jsonb_build_object('quantity', v_quantity, 'start_date', p_start_date, 'end_date', p_end_date)
  );

  return v_request_id;
end;
$$;

revoke execute on function public.submit_leave_request(uuid,date,date,text) from anon;
revoke execute on function public.submit_leave_request(uuid,date,date,text) from public;
grant execute on function public.submit_leave_request(uuid,date,date,text) to authenticated;

create or replace function public.decide_leave_request(
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
  v_entitlement_id uuid;
  v_authorised boolean := false;
  v_new_status public.leave_request_status;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select * into v_request
  from public.leave_requests
  where id = p_request_id
  for update;

  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status <> 'pending_approval' then raise exception 'request_not_pending'; end if;

  v_authorised :=
    private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );

  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;

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
    v_request.start_date, 'Release pending leave reservation',
    jsonb_build_object('decision', lower(p_decision)), v_user_id
  );

  if lower(p_decision) = 'approve' then
    v_new_status := 'approved';
    insert into public.leave_ledger_entries(
      organisation_id, employee_id, leave_type_id, entitlement_id, request_id,
      entry_type, quantity, effective_date, reason, source_metadata, created_by
    )
    values (
      v_request.organisation_id, v_request.employee_id, v_request.leave_type_id,
      v_entitlement_id, v_request.id, 'leave_approved', -v_request.quantity,
      v_request.start_date, 'Approved leave',
      jsonb_build_object('approved_by', v_user_id), v_user_id
    );
  else
    v_new_status := 'declined';
  end if;

  update public.leave_requests
  set status = v_new_status, decided_at = now(), decided_by = v_user_id, updated_at = now()
  where id = v_request.id;

  insert into public.approval_actions(
    organisation_id, request_id, actor_user_id, action, note
  )
  values (
    v_request.organisation_id, v_request.id, v_user_id,
    case when v_new_status = 'approved' then 'approved'::public.approval_action_type
         else 'declined'::public.approval_action_type end,
    nullif(btrim(p_note), '')
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_request.organisation_id, v_user_id, 'leave_request', v_request.id,
    case when v_new_status = 'approved' then 'leave.request.approved'
         else 'leave.request.declined' end,
    jsonb_build_object('quantity', v_request.quantity)
  );

  return v_new_status;
end;
$$;

revoke execute on function public.decide_leave_request(uuid,text,text) from anon;
revoke execute on function public.decide_leave_request(uuid,text,text) from public;
grant execute on function public.decide_leave_request(uuid,text,text) to authenticated;
