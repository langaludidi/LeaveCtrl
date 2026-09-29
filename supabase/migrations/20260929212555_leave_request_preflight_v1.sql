-- LeaveCtrl V1: authoritative pre-submission leave evaluation.
-- Uses the real submission transaction inside a rollback-scoped PL/pgSQL subtransaction
-- so preview logic cannot drift from the governed request engine.

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
