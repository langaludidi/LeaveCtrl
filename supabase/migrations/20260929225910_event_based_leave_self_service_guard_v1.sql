-- LeaveCtrl P0 release reconciliation: event-based leave must not be treated
-- as an ordinary running numerical balance in self-service submission.

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
  v_entitlement_method text;
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
  limit 1
  for update of e;

  if v_employee_id is null then raise exception 'employee_profile_required'; end if;

  if exists(
    select 1 from public.leave_requests lr
    where lr.employee_id=v_employee_id
      and lr.status in ('submitted','pending_approval','approved','cancellation_requested')
      and daterange(lr.start_date,lr.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then raise exception 'overlapping_leave_request'; end if;

  if exists(
    select 1 from public.toil_requests tr
    where tr.employee_id=v_employee_id
      and tr.status in ('pending_approval','approved','cancellation_requested')
      and tr.leave_date between p_start_date and p_end_date
  ) then raise exception 'overlapping_toil_request'; end if;

  if exists(
    select 1 from public.blocked_periods bp
    where bp.organisation_id=v_org_id
      and bp.hard_block
      and daterange(bp.start_date,bp.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
      and (bp.leave_type_id is null or bp.leave_type_id=p_leave_type_id)
  ) then raise exception 'blocked_period'; end if;

  if not exists(
    select 1 from public.leave_types lt
    where lt.id=p_leave_type_id and lt.organisation_id=v_org_id and lt.active
  ) then raise exception 'leave_type_not_available'; end if;

  select lpv.id,lpv.negative_balance_allowed,lpv.entitlement_method
    into v_policy_id,v_negative_allowed,v_entitlement_method
  from public.leave_policy_versions lpv
  where lpv.organisation_id=v_org_id
    and lpv.leave_type_id=p_leave_type_id
    and lpv.effective_from<=p_start_date
    and (lpv.effective_to is null or lpv.effective_to>=p_start_date)
  order by lpv.effective_from desc,lpv.version desc
  limit 1;

  if v_policy_id is null then raise exception 'leave_policy_not_configured'; end if;

  if v_entitlement_method='event_based' then
    raise exception 'event_based_eligibility_required';
  end if;

  perform private.provision_employee_entitlements_for_date(
    v_employee_id,v_user_id,p_start_date,'{}'::jsonb
  );

  select lea.id into v_entitlement_id
  from public.leave_entitlements lea
  where lea.organisation_id=v_org_id
    and lea.employee_id=v_employee_id
    and lea.leave_type_id=p_leave_type_id
    and p_start_date between lea.cycle_start and lea.cycle_end
  order by lea.cycle_start desc
  limit 1;

  if v_entitlement_id is null then raise exception 'leave_entitlement_not_configured'; end if;

  if p_end_date>(select cycle_end from public.leave_entitlements where id=v_entitlement_id) then
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
  ) returning id into v_request_id;

  v_date:=p_start_date;
  while v_date<=p_end_date loop
    v_hours:=private.scheduled_hours_for_employee(v_employee_id,v_date);
    v_department_id:=private.employee_department_on_date(v_employee_id,v_date);

    select exists(
      select 1 from public.public_holidays ph
      where ph.organisation_id=v_org_id and ph.holiday_date=v_date
    ) into v_is_holiday;

    if coalesce(v_hours,0)<=0 then
      insert into public.leave_request_days(
        organisation_id,request_id,leave_date,scheduled_hours,chargeable_quantity,exclusion_reason
      ) values(v_org_id,v_request_id,v_date,coalesce(v_hours,0),0,'non_working_day');
    elsif v_is_holiday then
      insert into public.leave_request_days(
        organisation_id,request_id,leave_date,scheduled_hours,chargeable_quantity,exclusion_reason
      ) values(v_org_id,v_request_id,v_date,v_hours,0,'public_holiday');
    else
      v_charge:=case when p_start_date=p_end_date then p_day_fraction else 1 end;

      insert into public.leave_request_days(
        organisation_id,request_id,leave_date,scheduled_hours,chargeable_quantity
      ) values(v_org_id,v_request_id,v_date,v_hours,v_charge);
      v_quantity:=v_quantity+v_charge;

      for v_rule in
        select cr.*
        from public.coverage_rules cr
        where cr.organisation_id=v_org_id
          and cr.active
          and (cr.department_id is null or cr.department_id=v_department_id)
      loop
        select count(*)::int into v_total_people
        from public.employees e
        where e.organisation_id=v_org_id
          and e.employment_status='active'
          and (v_rule.department_id is null
               or private.employee_department_on_date(e.id,v_date)=v_rule.department_id);

        v_other_away:=private.active_absence_count(
          v_org_id,v_date,v_rule.department_id,v_employee_id
        );
        v_available_after:=greatest(v_total_people-v_other_away-1,0);

        if v_available_after<v_rule.minimum_available and v_rule.severity='block' then
          raise exception 'coverage_rule_block';
        end if;

        insert into public.leave_request_coverage_checks(
          organisation_id,request_id,rule_id,leave_date,
          available_after_request,minimum_required,outcome
        ) values(
          v_org_id,v_request_id,v_rule.id,v_date,
          v_available_after,v_rule.minimum_available,
          case when v_available_after<v_rule.minimum_available then 'warning' else 'ok' end
        );
      end loop;
    end if;
    v_date:=v_date+1;
  end loop;

  if v_quantity<=0 then raise exception 'no_chargeable_working_days'; end if;

  if v_entitlement_method<>'no_balance' then
    select coalesce(sum(quantity),0) into v_balance
    from public.leave_ledger_entries
    where entitlement_id=v_entitlement_id;

    if not v_negative_allowed and v_balance<v_quantity then
      raise exception 'insufficient_leave_balance';
    end if;
  end if;

  update public.leave_requests set quantity=v_quantity,updated_at=now()
  where id=v_request_id;

  if v_entitlement_method<>'no_balance' then
    insert into public.leave_ledger_entries(
      organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
      entry_type,quantity,effective_date,reason,source_metadata,created_by
    ) values(
      v_org_id,v_employee_id,p_leave_type_id,v_entitlement_id,v_request_id,
      'leave_reserved',-v_quantity,p_start_date,'Pending leave request reservation',
      jsonb_build_object('request_status','pending_approval','day_fraction',p_day_fraction),
      v_user_id
    );
  end if;

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(v_org_id,v_request_id,v_user_id,'submitted',null);

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'leave_request',v_request_id,'leave.request.submitted',
    jsonb_build_object(
      'quantity',v_quantity,'start_date',p_start_date,'end_date',p_end_date,
      'day_fraction',p_day_fraction,'entitlement_method',v_entitlement_method,
      'coverage_warnings',(select count(*) from public.leave_request_coverage_checks c
                           where c.request_id=v_request_id and c.outcome='warning'),
      'effective_condition_resolution',true,'toil_included_in_coverage',true
    )
  );

  return v_request_id;
end;
$function$;

create or replace function public.preview_leave_request_v1(
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_day_fraction numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
  v_quantity numeric(10,2);
  v_leave_type_name text;
  v_leave_unit text;
  v_entitlement_method text;
  v_entitlement_id uuid;
  v_balance_after numeric(10,2);
  v_balance_before numeric(10,2);
  v_warning_count integer := 0;
  v_warning_dates jsonb := '[]'::jsonb;
  v_result jsonb;
  v_error text;
  v_policy_outcome text;
  v_entitlement_outcome text;
  v_coverage_outcome text;
  v_message text;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'blocker_code', 'authentication_required',
      'message', 'Sign in again before checking this request.'
    );
  end if;

  begin
    v_request_id := public.submit_leave_request_v2(
      p_leave_type_id,
      p_start_date,
      p_end_date,
      null,
      p_day_fraction
    );

    select lr.quantity, lt.name, lt.unit, lpv.entitlement_method
      into v_quantity, v_leave_type_name, v_leave_unit, v_entitlement_method
    from public.leave_requests lr
    join public.leave_types lt on lt.id = lr.leave_type_id
    join public.leave_policy_versions lpv on lpv.id = lr.policy_version_id
    where lr.id = v_request_id;

    select le.entitlement_id
      into v_entitlement_id
    from public.leave_ledger_entries le
    where le.request_id = v_request_id
      and le.entry_type = 'leave_reserved'
    order by le.created_at desc
    limit 1;

    if v_entitlement_id is not null then
      select coalesce(sum(le.quantity),0)
        into v_balance_after
      from public.leave_ledger_entries le
      where le.entitlement_id = v_entitlement_id;
      v_balance_before := v_balance_after + v_quantity;
    end if;

    select count(*)::int,
      coalesce(jsonb_agg(to_char(w.leave_date,'YYYY-MM-DD') order by w.leave_date),'[]'::jsonb)
      into v_warning_count, v_warning_dates
    from (
      select distinct c.leave_date
      from public.leave_request_coverage_checks c
      where c.request_id = v_request_id
        and c.outcome = 'warning'
      order by c.leave_date
    ) w;

    v_result := jsonb_build_object(
      'ok', true,
      'blocker_code', null,
      'message', 'Request can be submitted.',
      'request', jsonb_build_object(
        'leave_type', v_leave_type_name,
        'unit', v_leave_unit,
        'quantity', v_quantity,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'day_fraction', p_day_fraction
      ),
      'entitlement', jsonb_build_object(
        'outcome', case when v_entitlement_method = 'no_balance' then 'not_applicable' else 'ok' end,
        'available_before', v_balance_before,
        'balance_after', v_balance_after,
        'message', case
          when v_entitlement_method = 'no_balance' then 'This leave type is not governed by a running balance.'
          else 'Available entitlement is sufficient for this request.'
        end
      ),
      'policy', jsonb_build_object(
        'outcome', 'ok',
        'message', 'Request permitted under the applicable policy.'
      ),
      'coverage', jsonb_build_object(
        'outcome', case when v_warning_count > 0 then 'warning' else 'ok' end,
        'warning_count', v_warning_count,
        'warning_dates', v_warning_dates,
        'message', case
          when v_warning_count > 0 then 'Team coverage falls below a preferred level on one or more selected dates, but submission is still permitted.'
          else 'Team coverage remains acceptable for the selected dates.'
        end
      )
    );

    raise exception '__leave_preview_complete__';
  exception when others then
    v_error := sqlerrm;

    if v_error = '__leave_preview_complete__' then
      return v_result;
    end if;

    v_policy_outcome := case
      when v_error in ('insufficient_leave_balance','coverage_rule_block') then 'ok'
      else 'blocked'
    end;
    v_entitlement_outcome := case
      when v_error = 'insufficient_leave_balance' then 'blocked'
      else 'not_evaluated'
    end;
    v_coverage_outcome := case
      when v_error = 'coverage_rule_block' then 'blocked'
      else 'not_evaluated'
    end;

    v_message := case v_error
      when 'insufficient_leave_balance' then 'Available entitlement is not sufficient for this request.'
      when 'event_based_eligibility_required' then 'This leave type requires an event-based eligibility check before a leave request can be created.'
      when 'coverage_rule_block' then 'This request would breach a mandatory minimum staffing rule.'
      when 'overlapping_leave_request' then 'You already have leave covering part of these dates.'
      when 'overlapping_toil_request' then 'You already have TOIL covering part of these dates.'
      when 'blocked_period' then 'These dates include a period where this leave cannot be booked.'
      when 'no_chargeable_working_days' then 'The selected dates do not contain a chargeable working day.'
      when 'leave_policy_not_configured' then 'The applicable leave policy is not fully configured.'
      when 'leave_entitlement_not_configured' then 'Your entitlement for this leave type is not configured.'
      when 'partial_day_requires_single_date' then 'Half-day leave can only be requested for one date.'
      when 'request_spans_leave_cycles' then 'This request crosses two leave cycles and must be split.'
      when 'work_schedule_not_configured' then 'Your work schedule must be configured before this request can be evaluated.'
      when 'leave_type_not_available' then 'This leave type is not currently available.'
      when 'invalid_date_range' then 'The end date must be on or after the start date.'
      when 'invalid_day_fraction' then 'The selected partial-day value is not supported.'
      else 'This request cannot be submitted in its current form.'
    end;

    return jsonb_build_object(
      'ok', false,
      'blocker_code', v_error,
      'message', v_message,
      'request', jsonb_build_object(
        'start_date', p_start_date,
        'end_date', p_end_date,
        'day_fraction', p_day_fraction
      ),
      'entitlement', jsonb_build_object(
        'outcome', v_entitlement_outcome,
        'available_before', null,
        'balance_after', null,
        'message', case
          when v_entitlement_outcome = 'blocked' then v_message
          else 'Not evaluated because another rule stopped the request.'
        end
      ),
      'policy', jsonb_build_object(
        'outcome', v_policy_outcome,
        'message', case
          when v_policy_outcome = 'blocked' then v_message
          else 'Policy checks passed before the blocker was reached.'
        end
      ),
      'coverage', jsonb_build_object(
        'outcome', v_coverage_outcome,
        'warning_count', 0,
        'warning_dates', '[]'::jsonb,
        'message', case
          when v_coverage_outcome = 'blocked' then v_message
          else 'Not evaluated because another rule stopped the request.'
        end
      )
    );
  end;
end;
$function$;

revoke all on function public.preview_leave_request_v1(uuid,date,date,numeric) from public, anon;
grant execute on function public.preview_leave_request_v1(uuid,date,date,numeric) to authenticated;
