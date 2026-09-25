
create or replace function private.organisation_business_date(p_org_id uuid)
returns date
language sql
stable
security definer
set search_path=''
as $$
  select (
    now() at time zone coalesce(
      (select o.timezone from public.organisations o where o.id=p_org_id),
      'UTC'
    )
  )::date;
$$;

revoke all on function private.organisation_business_date(uuid)
from public,anon,authenticated;



create or replace function private.manages_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select exists (
    select 1
    from public.employee_employment_conditions ec
    join public.employees manager on manager.id=ec.manager_employee_id
    join public.organisation_memberships membership
      on membership.organisation_id=ec.organisation_id
     and membership.user_id=manager.user_id
     and membership.is_active
    where ec.employee_id=employee
      and ec.effective_from<=private.organisation_business_date(ec.organisation_id)
      and (
        ec.effective_to is null
        or ec.effective_to>=private.organisation_business_date(ec.organisation_id)
      )
      and manager.user_id=auth.uid()
      and manager.organisation_id=ec.organisation_id
      and manager.employment_status='active'
  )
  or exists (
    select 1
    from public.employees report
    join public.employees manager on manager.id=report.manager_employee_id
    join public.organisation_memberships membership
      on membership.organisation_id=report.organisation_id
     and membership.user_id=manager.user_id
     and membership.is_active
    where report.id=employee
      and not exists(
        select 1
        from public.employee_employment_conditions ec
        where ec.employee_id=report.id
          and ec.effective_from<=private.organisation_business_date(report.organisation_id)
          and (
            ec.effective_to is null
            or ec.effective_to>=private.organisation_business_date(report.organisation_id)
          )
      )
      and manager.user_id=auth.uid()
      and manager.organisation_id=report.organisation_id
      and manager.employment_status='active'
  );
$$;

revoke all on function private.manages_employee(uuid)
from public,anon,authenticated;



create or replace view public.employee_current_conditions
with (security_invoker=true)
as
select distinct on (ec.employee_id)
  ec.organisation_id,
  ec.employee_id,
  ec.department_id,
  ec.manager_employee_id,
  ec.work_schedule_id,
  ec.location_id,
  ec.work_mode,
  ec.change_type,
  ec.reason,
  ec.effective_from
from public.employee_employment_conditions ec
join public.organisations o on o.id=ec.organisation_id
where ec.effective_from <= (now() at time zone o.timezone)::date
  and (
    ec.effective_to is null
    or ec.effective_to >= (now() at time zone o.timezone)::date
  )
order by ec.employee_id,ec.effective_from desc;



create or replace view public.leave_balances
with (security_invoker=true)
as
with current_entitlement as (
  select distinct on (le.employee_id,le.leave_type_id)
    le.id,
    le.organisation_id,
    le.employee_id,
    le.leave_type_id,
    le.cycle_start,
    le.cycle_end
  from public.leave_entitlements le
  join public.organisations o on o.id=le.organisation_id
  where (now() at time zone o.timezone)::date
        between le.cycle_start and le.cycle_end
  order by le.employee_id,le.leave_type_id,le.cycle_start desc
)
select
  ce.organisation_id,
  ce.employee_id,
  ce.leave_type_id,
  ce.id as entitlement_id,
  ce.cycle_start,
  ce.cycle_end,
  coalesce(sum(l.quantity),0)::numeric(10,2) as available_balance
from current_entitlement ce
left join public.leave_ledger_entries l
  on l.entitlement_id=ce.id
group by
  ce.organisation_id,ce.employee_id,ce.leave_type_id,
  ce.id,ce.cycle_start,ce.cycle_end;



create or replace view public.employee_leave_liability_rates
with (security_invoker=true)
as
with business_dates as (
  select
    o.id as organisation_id,
    (now() at time zone o.timezone)::date as business_date
  from public.organisations o
),
current_rem as (
  select distinct on (r.employee_id)
    r.organisation_id,
    r.employee_id,
    r.currency_code,
    r.liability_daily_rate as base_daily_rate,
    r.calculation_method as base_calculation_method
  from public.employee_remuneration_history r
  join business_dates bd on bd.organisation_id=r.organisation_id
  where r.effective_from<=bd.business_date
    and (r.effective_to is null or r.effective_to>=bd.business_date)
  order by r.employee_id,r.effective_from desc
),
settings as (
  select
    o.id as organisation_id,
    coalesce(os.liability_averaging_weeks,13) as averaging_weeks,
    coalesce(os.include_paid_overtime_in_liability,true) as include_paid_overtime
  from public.organisations o
  left join public.overtime_settings os on os.organisation_id=o.id
),
periods as (
  select
    cr.organisation_id,
    cr.employee_id,
    cr.currency_code,
    cr.base_daily_rate,
    cr.base_calculation_method,
    s.averaging_weeks,
    s.include_paid_overtime,
    bd.business_date-(s.averaging_weeks*7-1) as averaging_start,
    bd.business_date as averaging_end
  from current_rem cr
  join settings s on s.organisation_id=cr.organisation_id
  join business_dates bd on bd.organisation_id=cr.organisation_id
),
variable as (
  select
    p.employee_id,
    coalesce(sum(
      case
        when ve.include_in_leave_liability
          and (ve.category<>'overtime' or p.include_paid_overtime)
        then ve.amount
        else 0
      end
    ),0)::numeric(14,2) as variable_earnings_total
  from periods p
  left join public.employee_variable_earnings ve
    on ve.employee_id=p.employee_id
   and ve.earning_date between p.averaging_start and p.averaging_end
  group by p.employee_id
),
workdays as (
  select
    p.employee_id,
    public.liability_scheduled_days(
      p.employee_id,p.averaging_start,p.averaging_end
    ) as scheduled_days
  from periods p
)
select
  p.organisation_id,
  p.employee_id,
  p.currency_code,
  p.base_daily_rate,
  v.variable_earnings_total,
  p.averaging_weeks,
  p.averaging_start,
  p.averaging_end,
  w.scheduled_days,
  case
    when w.scheduled_days>0
      then round(v.variable_earnings_total/w.scheduled_days,4)
    else 0
  end as variable_daily_rate,
  round(
    p.base_daily_rate+
    case
      when w.scheduled_days>0 then v.variable_earnings_total/w.scheduled_days
      else 0
    end
  ,4) as effective_daily_rate,
  p.base_calculation_method,
  format(
    'Base daily rate + includable variable earnings over %s weeks / %s scheduled working days',
    p.averaging_weeks,
    coalesce(w.scheduled_days,0)
  ) as liability_calculation_method
from periods p
join variable v on v.employee_id=p.employee_id
join workdays w on w.employee_id=p.employee_id;


CREATE OR REPLACE FUNCTION private.configure_annual_leave_policy_v2(p_annual_days numeric, p_cycle_basis text, p_fixed_cycle_start_month integer, p_fixed_cycle_start_day integer, p_effective_from date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_leave_type_id uuid;
  v_policy_id uuid;
  v_previous public.leave_policy_versions%rowtype;
  v_next_version integer;
  v_employee record;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;
  if p_annual_days<=0 then raise exception 'invalid_annual_days'; end if;
  if p_cycle_basis not in ('organisation_fixed','employment_anniversary') then
    raise exception 'invalid_cycle_basis';
  end if;
  if p_effective_from is null then
    p_effective_from:=private.organisation_business_date(v_org_id);
  end if;

  if p_cycle_basis='organisation_fixed' then
    if p_fixed_cycle_start_month is null
       or p_fixed_cycle_start_month not between 1 and 12
       or p_fixed_cycle_start_day is null
       or p_fixed_cycle_start_day not between 1 and 31 then
      raise exception 'invalid_fixed_cycle_anchor';
    end if;
    perform private.safe_cycle_date(
      extract(year from p_effective_from)::integer,
      p_fixed_cycle_start_month,
      p_fixed_cycle_start_day
    );
  end if;

  insert into public.leave_types(
    organisation_id,code,name,unit,is_statutory,requires_approval,colour_token
  ) values(
    v_org_id,'ANNUAL','Annual Leave','days',false,true,'teal'
  )
  on conflict(organisation_id,code)
  do update set name=excluded.name,active=true
  returning id into v_leave_type_id;

  select * into v_previous
  from public.leave_policy_versions
  where organisation_id=v_org_id
    and leave_type_id=v_leave_type_id
    and effective_from<=p_effective_from
    and (effective_to is null or effective_to>=p_effective_from)
  order by version desc
  limit 1
  for update;

  select coalesce(max(version),0)+1 into v_next_version
  from public.leave_policy_versions
  where organisation_id=v_org_id
    and leave_type_id=v_leave_type_id;

  if v_previous.id is not null
     and v_previous.effective_from=p_effective_from
     and not exists(
       select 1
       from public.leave_requests r
       where r.policy_version_id=v_previous.id
     ) then
    update public.leave_policy_versions
    set entitlement_amount=p_annual_days,
        cycle_basis=p_cycle_basis,
        cycle_anchor_month=case
          when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_month
          else null
        end,
        cycle_anchor_day=case
          when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_day
          else null
        end,
        effective_to=null
    where id=v_previous.id
    returning id into v_policy_id;
  else
    if v_previous.id is not null and v_previous.effective_from<p_effective_from then
      update public.leave_policy_versions
      set effective_to=p_effective_from-1
      where id=v_previous.id;
    end if;

    insert into public.leave_policy_versions(
      organisation_id,leave_type_id,version,effective_from,effective_to,
      entitlement_method,entitlement_amount,cycle_months,
      cycle_basis,cycle_anchor_month,cycle_anchor_day,
      negative_balance_allowed,approval_rule,statutory_source
    ) values(
      v_org_id,v_leave_type_id,v_next_version,p_effective_from,null,
      'fixed_days',p_annual_days,12,
      p_cycle_basis,
      case when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_month else null end,
      case when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_day else null end,
      false,
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object(
        'status','employer_configured',
        'requires_review',true,
        'statutory_cycle_reference','BCEA section 20(1)'
      )
    )
    returning id into v_policy_id;
  end if;

  for v_employee in
    select e.id
    from public.employees e
    where e.organisation_id=v_org_id
      and e.employment_status='active'
      and not exists(
        select 1
        from public.leave_entitlements le
        where le.employee_id=e.id
          and le.leave_type_id=v_leave_type_id
          and private.organisation_business_date(v_org_id) between le.cycle_start and le.cycle_end
      )
  loop
    perform private.provision_employee_entitlements(
      v_employee.id,v_user_id,'{}'::jsonb
    );
  end loop;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'leave_policy_version',v_policy_id,
    'leave.policy.configured',
    jsonb_build_object(
      'annual_days',p_annual_days,
      'cycle_basis',p_cycle_basis,
      'fixed_cycle_start_month',p_fixed_cycle_start_month,
      'fixed_cycle_start_day',p_fixed_cycle_start_day,
      'effective_from',p_effective_from
    )
  );

  return v_policy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.provision_employee_entitlements(p_employee_id uuid, p_actor_user_id uuid, p_opening_balances jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.provision_employee_entitlements_for_date(
    p_employee_id,
    p_actor_user_id,
    private.organisation_business_date(
      (select e.organisation_id from public.employees e where e.id=p_employee_id)
    ),
    p_opening_balances
  );
$function$;

CREATE OR REPLACE FUNCTION public.adjust_toil_balance(p_employee_id uuid, p_hours numeric, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_hours=0 then raise exception 'adjustment_cannot_be_zero'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;

  select organisation_id into v_org_id
  from public.employees where id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then raise exception 'not_authorised'; end if;

  insert into public.toil_ledger_entries(
    organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
  ) values(
    v_org_id,p_employee_id,'adjustment',p_hours,private.organisation_business_date(v_org_id),btrim(p_reason),v_user_id
  )
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_employee_condition_change(p_employee_id uuid, p_effective_from date, p_department_id uuid, p_manager_employee_id uuid, p_work_schedule_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_work_mode text DEFAULT 'onsite'::text, p_change_type text DEFAULT 'combined_change'::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_id uuid;
  v_next date;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select e.organisation_id into v_org_id
  from public.employees e where e.id=p_employee_id;
  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then raise exception 'not_authorised'; end if;

  if p_work_mode not in ('onsite','hybrid','remote','field') then
    raise exception 'invalid_work_mode';
  end if;

  if p_change_type not in ('transfer','schedule_change','work_mode_change','manager_change','combined_change') then
    raise exception 'invalid_change_type';
  end if;

  if p_department_id is not null and not exists(
    select 1 from public.departments d
    where d.id=p_department_id and d.organisation_id=v_org_id and d.active
  ) then raise exception 'invalid_department'; end if;

  if p_manager_employee_id is not null and not exists(
    select 1 from public.employees m
    where m.id=p_manager_employee_id and m.organisation_id=v_org_id and m.employment_status='active'
  ) then raise exception 'invalid_manager'; end if;

  if p_manager_employee_id=p_employee_id then raise exception 'employee_cannot_manage_self'; end if;

  if not exists(
    select 1 from public.work_schedules ws
    where ws.id=p_work_schedule_id and ws.organisation_id=v_org_id
  ) then raise exception 'invalid_work_schedule'; end if;

  if p_location_id is not null and not exists(
    select 1 from public.locations l
    where l.id=p_location_id and l.organisation_id=v_org_id and l.active
  ) then raise exception 'invalid_location'; end if;

  select min(ec.effective_from) into v_next
  from public.employee_employment_conditions ec
  where ec.employee_id=p_employee_id and ec.effective_from>p_effective_from;

  update public.employee_employment_conditions
  set effective_to=p_effective_from-1
  where employee_id=p_employee_id
    and effective_from<p_effective_from
    and (effective_to is null or effective_to>=p_effective_from);

  insert into public.employee_employment_conditions(
    organisation_id,employee_id,department_id,manager_employee_id,work_schedule_id,
    location_id,work_mode,change_type,reason,effective_from,effective_to,created_by
  ) values(
    v_org_id,p_employee_id,p_department_id,p_manager_employee_id,p_work_schedule_id,
    p_location_id,p_work_mode,p_change_type,nullif(btrim(p_reason),''),
    p_effective_from,
    case when v_next is null then null else v_next-1 end,
    v_user_id
  )
  on conflict(employee_id,effective_from) do update set
    department_id=excluded.department_id,
    manager_employee_id=excluded.manager_employee_id,
    work_schedule_id=excluded.work_schedule_id,
    location_id=excluded.location_id,
    work_mode=excluded.work_mode,
    change_type=excluded.change_type,
    reason=excluded.reason,
    effective_to=excluded.effective_to,
    created_by=excluded.created_by
  returning id into v_id;

  update public.employee_schedule_assignments
  set effective_to=p_effective_from-1
  where employee_id=p_employee_id
    and effective_from<p_effective_from
    and (effective_to is null or effective_to>=p_effective_from);

  insert into public.employee_schedule_assignments(
    organisation_id,employee_id,work_schedule_id,effective_from,effective_to
  ) values(
    v_org_id,p_employee_id,p_work_schedule_id,p_effective_from,
    case when v_next is null then null else v_next-1 end
  )
  on conflict do nothing;

  if p_effective_from<=private.organisation_business_date(v_org_id) and (v_next is null or v_next>private.organisation_business_date(v_org_id)) then
    update public.employees
    set department_id=p_department_id,
        manager_employee_id=p_manager_employee_id,
        updated_at=now()
    where id=p_employee_id;
  end if;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'employee',p_employee_id,'employee.conditions.changed',
    jsonb_build_object(
      'effective_from',p_effective_from,
      'department_id',p_department_id,
      'manager_employee_id',p_manager_employee_id,
      'work_schedule_id',p_work_schedule_id,
      'location_id',p_location_id,
      'work_mode',p_work_mode,
      'change_type',p_change_type,
      'reason',nullif(btrim(p_reason),'')
    )
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_leave_cancellation(p_request_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS leave_request_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      private.organisation_business_date(v_request.organisation_id), 'Approved leave cancellation',
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
$function$;

CREATE OR REPLACE FUNCTION public.decide_toil_cancellation(p_request_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.toil_requests%rowtype;
  v_actor_employee_id uuid;
  v_authorised boolean:=false;
  v_status text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select * into v_request
  from public.toil_requests
  where id=p_request_id
  for update;

  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status<>'cancellation_requested' then
    raise exception 'cancellation_not_pending';
  end if;

  select id into v_actor_employee_id
  from public.employees
  where organisation_id=v_request.organisation_id
    and user_id=v_user_id
    and employment_status='active'
  limit 1;

  if v_actor_employee_id=v_request.employee_id then
    raise exception 'self_approval_not_allowed';
  end if;

  v_authorised:=
    private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );

  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then
    raise exception 'invalid_decision';
  end if;

  if lower(p_decision)='approve' then
    insert into public.toil_ledger_entries(
      organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
    ) values(
      v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,
      private.organisation_business_date(v_request.organisation_id),'Approved TOIL cancellation',v_user_id
    );
    v_status:='cancelled';
  else
    v_status:='approved';
  end if;

  update public.toil_requests
  set status=v_status,decided_at=now(),decided_by=v_user_id,updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'toil_request',v_request.id,
    case when v_status='cancelled'
      then 'toil.cancellation.approved'
      else 'toil.cancellation.declined'
    end,
    jsonb_build_object('hours',v_request.hours,'note',nullif(btrim(p_note),''))
  );

  return v_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.exit_employee(p_employee_id uuid, p_end_date date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
  v_future_conditions_cancelled integer:=0;
  v_future_schedules_cancelled integer:=0;
  v_future_remuneration_cancelled integer:=0;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select *
    into v_employee
  from public.employees
  where id=p_employee_id
  for update;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;
  if p_end_date>private.organisation_business_date(v_employee.organisation_id) then
    raise exception 'future_exit_not_supported_v1';
  end if;
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
      private.organisation_business_date(v_employee.organisation_id),'Employment ended before requested absence',
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
      private.organisation_business_date(v_employee.organisation_id),'Employment ended before requested TOIL',v_user_id
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

  delete from public.employee_employment_conditions
  where employee_id=v_employee.id
    and effective_from>p_end_date;
  get diagnostics v_future_conditions_cancelled=row_count;

    update public.employee_employment_conditions
  set effective_to=p_end_date
  where employee_id=v_employee.id
    and effective_from<=p_end_date
    and (effective_to is null or effective_to>p_end_date);

  delete from public.employee_schedule_assignments
  where employee_id=v_employee.id
    and effective_from>p_end_date;
  get diagnostics v_future_schedules_cancelled=row_count;

    update public.employee_schedule_assignments
  set effective_to=p_end_date
  where employee_id=v_employee.id
    and effective_from<=p_end_date
    and (effective_to is null or effective_to>p_end_date);

  delete from public.employee_remuneration_history
  where employee_id=v_employee.id
    and effective_from>p_end_date;
  get diagnostics v_future_remuneration_cancelled=row_count;

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
      'future_conditions_cancelled',v_future_conditions_cancelled,
      'future_schedules_cancelled',v_future_schedules_cancelled,
      'future_remuneration_cancelled',v_future_remuneration_cancelled,
      'access_deactivated',v_employee.user_id is not null
    )
  );

  return jsonb_build_object(
    'employee_id',v_employee.id,
    'status','exited',
    'end_date',p_end_date,
    'leave_requests_closed',v_leave_closed,
    'toil_requests_closed',v_toil_closed,
    'future_conditions_cancelled',v_future_conditions_cancelled,
    'future_schedules_cancelled',v_future_schedules_cancelled,
    'future_remuneration_cancelled',v_future_remuneration_cancelled,
    'access_deactivated',v_employee.user_id is not null
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_employee_access_invitation(p_employee_id uuid, p_grant_manager_role boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_schedule_id uuid;
  v_token text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

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

  if v_employee.user_id is not null then
    raise exception 'employee_already_has_access';
  end if;

  select esa.work_schedule_id
    into v_schedule_id
  from public.employee_schedule_assignments esa
  where esa.employee_id = v_employee.id
    and esa.effective_from <= private.organisation_business_date(v_employee.organisation_id)
    and (esa.effective_to is null or esa.effective_to >= private.organisation_business_date(v_employee.organisation_id))
  order by esa.effective_from desc
  limit 1;

  update public.employee_invitations
  set expires_at = now()
  where employee_id = v_employee.id
    and accepted_at is null
    and expires_at > now();

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.employee_invitations(
    organisation_id, employee_id, email, first_name, last_name,
    employee_number, department_id, manager_employee_id, work_schedule_id,
    start_date, grant_manager_role, token_hash, created_by
  )
  values (
    v_employee.organisation_id, v_employee.id, v_employee.email,
    v_employee.first_name, v_employee.last_name, v_employee.employee_number,
    v_employee.department_id, v_employee.manager_employee_id, v_schedule_id,
    v_employee.start_date, p_grant_manager_role,
    digest(v_token, 'sha256'), v_user_id
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
$function$;

CREATE OR REPLACE FUNCTION public.set_employee_opening_balance(p_employee_id uuid, p_leave_type_code text, p_balance numeric, p_reason text DEFAULT 'Opening balance confirmed by administrator'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_leave_type_id uuid;
  v_entitlement_id uuid;
  v_current numeric(10,2);
  v_delta numeric(10,2);
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_balance < 0 then raise exception 'opening_balance_cannot_be_negative'; end if;

  select * into v_employee
  from public.employees
  where id = p_employee_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_employee.organisation_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  if exists (
    select 1
    from public.leave_requests r
    where r.employee_id = v_employee.id
  ) then
    raise exception 'opening_balance_locked_after_leave_activity';
  end if;

  select lt.id
    into v_leave_type_id
  from public.leave_types lt
  where lt.organisation_id = v_employee.organisation_id
    and lt.code = upper(btrim(p_leave_type_code))
    and lt.active
  limit 1;

  if v_leave_type_id is null then raise exception 'leave_type_not_found'; end if;

  select le.id
    into v_entitlement_id
  from public.leave_entitlements le
  where le.employee_id = v_employee.id
    and le.leave_type_id = v_leave_type_id
    and private.organisation_business_date(v_employee.organisation_id) between le.cycle_start and le.cycle_end
  order by le.cycle_start desc
  limit 1;

  if v_entitlement_id is null then
    perform private.provision_employee_entitlements(v_employee.id, v_user_id, '{}'::jsonb);

    select le.id
      into v_entitlement_id
    from public.leave_entitlements le
    where le.employee_id = v_employee.id
      and le.leave_type_id = v_leave_type_id
      and private.organisation_business_date(v_employee.organisation_id) between le.cycle_start and le.cycle_end
    order by le.cycle_start desc
    limit 1;
  end if;

  if v_entitlement_id is null then raise exception 'leave_entitlement_not_configured'; end if;

  select coalesce(sum(l.quantity),0)
    into v_current
  from public.leave_ledger_entries l
  where l.entitlement_id = v_entitlement_id;

  v_delta := p_balance - v_current;

  if v_delta <> 0 then
    insert into public.leave_ledger_entries(
      organisation_id,
      employee_id,
      leave_type_id,
      entitlement_id,
      entry_type,
      quantity,
      effective_date,
      reason,
      source_metadata,
      created_by
    )
    values (
      v_employee.organisation_id,
      v_employee.id,
      v_leave_type_id,
      v_entitlement_id,
      'manual_adjustment',
      v_delta,
      private.organisation_business_date(v_employee.organisation_id),
      coalesce(nullif(btrim(p_reason),''),'Opening balance confirmed by administrator'),
      jsonb_build_object(
        'adjustment_kind','opening_balance_reconciliation',
        'previous_balance',v_current,
        'target_balance',p_balance
      ),
      v_user_id
    );
  end if;

  insert into public.audit_events(
    organisation_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    payload
  )
  values (
    v_employee.organisation_id,
    v_user_id,
    'employee',
    v_employee.id,
    'leave.opening_balance.confirmed',
    jsonb_build_object(
      'leave_type_code', upper(btrim(p_leave_type_code)),
      'previous_balance', v_current,
      'target_balance', p_balance,
      'adjustment', v_delta
    )
  );

  return p_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_leave_request(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS leave_request_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.leave_requests%rowtype;
  v_entitlement_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select r.*
    into v_request
  from public.leave_requests r
  join public.employees e on e.id=r.employee_id
  join public.organisation_memberships m
    on m.organisation_id=e.organisation_id
   and m.user_id=e.user_id
   and m.is_active
  where r.id=p_request_id
    and e.user_id=v_user_id
    and e.employment_status='active'
  for update of r;

  if v_request.id is null then raise exception 'request_not_found_or_not_owned'; end if;
  if v_request.status not in ('submitted','pending_approval') then
    raise exception 'request_not_withdrawable';
  end if;

  select id
    into v_entitlement_id
  from public.leave_entitlements
  where organisation_id=v_request.organisation_id
    and employee_id=v_request.employee_id
    and leave_type_id=v_request.leave_type_id
    and v_request.start_date between cycle_start and cycle_end
  order by cycle_start desc
  limit 1;

  insert into public.leave_ledger_entries(
    organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
    entry_type,quantity,effective_date,reason,source_metadata,created_by
  ) values(
    v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,
    v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,
    private.organisation_business_date(v_request.organisation_id),'Withdrawn pending leave request',
    jsonb_build_object('previous_status',v_request.status),
    v_user_id
  );

  update public.leave_requests
  set status='withdrawn',updated_at=now()
  where id=v_request.id;

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(
    v_request.organisation_id,v_request.id,v_user_id,
    'withdrawn',nullif(btrim(p_note),'')
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'leave_request',v_request.id,
    'leave.request.withdrawn',
    jsonb_build_object('quantity_restored',v_request.quantity)
  );

  return 'withdrawn';
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_toil_request(p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.toil_requests%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select tr.*
    into v_request
  from public.toil_requests tr
  join public.employees e on e.id=tr.employee_id
  join public.organisation_memberships m
    on m.organisation_id=e.organisation_id
   and m.user_id=e.user_id
   and m.is_active
  where tr.id=p_request_id
    and e.user_id=v_user_id
    and e.employment_status='active'
  for update of tr;

  if v_request.id is null then raise exception 'request_not_found_or_not_owned'; end if;
  if v_request.status<>'pending_approval' then raise exception 'request_not_withdrawable'; end if;

  insert into public.toil_ledger_entries(
    organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
  ) values(
    v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,
    private.organisation_business_date(v_request.organisation_id),'Withdrawn TOIL request reservation',v_user_id
  );

  update public.toil_requests
  set status='withdrawn',updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'toil_request',v_request.id,
    'toil.request.withdrawn',jsonb_build_object('hours',v_request.hours)
  );

  return 'withdrawn';
end;
$function$;

CREATE OR REPLACE FUNCTION public.configure_annual_leave_policy_v2(p_annual_days numeric, p_cycle_basis text, p_fixed_cycle_start_month integer DEFAULT NULL::integer, p_fixed_cycle_start_day integer DEFAULT NULL::integer, p_effective_from date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.configure_annual_leave_policy_v2(
    p_annual_days,
    p_cycle_basis,
    p_fixed_cycle_start_month,
    p_fixed_cycle_start_day,
    p_effective_from
  );
$function$;