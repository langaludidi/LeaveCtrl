
update public.overtime_settings
set toil_expiry_days=null
where toil_expiry_days is not null;

create or replace function public.update_overtime_settings(
  p_default_treatment text,
  p_default_multiplier numeric,
  p_toil_expiry_days integer,
  p_liability_averaging_weeks integer,
  p_include_paid_overtime_in_liability boolean
)
returns void
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;
  if p_default_treatment not in ('paid','toil','choice') then
    raise exception 'invalid_overtime_treatment';
  end if;
  if p_default_multiplier<=0 then raise exception 'invalid_multiplier'; end if;
  if p_liability_averaging_weeks<1 or p_liability_averaging_weeks>52 then
    raise exception 'invalid_averaging_weeks';
  end if;
  if p_toil_expiry_days is not null then
    raise exception 'toil_expiry_not_enabled_v1';
  end if;

  insert into public.overtime_settings(
    organisation_id,default_treatment,default_multiplier,toil_expiry_days,
    liability_averaging_weeks,include_paid_overtime_in_liability,updated_by,updated_at
  ) values(
    v_org_id,p_default_treatment,p_default_multiplier,null,
    p_liability_averaging_weeks,p_include_paid_overtime_in_liability,v_user_id,now()
  )
  on conflict(organisation_id) do update set
    default_treatment=excluded.default_treatment,
    default_multiplier=excluded.default_multiplier,
    toil_expiry_days=null,
    liability_averaging_weeks=excluded.liability_averaging_weeks,
    include_paid_overtime_in_liability=excluded.include_paid_overtime_in_liability,
    updated_by=excluded.updated_by,
    updated_at=now();

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'overtime_settings',v_org_id,'overtime.settings.updated',
    jsonb_build_object(
      'default_treatment',p_default_treatment,
      'default_multiplier',p_default_multiplier,
      'toil_expiry_days',null,
      'liability_averaging_weeks',p_liability_averaging_weeks,
      'include_paid_overtime_in_liability',p_include_paid_overtime_in_liability
    )
  );
end;
$$;

create index if not exists blocked_periods_leave_type_idx
  on public.blocked_periods(leave_type_id);
create index if not exists blocked_periods_created_by_idx
  on public.blocked_periods(created_by);

create index if not exists coverage_rules_department_idx
  on public.coverage_rules(department_id);
create index if not exists coverage_rules_created_by_idx
  on public.coverage_rules(created_by);

create index if not exists coverage_checks_org_idx
  on public.leave_request_coverage_checks(organisation_id);
create index if not exists coverage_checks_rule_idx
  on public.leave_request_coverage_checks(rule_id);

create index if not exists employee_conditions_department_idx
  on public.employee_employment_conditions(department_id);
create index if not exists employee_conditions_manager_idx
  on public.employee_employment_conditions(manager_employee_id);
create index if not exists employee_conditions_schedule_idx
  on public.employee_employment_conditions(work_schedule_id);
create index if not exists employee_conditions_location_idx
  on public.employee_employment_conditions(location_id);
create index if not exists employee_conditions_created_by_idx
  on public.employee_employment_conditions(created_by);

create index if not exists remuneration_created_by_idx
  on public.employee_remuneration_history(created_by);

create index if not exists variable_earnings_source_overtime_idx
  on public.employee_variable_earnings(source_overtime_event_id);
create index if not exists variable_earnings_created_by_idx
  on public.employee_variable_earnings(created_by);

create index if not exists overtime_payments_org_idx
  on public.overtime_event_payments(organisation_id);
create index if not exists overtime_payments_employee_idx
  on public.overtime_event_payments(employee_id);

create index if not exists overtime_events_approved_by_idx
  on public.overtime_events(approved_by);
create index if not exists overtime_events_created_by_idx
  on public.overtime_events(created_by);

create index if not exists overtime_settings_updated_by_idx
  on public.overtime_settings(updated_by);

create index if not exists toil_ledger_org_idx
  on public.toil_ledger_entries(organisation_id);
create index if not exists toil_ledger_overtime_event_idx
  on public.toil_ledger_entries(overtime_event_id);
create index if not exists toil_ledger_created_by_idx
  on public.toil_ledger_entries(created_by);

create index if not exists toil_requests_decided_by_idx
  on public.toil_requests(decided_by);
