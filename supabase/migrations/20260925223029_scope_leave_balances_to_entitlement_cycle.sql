
drop view public.leave_balances;

create view public.leave_balances
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
  where current_date between le.cycle_start and le.cycle_end
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
  ce.organisation_id,
  ce.employee_id,
  ce.leave_type_id,
  ce.id,
  ce.cycle_start,
  ce.cycle_end;

grant select on public.leave_balances to authenticated;

CREATE OR REPLACE FUNCTION public.submit_leave_request_v2(p_leave_type_id uuid, p_start_date date, p_end_date date, p_note text DEFAULT NULL::text, p_day_fraction numeric DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_employee_id uuid;
  v_department_id uuid;
  v_policy_id uuid;
  v_entitlement_id uuid;
  v_request_id uuid;
  v_date date;
  v_hours numeric(5,2);
  v_quantity numeric(10,2):=0;
  v_balance numeric(10,2):=0;
  v_negative_allowed boolean:=false;
  v_is_holiday boolean;
  v_charge numeric(5,2);
  v_rule record;
  v_total_people integer;
  v_other_away integer;
  v_available_after integer;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_end_date<p_start_date then raise exception 'invalid_date_range'; end if;
  if p_day_fraction not in (0.5,1) then raise exception 'invalid_day_fraction'; end if;
  if p_day_fraction<>1 and p_start_date<>p_end_date then
    raise exception 'partial_day_requires_single_date';
  end if;

  select e.organisation_id,e.id
    into v_org_id,v_employee_id
  from public.employees e
  join public.organisation_memberships m
    on m.organisation_id=e.organisation_id
   and m.user_id=e.user_id
   and m.is_active
  where e.user_id=v_user_id
    and e.employment_status='active'
  order by e.created_at
  limit 1;

  if v_employee_id is null then raise exception 'employee_profile_required'; end if;

  if exists(
    select 1
    from public.leave_requests lr
    where lr.employee_id=v_employee_id
      and lr.status in ('submitted','pending_approval','approved','cancellation_requested')
      and daterange(lr.start_date,lr.end_date,'[]')
          && daterange(p_start_date,p_end_date,'[]')
  ) then
    raise exception 'overlapping_leave_request';
  end if;

  if exists(
    select 1
    from public.toil_requests tr
    where tr.employee_id=v_employee_id
      and tr.status in ('pending_approval','approved','cancellation_requested')
      and tr.leave_date between p_start_date and p_end_date
  ) then
    raise exception 'overlapping_toil_request';
  end if;

  if exists(
    select 1
    from public.blocked_periods bp
    where bp.organisation_id=v_org_id
      and bp.hard_block
      and daterange(bp.start_date,bp.end_date,'[]')
          && daterange(p_start_date,p_end_date,'[]')
      and (bp.leave_type_id is null or bp.leave_type_id=p_leave_type_id)
  ) then
    raise exception 'blocked_period';
  end if;

  if not exists(
    select 1
    from public.leave_types lt
    where lt.id=p_leave_type_id
      and lt.organisation_id=v_org_id
      and lt.active
  ) then
    raise exception 'leave_type_not_available';
  end if;

  select lpv.id,lpv.negative_balance_allowed
    into v_policy_id,v_negative_allowed
  from public.leave_policy_versions lpv
  where lpv.organisation_id=v_org_id
    and lpv.leave_type_id=p_leave_type_id
    and lpv.effective_from<=p_start_date
    and (lpv.effective_to is null or lpv.effective_to>=p_start_date)
  order by lpv.effective_from desc,lpv.version desc
  limit 1;

  if v_policy_id is null then raise exception 'leave_policy_not_configured'; end if;

  select lea.id
    into v_entitlement_id
  from public.leave_entitlements lea
  where lea.organisation_id=v_org_id
    and lea.employee_id=v_employee_id
    and lea.leave_type_id=p_leave_type_id
    and p_start_date between lea.cycle_start and lea.cycle_end
  order by lea.cycle_start desc
  limit 1;

  if v_entitlement_id is null then
    perform private.provision_employee_entitlements_for_date(
      v_employee_id,
      v_user_id,
      p_start_date,
      '{}'::jsonb
    );

    select lea.id
      into v_entitlement_id
    from public.leave_entitlements lea
    where lea.organisation_id=v_org_id
      and lea.employee_id=v_employee_id
      and lea.leave_type_id=p_leave_type_id
      and p_start_date between lea.cycle_start and lea.cycle_end
    order by lea.cycle_start desc
    limit 1;
  end if;

  if v_entitlement_id is null then
    raise exception 'leave_entitlement_not_configured';
  end if;

  if p_end_date > (
    select lea.cycle_end
    from public.leave_entitlements lea
    where lea.id=v_entitlement_id
  ) then
    raise exception 'request_spans_leave_cycles';
  end if;

  if private.scheduled_hours_for_employee(v_employee_id,p_start_date) is null then
    raise exception 'work_schedule_not_configured';
  end if;

  insert into public.leave_requests(
    organisation_id,employee_id,leave_type_id,policy_version_id,
    start_date,end_date,quantity,status,note,submitted_at
  ) values(
    v_org_id,v_employee_id,p_leave_type_id,v_policy_id,
    p_start_date,p_end_date,0,'pending_approval',nullif(btrim(p_note),''),now()
  )
  returning id into v_request_id;

  v_date:=p_start_date;
  while v_date<=p_end_date loop
    v_hours:=private.scheduled_hours_for_employee(v_employee_id,v_date);
    v_department_id:=private.employee_department_on_date(v_employee_id,v_date);

    select exists(
      select 1
      from public.public_holidays ph
      where ph.organisation_id=v_org_id
        and ph.holiday_date=v_date
    ) into v_is_holiday;

    if coalesce(v_hours,0)<=0 then
      insert into public.leave_request_days(
        organisation_id,request_id,leave_date,scheduled_hours,
        chargeable_quantity,exclusion_reason
      ) values(
        v_org_id,v_request_id,v_date,coalesce(v_hours,0),0,'non_working_day'
      );
    elsif v_is_holiday then
      insert into public.leave_request_days(
        organisation_id,request_id,leave_date,scheduled_hours,
        chargeable_quantity,exclusion_reason
      ) values(
        v_org_id,v_request_id,v_date,v_hours,0,'public_holiday'
      );
    else
      v_charge:=case when p_start_date=p_end_date then p_day_fraction else 1 end;

      insert into public.leave_request_days(
        organisation_id,request_id,leave_date,scheduled_hours,chargeable_quantity
      ) values(
        v_org_id,v_request_id,v_date,v_hours,v_charge
      );
      v_quantity:=v_quantity+v_charge;

      for v_rule in
        select cr.*
        from public.coverage_rules cr
        where cr.organisation_id=v_org_id
          and cr.active
          and (cr.department_id is null or cr.department_id=v_department_id)
      loop
        select count(*)::int
          into v_total_people
        from public.employees e
        where e.organisation_id=v_org_id
          and e.employment_status='active'
          and (
            v_rule.department_id is null
            or private.employee_department_on_date(e.id,v_date)=v_rule.department_id
          );

        v_other_away:=private.active_absence_count(
          v_org_id,
          v_date,
          v_rule.department_id,
          v_employee_id
        );

        v_available_after:=greatest(v_total_people-v_other_away-1,0);

        if v_available_after<v_rule.minimum_available
           and v_rule.severity='block' then
          raise exception 'coverage_rule_block';
        end if;

        insert into public.leave_request_coverage_checks(
          organisation_id,request_id,rule_id,leave_date,
          available_after_request,minimum_required,outcome
        ) values(
          v_org_id,v_request_id,v_rule.id,v_date,
          v_available_after,v_rule.minimum_available,
          case
            when v_available_after<v_rule.minimum_available then 'warning'
            else 'ok'
          end
        );
      end loop;
    end if;

    v_date:=v_date+1;
  end loop;

  if v_quantity<=0 then raise exception 'no_chargeable_working_days'; end if;

  select coalesce(sum(quantity),0)
    into v_balance
  from public.leave_ledger_entries
  where entitlement_id=v_entitlement_id;

  if not v_negative_allowed and v_balance<v_quantity then
    raise exception 'insufficient_leave_balance';
  end if;

  update public.leave_requests
  set quantity=v_quantity,updated_at=now()
  where id=v_request_id;

  insert into public.leave_ledger_entries(
    organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
    entry_type,quantity,effective_date,reason,source_metadata,created_by
  ) values(
    v_org_id,v_employee_id,p_leave_type_id,v_entitlement_id,v_request_id,
    'leave_reserved',-v_quantity,p_start_date,
    'Pending leave request reservation',
    jsonb_build_object(
      'request_status','pending_approval',
      'day_fraction',p_day_fraction
    ),
    v_user_id
  );

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(
    v_org_id,v_request_id,v_user_id,'submitted',null
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'leave_request',v_request_id,'leave.request.submitted',
    jsonb_build_object(
      'quantity',v_quantity,
      'start_date',p_start_date,
      'end_date',p_end_date,
      'day_fraction',p_day_fraction,
      'coverage_warnings',(
        select count(*)
        from public.leave_request_coverage_checks c
        where c.request_id=v_request_id
          and c.outcome='warning'
      ),
      'effective_condition_resolution',true,
      'toil_included_in_coverage',true
    )
  );

  return v_request_id;
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
    and current_date between le.cycle_start and le.cycle_end
  order by le.cycle_start desc
  limit 1;

  if v_entitlement_id is null then
    perform private.provision_employee_entitlements(v_employee.id, v_user_id, '{}'::jsonb);

    select le.id
      into v_entitlement_id
    from public.leave_entitlements le
    where le.employee_id = v_employee.id
      and le.leave_type_id = v_leave_type_id
      and current_date between le.cycle_start and le.cycle_end
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
      current_date,
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
