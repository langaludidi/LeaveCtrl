-- LeaveCtrl V1: South African statutory leave engines and governed allocation.
-- Applied to Supabase migration history as 20260929172833_za_statutory_leave_engines_v1.

CREATE OR REPLACE FUNCTION private.scheduled_workdays_in_range(p_employee_id uuid, p_start_date date, p_end_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select count(*)::numeric
  from generate_series(p_start_date,p_end_date,interval '1 day') g(day_value)
  where coalesce(private.scheduled_hours_for_employee(p_employee_id,g.day_value::date),0)>0;
$function$;

CREATE OR REPLACE FUNCTION private.scheduled_hours_in_range(p_employee_id uuid, p_start_date date, p_end_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select coalesce(sum(private.scheduled_hours_for_employee(p_employee_id,g.day_value::date)),0)::numeric
  from generate_series(p_start_date,p_end_date,interval '1 day') g(day_value);
$function$;

CREATE OR REPLACE FUNCTION private.resolve_leave_cycle(p_employee_id uuid, p_policy_id uuid, p_reference_date date)
 RETURNS TABLE(cycle_start date, cycle_end date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_employee public.employees%rowtype;
  v_policy public.leave_policy_versions%rowtype;
  v_anchor date;
  v_next date;
  v_month integer;
  v_day integer;
  v_year integer;
  v_cycle_months integer;
begin
  select * into v_employee from public.employees where id=p_employee_id;
  select * into v_policy from public.leave_policy_versions where id=p_policy_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;
  if v_policy.id is null then raise exception 'policy_not_found'; end if;
  if v_employee.organisation_id<>v_policy.organisation_id then
    raise exception 'policy_employee_org_mismatch';
  end if;

  v_cycle_months:=greatest(coalesce(v_policy.cycle_months,12),1);

  if v_policy.cycle_basis='employment_anniversary' then
    v_anchor:=v_employee.start_date;
  else
    v_month:=coalesce(v_policy.cycle_anchor_month,extract(month from v_policy.effective_from)::integer);
    v_day:=coalesce(v_policy.cycle_anchor_day,extract(day from v_policy.effective_from)::integer);
    v_year:=extract(year from v_policy.effective_from)::integer;
    v_anchor:=private.safe_cycle_date(v_year,v_month,v_day);
    if v_anchor>v_policy.effective_from then
      v_anchor:=private.safe_cycle_date(v_year-1,v_month,v_day);
    end if;
  end if;

  while (v_anchor + make_interval(months=>v_cycle_months))::date<=p_reference_date loop
    v_next:=(v_anchor + make_interval(months=>v_cycle_months))::date;
    exit when v_next<=v_anchor;
    v_anchor:=v_next;
  end loop;

  while v_anchor>p_reference_date loop
    v_next:=(v_anchor - make_interval(months=>v_cycle_months))::date;
    exit when v_next>=v_anchor;
    v_anchor:=v_next;
  end loop;

  if v_policy.cycle_basis='employment_anniversary' and v_anchor<v_employee.start_date then
    v_anchor:=v_employee.start_date;
  end if;

  cycle_start:=v_anchor;
  cycle_end:=(v_anchor + make_interval(months=>v_cycle_months) - interval '1 day')::date;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION private.calculate_leave_entitlement_target(p_employee_id uuid, p_policy_id uuid, p_reference_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_employee public.employees%rowtype;
  v_policy public.leave_policy_versions%rowtype;
  v_code text;
  v_cycle_start date;
  v_cycle_end date;
  v_days numeric:=0;
  v_hours numeric:=0;
  v_target numeric:=0;
begin
  select * into v_employee from public.employees where id=p_employee_id;
  select * into v_policy from public.leave_policy_versions where id=p_policy_id;
  select code into v_code from public.leave_types where id=v_policy.leave_type_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;
  if v_policy.id is null then raise exception 'policy_not_found'; end if;

  select c.cycle_start,c.cycle_end
    into v_cycle_start,v_cycle_end
  from private.resolve_leave_cycle(p_employee_id,p_policy_id,p_reference_date) c;

  case v_policy.entitlement_method
    when 'fixed_days' then
      v_target:=coalesce(v_policy.entitlement_amount,0);

    when 'statutory_annual_schedule_floor' then
      v_days:=private.scheduled_workdays_in_range(
        p_employee_id,
        v_cycle_start,
        v_cycle_start+20
      );
      v_target:=greatest(coalesce(v_policy.entitlement_amount,0),v_days);

    when 'statutory_sick' then
      if p_reference_date < (v_employee.start_date + interval '6 months')::date then
        v_days:=private.scheduled_workdays_in_range(
          p_employee_id,
          v_employee.start_date,
          p_reference_date
        );
        v_target:=floor(v_days/26);
      else
        v_target:=private.scheduled_workdays_in_range(
          p_employee_id,
          v_cycle_start,
          v_cycle_start+41
        );
      end if;

    when 'statutory_family_responsibility' then
      if p_reference_date >= (v_employee.start_date + interval '4 months')::date then
        v_days:=private.scheduled_workdays_in_range(
          p_employee_id,
          p_reference_date-27,
          p_reference_date
        );
        v_hours:=private.scheduled_hours_in_range(
          p_employee_id,
          p_reference_date-27,
          p_reference_date
        );
        if v_days>=16 and v_hours>=24 then
          v_target:=3;
        end if;
      end if;

    when 'manual_allocation' then
      v_target:=0;

    when 'no_balance' then
      v_target:=0;

    else
      v_target:=coalesce(v_policy.entitlement_amount,0);
  end case;

  return greatest(coalesce(v_target,0),0);
end;
$function$;

CREATE OR REPLACE FUNCTION private.provision_employee_entitlements_for_date(p_employee_id uuid, p_actor_user_id uuid, p_reference_date date, p_opening_balances jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_employee public.employees%rowtype;
  v_policy record;
  v_reference_date date;
  v_cycle_start date;
  v_cycle_end date;
  v_entitlement_id uuid;
  v_previous_entitlement_id uuid;
  v_quantity numeric(10,2);
  v_current_granted numeric(10,2);
  v_delta numeric(10,2);
  v_previous_balance numeric(10,2);
  v_carry numeric(10,2);
  v_explicit boolean;
  v_results jsonb:='[]'::jsonb;
  v_source text;
begin
  select * into v_employee
  from public.employees
  where id=p_employee_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;

  v_reference_date:=greatest(p_reference_date,v_employee.start_date);

  for v_policy in
    select distinct on (lpv.leave_type_id)
      lpv.*,
      lt.code as leave_type_code,
      lt.name as leave_type_name
    from public.leave_policy_versions lpv
    join public.leave_types lt
      on lt.id=lpv.leave_type_id
     and lt.active
    where lpv.organisation_id=v_employee.organisation_id
      and lpv.effective_from<=v_reference_date
      and (lpv.effective_to is null or lpv.effective_to>=v_reference_date)
    order by lpv.leave_type_id,lpv.effective_from desc,lpv.version desc
  loop
    select c.cycle_start,c.cycle_end
      into v_cycle_start,v_cycle_end
    from private.resolve_leave_cycle(
      v_employee.id,
      v_policy.id,
      v_reference_date
    ) c;

    v_explicit:=p_opening_balances ? v_policy.leave_type_code;

    if v_explicit then
      begin
        v_quantity:=(p_opening_balances->>v_policy.leave_type_code)::numeric;
      exception when others then
        raise exception 'invalid_opening_balance_%',v_policy.leave_type_code;
      end;
      v_source:='admin_opening_balance';
    else
      v_quantity:=private.calculate_leave_entitlement_target(
        v_employee.id,
        v_policy.id,
        v_reference_date
      );
      v_source:=case
        when v_policy.entitlement_method like 'statutory_%' then 'statutory_rule'
        when v_policy.entitlement_method='manual_allocation' then 'manual_allocation_required'
        when v_policy.entitlement_method='no_balance' then 'no_balance_required'
        else 'policy_default'
      end;
    end if;

    insert into public.leave_entitlements(
      organisation_id,employee_id,leave_type_id,policy_version_id,
      cycle_start,cycle_end,opening_entitlement
    ) values(
      v_employee.organisation_id,v_employee.id,v_policy.leave_type_id,v_policy.id,
      v_cycle_start,v_cycle_end,v_quantity
    )
    on conflict(employee_id,leave_type_id,cycle_start)
    do update set
      cycle_end=excluded.cycle_end,
      policy_version_id=excluded.policy_version_id
    returning id into v_entitlement_id;

    select coalesce(sum(l.quantity),0)
      into v_current_granted
    from public.leave_ledger_entries l
    where l.entitlement_id=v_entitlement_id
      and l.entry_type in ('entitlement_granted','accrual','migration_opening_balance');

    v_delta:=v_quantity-v_current_granted;

    if v_delta>0 then
      insert into public.leave_ledger_entries(
        organisation_id,employee_id,leave_type_id,entitlement_id,
        entry_type,quantity,effective_date,reason,source_metadata,created_by
      ) values(
        v_employee.organisation_id,v_employee.id,v_policy.leave_type_id,
        v_entitlement_id,
        case
          when v_explicit then 'migration_opening_balance'::public.ledger_entry_type
          when v_policy.entitlement_method='statutory_sick'
               and v_reference_date<(v_employee.start_date+interval '6 months')::date
            then 'accrual'::public.ledger_entry_type
          else 'entitlement_granted'::public.ledger_entry_type
        end,
        v_delta,
        greatest(v_employee.start_date,v_cycle_start,v_policy.effective_from),
        case
          when v_explicit then 'Administrator-confirmed opening balance'
          when v_policy.entitlement_method='statutory_sick'
               and v_reference_date<(v_employee.start_date+interval '6 months')::date
            then 'Statutory sick leave accrued during first six months'
          when v_policy.entitlement_method like 'statutory_%'
            then 'Statutory leave entitlement provisioned'
          else 'Policy entitlement provisioned'
        end,
        jsonb_build_object(
          'source',v_source,
          'policy_version_id',v_policy.id,
          'leave_type_code',v_policy.leave_type_code,
          'entitlement_method',v_policy.entitlement_method,
          'target_entitlement',v_quantity,
          'cycle_basis',v_policy.cycle_basis,
          'cycle_start',v_cycle_start,
          'cycle_end',v_cycle_end
        ),
        p_actor_user_id
      );
    end if;

    if v_policy.leave_type_code='ANNUAL'
       and not exists(
         select 1
         from public.leave_ledger_entries l
         where l.entitlement_id=v_entitlement_id
           and l.entry_type='carry_over'
       ) then
      select le.id
        into v_previous_entitlement_id
      from public.leave_entitlements le
      where le.employee_id=v_employee.id
        and le.leave_type_id=v_policy.leave_type_id
        and le.cycle_end<v_cycle_start
      order by le.cycle_end desc
      limit 1;

      if v_previous_entitlement_id is not null then
        select coalesce(sum(l.quantity),0)
          into v_previous_balance
        from public.leave_ledger_entries l
        where l.entitlement_id=v_previous_entitlement_id;

        if v_previous_balance>0 then
          v_carry:=case
            when v_policy.carry_over_cap is null then v_previous_balance
            else least(v_previous_balance,v_policy.carry_over_cap)
          end;

          if v_carry>0 then
            insert into public.leave_ledger_entries(
              organisation_id,employee_id,leave_type_id,entitlement_id,
              entry_type,quantity,effective_date,reason,source_metadata,created_by
            ) values(
              v_employee.organisation_id,v_employee.id,v_policy.leave_type_id,
              v_entitlement_id,'carry_over',v_carry,v_cycle_start,
              'Unused annual leave carried into the new cycle',
              jsonb_build_object(
                'source_entitlement_id',v_previous_entitlement_id,
                'previous_balance',v_previous_balance,
                'carry_over_cap',v_policy.carry_over_cap,
                'statutory_safeguard',true
              ),
              p_actor_user_id
            );
          end if;
        end if;
      end if;
    end if;

    v_results:=v_results||jsonb_build_array(
      jsonb_build_object(
        'leave_type_code',v_policy.leave_type_code,
        'entitlement_id',v_entitlement_id,
        'cycle_start',v_cycle_start,
        'cycle_end',v_cycle_end,
        'target_entitlement',v_quantity,
        'cycle_basis',v_policy.cycle_basis,
        'entitlement_method',v_policy.entitlement_method,
        'source',v_source
      )
    );
  end loop;

  return v_results;
end;
$function$;

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
  if p_annual_days<=0 or p_annual_days>366 then raise exception 'invalid_annual_days'; end if;
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
    organisation_id,code,name,unit,is_statutory,requires_approval,
    requires_evidence,colour_token,active
  ) values(
    v_org_id,'ANNUAL','Annual Leave','days',true,true,false,'teal',true
  )
  on conflict(organisation_id,code)
  do update set
    name=excluded.name,
    unit=excluded.unit,
    is_statutory=true,
    requires_approval=true,
    active=true
  returning id into v_leave_type_id;

  select * into v_previous
  from public.leave_policy_versions
  where organisation_id=v_org_id
    and leave_type_id=v_leave_type_id
    and effective_from<=p_effective_from
    and (effective_to is null or effective_to>=p_effective_from)
  order by effective_from desc,version desc
  limit 1
  for update;

  select coalesce(max(version),0)+1 into v_next_version
  from public.leave_policy_versions
  where organisation_id=v_org_id
    and leave_type_id=v_leave_type_id;

  if v_previous.id is not null
     and v_previous.effective_from=p_effective_from
     and not exists(
       select 1 from public.leave_requests r
       where r.policy_version_id=v_previous.id
     ) then
    update public.leave_policy_versions
    set entitlement_method='statutory_annual_schedule_floor',
        entitlement_amount=p_annual_days,
        cycle_months=12,
        cycle_basis=p_cycle_basis,
        cycle_anchor_month=case
          when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_month
          else null
        end,
        cycle_anchor_day=case
          when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_day
          else null
        end,
        negative_balance_allowed=false,
        statutory_source=coalesce(statutory_source,'{}'::jsonb) ||
          jsonb_build_object(
            'jurisdiction','ZA',
            'legal_reference','BCEA section 20',
            'calculation','schedule_aware_statutory_floor',
            'minimum_consecutive_days',21,
            'alternative_ratio_days',17,
            'alternative_ratio_hours',17,
            'public_holiday_cannot_count_as_annual_leave',true,
            'official_source','https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Annual-Leave.aspx'
          ),
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
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source
    ) values(
      v_org_id,v_leave_type_id,v_next_version,p_effective_from,null,
      'statutory_annual_schedule_floor',p_annual_days,12,
      p_cycle_basis,
      case when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_month else null end,
      case when p_cycle_basis='organisation_fixed' then p_fixed_cycle_start_day else null end,
      false,
      '{}'::jsonb,
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object(
        'status','employer_configured',
        'jurisdiction','ZA',
        'legal_reference','BCEA section 20',
        'calculation','schedule_aware_statutory_floor',
        'minimum_consecutive_days',21,
        'alternative_ratio_days',17,
        'alternative_ratio_hours',17,
        'public_holiday_cannot_count_as_annual_leave',true,
        'official_source','https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Annual-Leave.aspx'
      )
    )
    returning id into v_policy_id;
  end if;

  for v_employee in
    select e.id
    from public.employees e
    where e.organisation_id=v_org_id
      and e.employment_status='active'
  loop
    perform private.provision_employee_entitlements_for_date(
      v_employee.id,
      v_user_id,
      p_effective_from,
      '{}'::jsonb
    );
  end loop;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'leave_policy_version',v_policy_id,
    'leave.policy.configured',
    jsonb_build_object(
      'annual_days',p_annual_days,
      'statutory_floor_enforced',true,
      'cycle_basis',p_cycle_basis,
      'fixed_cycle_start_month',p_fixed_cycle_start_month,
      'fixed_cycle_start_day',p_fixed_cycle_start_day,
      'effective_from',p_effective_from
    )
  );

  return v_policy_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.ensure_za_leave_baseline(p_org_id uuid, p_effective_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_org public.organisations%rowtype;
  v_effective_date date;
  v_type_id uuid;
  v_current public.leave_policy_versions%rowtype;
  v_next_version integer;
  v_result jsonb:='[]'::jsonb;
begin
  select * into v_org from public.organisations where id=p_org_id;
  if v_org.id is null then raise exception 'organisation_not_found'; end if;
  if v_org.country_code<>'ZA' then return v_result; end if;

  v_effective_date:=coalesce(p_effective_date,private.organisation_business_date(v_org.id));

  insert into public.leave_types(
    organisation_id,code,name,unit,is_statutory,requires_approval,
    requires_evidence,colour_token,active
  ) values
    (v_org.id,'ANNUAL','Annual Leave','days',true,true,false,'teal',true),
    (v_org.id,'SICK','Sick Leave','days',true,true,false,'blue',true),
    (v_org.id,'FAMILY_RESPONSIBILITY','Family Responsibility Leave','days',true,true,false,'amber',true),
    (v_org.id,'PARENTAL_INTERIM','Parental Leave','days',true,true,true,'purple',true),
    (v_org.id,'UNPAID','Unpaid Leave','days',false,true,false,'rose',true)
  on conflict(organisation_id,code)
  do update set
    name=excluded.name,
    unit=excluded.unit,
    is_statutory=excluded.is_statutory,
    requires_approval=excluded.requires_approval,
    requires_evidence=excluded.requires_evidence,
    colour_token=excluded.colour_token,
    active=true;

  select id into v_type_id
  from public.leave_types
  where organisation_id=v_org.id and code='ANNUAL';

  select * into v_current
  from public.leave_policy_versions
  where organisation_id=v_org.id
    and leave_type_id=v_type_id
    and effective_from<=v_effective_date
    and (effective_to is null or effective_to>=v_effective_date)
  order by effective_from desc,version desc
  limit 1
  for update;

  if v_current.id is null then
    select coalesce(max(version),0)+1 into v_next_version
    from public.leave_policy_versions
    where organisation_id=v_org.id and leave_type_id=v_type_id;

    insert into public.leave_policy_versions(
      organisation_id,leave_type_id,version,effective_from,
      entitlement_method,entitlement_amount,cycle_months,
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source,
      cycle_basis
    ) values(
      v_org.id,v_type_id,v_next_version,v_effective_date,
      'statutory_annual_schedule_floor',15,12,false,'{}'::jsonb,
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object(
        'jurisdiction','ZA','legal_reference','BCEA section 20',
        'calculation','schedule_aware_statutory_floor',
        'minimum_consecutive_days',21,'alternative_ratio_days',17,
        'alternative_ratio_hours',17,
        'public_holiday_cannot_count_as_annual_leave',true,
        'official_source','https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Annual-Leave.aspx'
      ),
      'employment_anniversary'
    );
  elsif v_current.entitlement_method<>'statutory_annual_schedule_floor' then
    select coalesce(max(version),0)+1 into v_next_version
    from public.leave_policy_versions
    where organisation_id=v_org.id and leave_type_id=v_type_id;

    if v_current.effective_from<v_effective_date then
      update public.leave_policy_versions
      set effective_to=v_effective_date-1
      where id=v_current.id;

      insert into public.leave_policy_versions(
        organisation_id,leave_type_id,version,effective_from,
        entitlement_method,entitlement_amount,cycle_months,carry_over_cap,
        carry_over_expiry_date_rule,negative_balance_allowed,
        evidence_rule,approval_rule,statutory_source,
        cycle_basis,cycle_anchor_month,cycle_anchor_day
      ) values(
        v_org.id,v_type_id,v_next_version,v_effective_date,
        'statutory_annual_schedule_floor',
        coalesce(v_current.entitlement_amount,15),
        coalesce(v_current.cycle_months,12),
        v_current.carry_over_cap,
        v_current.carry_over_expiry_date_rule,
        false,
        coalesce(v_current.evidence_rule,'{}'::jsonb),
        coalesce(v_current.approval_rule,'{"mode":"manager"}'::jsonb),
        coalesce(v_current.statutory_source,'{}'::jsonb) ||
          jsonb_build_object(
            'jurisdiction','ZA','legal_reference','BCEA section 20',
            'calculation','schedule_aware_statutory_floor',
            'minimum_consecutive_days',21,'alternative_ratio_days',17,
            'alternative_ratio_hours',17,
            'public_holiday_cannot_count_as_annual_leave',true,
            'official_source','https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Annual-Leave.aspx'
          ),
        v_current.cycle_basis,
        v_current.cycle_anchor_month,
        v_current.cycle_anchor_day
      );
    else
      update public.leave_policy_versions
      set entitlement_method='statutory_annual_schedule_floor',
          entitlement_amount=coalesce(entitlement_amount,15),
          statutory_source=coalesce(statutory_source,'{}'::jsonb) ||
            jsonb_build_object(
              'jurisdiction','ZA','legal_reference','BCEA section 20',
              'calculation','schedule_aware_statutory_floor',
              'minimum_consecutive_days',21,'alternative_ratio_days',17,
              'alternative_ratio_hours',17,
              'public_holiday_cannot_count_as_annual_leave',true,
              'official_source','https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Annual-Leave.aspx'
            )
      where id=v_current.id;
    end if;
  end if;

  select id into v_type_id from public.leave_types
  where organisation_id=v_org.id and code='SICK';
  if not exists(
    select 1 from public.leave_policy_versions
    where organisation_id=v_org.id and leave_type_id=v_type_id
      and effective_from<=v_effective_date
      and (effective_to is null or effective_to>=v_effective_date)
  ) then
    select coalesce(max(version),0)+1 into v_next_version
    from public.leave_policy_versions where organisation_id=v_org.id and leave_type_id=v_type_id;
    insert into public.leave_policy_versions(
      organisation_id,leave_type_id,version,effective_from,
      entitlement_method,entitlement_amount,cycle_months,carry_over_cap,
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source,cycle_basis
    ) values(
      v_org.id,v_type_id,v_next_version,v_effective_date,
      'statutory_sick',null,36,0,false,
      jsonb_build_object(
        'medical_certificate_after_consecutive_days',2,
        'medical_certificate_after_absences_in_eight_weeks',2,
        'first_six_months_days_worked_ratio',26
      ),
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object(
        'jurisdiction','ZA','legal_reference','BCEA sections 22 and 23',
        'full_cycle_weeks',6,'cycle_months',36,
        'first_six_months_days_worked_ratio',26,
        'official_source','https://www.labour.gov.za/DocumentCenter/Pages/Basic-Guide-to-Sick-Leave.aspx',
        'calculation_assumption','scheduled working days are used as the current operational proxy for days worked until attendance integration is available'
      ),
      'employment_anniversary'
    );
  end if;

  select id into v_type_id from public.leave_types
  where organisation_id=v_org.id and code='FAMILY_RESPONSIBILITY';
  if not exists(
    select 1 from public.leave_policy_versions
    where organisation_id=v_org.id and leave_type_id=v_type_id
      and effective_from<=v_effective_date
      and (effective_to is null or effective_to>=v_effective_date)
  ) then
    select coalesce(max(version),0)+1 into v_next_version
    from public.leave_policy_versions where organisation_id=v_org.id and leave_type_id=v_type_id;
    insert into public.leave_policy_versions(
      organisation_id,leave_type_id,version,effective_from,
      entitlement_method,entitlement_amount,cycle_months,carry_over_cap,
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source,cycle_basis
    ) values(
      v_org.id,v_type_id,v_next_version,v_effective_date,
      'statutory_family_responsibility',3,12,0,false,
      '{"reasonable_proof_may_be_required":true}'::jsonb,
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object(
        'jurisdiction','ZA','legal_reference','BCEA section 27',
        'days_per_annual_cycle',3,'minimum_service_months',4,
        'minimum_days_worked_per_week',4,'minimum_hours_per_month',24,
        'expires_at_cycle_end',true,
        'official_source','https://www.labour.gov.za/documentcenter/pages/basic-guide-to-family-responsibility-leave.aspx'
      ),
      'employment_anniversary'
    );
  end if;

  select id into v_type_id from public.leave_types
  where organisation_id=v_org.id and code='PARENTAL_INTERIM';
  if not exists(
    select 1 from public.leave_policy_versions
    where organisation_id=v_org.id and leave_type_id=v_type_id
      and effective_from<=v_effective_date
      and (effective_to is null or effective_to>=v_effective_date)
  ) then
    select coalesce(max(version),0)+1 into v_next_version
    from public.leave_policy_versions where organisation_id=v_org.id and leave_type_id=v_type_id;
    insert into public.leave_policy_versions(
      organisation_id,leave_type_id,version,effective_from,
      entitlement_method,entitlement_amount,cycle_months,carry_over_cap,
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source,cycle_basis
    ) values(
      v_org.id,v_type_id,v_next_version,v_effective_date,
      'manual_allocation',0,12,0,false,
      '{"event_evidence_required":true,"allocation_must_be_confirmed_by_hr":true}'::jsonb,
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object(
        'jurisdiction','ZA',
        'legal_reference','Constitutional Court Van Wyk interim reading-in',
        'status','interim_until_remedial_legislation',
        'single_employed_parent','four_months',
        'two_employed_parents_shared_pool','four_months_plus_10_days',
        'shared_by_agreement',true,'manual_allocation_required',true,
        'uif_benefit_not_equated_to_leave_entitlement',true,
        'official_source','https://www.concourt.org.za/index.php/judgement/617-a-werner-van-wyk-and-others-v-minister-of-employment-and-labour-b-cge-and-others'
      ),
      'employment_anniversary'
    );
  end if;

  select id into v_type_id from public.leave_types
  where organisation_id=v_org.id and code='UNPAID';
  if not exists(
    select 1 from public.leave_policy_versions
    where organisation_id=v_org.id and leave_type_id=v_type_id
      and effective_from<=v_effective_date
      and (effective_to is null or effective_to>=v_effective_date)
  ) then
    select coalesce(max(version),0)+1 into v_next_version
    from public.leave_policy_versions where organisation_id=v_org.id and leave_type_id=v_type_id;
    insert into public.leave_policy_versions(
      organisation_id,leave_type_id,version,effective_from,
      entitlement_method,entitlement_amount,cycle_months,carry_over_cap,
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source,cycle_basis
    ) values(
      v_org.id,v_type_id,v_next_version,v_effective_date,
      'no_balance',0,12,0,true,'{}'::jsonb,
      '{"mode":"manager"}'::jsonb,
      '{"status":"employer_operational_type","pay_effect":"unpaid"}'::jsonb,
      'organisation_fixed'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'code',lt.code,
    'name',lt.name,
    'statutory',lt.is_statutory
  ) order by lt.code)
  into v_result
  from public.leave_types lt
  where lt.organisation_id=v_org.id
    and lt.code in ('ANNUAL','SICK','FAMILY_RESPONSIBILITY','PARENTAL_INTERIM','UNPAID');

  return coalesce(v_result,'[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.configure_employer_leave_type(p_code text, p_name text, p_entitlement_days numeric, p_cycle_basis text DEFAULT 'employment_anniversary'::text, p_cycle_months integer DEFAULT 12, p_colour_token text DEFAULT 'slate'::text, p_effective_from date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_code text;
  v_name text;
  v_business_date date;
  v_leave_type_id uuid;
  v_policy_id uuid;
  v_previous public.leave_policy_versions%rowtype;
  v_next_version integer;
  v_employee record;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id
    into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;

  v_code:=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9_]+','_','g'));
  v_code:=trim(both '_' from v_code);
  v_name:=nullif(btrim(p_name),'');

  if v_code is null or length(v_code)<2 or length(v_code)>30 then
    raise exception 'invalid_leave_type_code';
  end if;
  if v_code in ('ANNUAL','SICK','FAMILY_RESPONSIBILITY','PARENTAL_INTERIM','UNPAID','TOIL') then
    raise exception 'reserved_leave_type_code';
  end if;
  if v_name is null then raise exception 'leave_type_name_required'; end if;
  if p_entitlement_days is null or p_entitlement_days<0 or p_entitlement_days>366 then
    raise exception 'invalid_entitlement_days';
  end if;
  if p_cycle_basis not in ('organisation_fixed','employment_anniversary') then
    raise exception 'invalid_cycle_basis';
  end if;
  if p_cycle_months is null or p_cycle_months<1 or p_cycle_months>60 then
    raise exception 'invalid_cycle_months';
  end if;
  if p_colour_token not in ('teal','blue','amber','purple','rose','slate') then
    raise exception 'invalid_colour_token';
  end if;

  v_business_date:=private.organisation_business_date(v_org_id);
  p_effective_from:=coalesce(p_effective_from,v_business_date);

  insert into public.leave_types(
    organisation_id,code,name,unit,is_statutory,requires_approval,
    requires_evidence,colour_token,active
  ) values(
    v_org_id,v_code,v_name,'days',false,true,false,p_colour_token,true
  )
  on conflict(organisation_id,code)
  do update set
    name=excluded.name,
    colour_token=excluded.colour_token,
    active=true
  returning id into v_leave_type_id;

  if exists(
    select 1 from public.leave_types lt
    where lt.id=v_leave_type_id and lt.is_statutory
  ) then
    raise exception 'statutory_leave_type_not_editable_here';
  end if;

  select * into v_previous
  from public.leave_policy_versions lpv
  where lpv.organisation_id=v_org_id
    and lpv.leave_type_id=v_leave_type_id
    and lpv.effective_from<=p_effective_from
    and (lpv.effective_to is null or lpv.effective_to>=p_effective_from)
  order by lpv.version desc
  limit 1
  for update;

  select coalesce(max(version),0)+1
    into v_next_version
  from public.leave_policy_versions
  where organisation_id=v_org_id
    and leave_type_id=v_leave_type_id;

  if v_previous.id is not null
     and v_previous.effective_from=p_effective_from
     and not exists(
       select 1 from public.leave_requests r
       where r.policy_version_id=v_previous.id
     ) then
    update public.leave_policy_versions
    set entitlement_method='fixed_days',
        entitlement_amount=p_entitlement_days,
        cycle_months=p_cycle_months,
        cycle_basis=p_cycle_basis,
        cycle_anchor_month=case
          when p_cycle_basis='organisation_fixed'
          then extract(month from p_effective_from)::smallint
          else null
        end,
        cycle_anchor_day=case
          when p_cycle_basis='organisation_fixed'
          then extract(day from p_effective_from)::smallint
          else null
        end,
        negative_balance_allowed=false,
        approval_rule='{"mode":"manager"}'::jsonb,
        statutory_source=jsonb_build_object(
          'status','employer_defined',
          'statutory',false
        ),
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
      negative_balance_allowed,evidence_rule,approval_rule,statutory_source
    ) values(
      v_org_id,v_leave_type_id,v_next_version,p_effective_from,null,
      'fixed_days',p_entitlement_days,p_cycle_months,
      p_cycle_basis,
      case when p_cycle_basis='organisation_fixed'
        then extract(month from p_effective_from)::smallint else null end,
      case when p_cycle_basis='organisation_fixed'
        then extract(day from p_effective_from)::smallint else null end,
      false,
      '{}'::jsonb,
      '{"mode":"manager"}'::jsonb,
      jsonb_build_object('status','employer_defined','statutory',false)
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
          and v_business_date between le.cycle_start and le.cycle_end
      )
  loop
    perform private.provision_employee_entitlements_for_date(
      v_employee.id,
      v_user_id,
      v_business_date,
      '{}'::jsonb
    );
  end loop;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'leave_type',v_leave_type_id,
    'leave.employer_type.configured',
    jsonb_build_object(
      'code',v_code,
      'name',v_name,
      'entitlement_days',p_entitlement_days,
      'cycle_basis',p_cycle_basis,
      'cycle_months',p_cycle_months,
      'effective_from',p_effective_from
    )
  );

  return v_leave_type_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_manual_leave_allocation(p_employee_id uuid, p_leave_type_code text, p_adjustment numeric, p_reason text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_employee public.employees%rowtype;
  v_business_date date;
  v_leave_type_id uuid;
  v_policy public.leave_policy_versions%rowtype;
  v_entitlement_id uuid;
  v_current numeric(10,2):=0;
  v_new numeric(10,2):=0;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_adjustment is null or p_adjustment=0 or abs(p_adjustment)>366 then
    raise exception 'invalid_allocation_adjustment';
  end if;
  if length(coalesce(btrim(p_reason),''))<3 then
    raise exception 'allocation_reason_required';
  end if;

  select * into v_employee
  from public.employees
  where id=p_employee_id and employment_status='active';

  if v_employee.id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_employee.organisation_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then
    raise exception 'not_authorised';
  end if;

  v_business_date:=private.organisation_business_date(v_employee.organisation_id);

  select lt.id into v_leave_type_id
  from public.leave_types lt
  where lt.organisation_id=v_employee.organisation_id
    and lt.code=upper(btrim(p_leave_type_code))
    and lt.active
  limit 1;

  if v_leave_type_id is null then raise exception 'leave_type_not_found'; end if;

  select p.* into v_policy
  from public.leave_policy_versions p
  where p.organisation_id=v_employee.organisation_id
    and p.leave_type_id=v_leave_type_id
    and p.effective_from<=v_business_date
    and (p.effective_to is null or p.effective_to>=v_business_date)
  order by p.effective_from desc,p.version desc
  limit 1;

  if v_policy.id is null then raise exception 'leave_policy_not_configured'; end if;
  if v_policy.entitlement_method<>'manual_allocation' then
    raise exception 'leave_type_not_manual_allocation';
  end if;

  perform private.provision_employee_entitlements_for_date(
    v_employee.id,v_user_id,v_business_date,'{}'::jsonb
  );

  select le.id into v_entitlement_id
  from public.leave_entitlements le
  where le.employee_id=v_employee.id
    and le.leave_type_id=v_leave_type_id
    and v_business_date between le.cycle_start and le.cycle_end
  order by le.cycle_start desc
  limit 1;

  if v_entitlement_id is null then raise exception 'leave_entitlement_not_configured'; end if;

  select coalesce(sum(l.quantity),0)
    into v_current
  from public.leave_ledger_entries l
  where l.entitlement_id=v_entitlement_id;

  v_new:=v_current+p_adjustment;
  if v_new<0 then raise exception 'allocation_cannot_make_balance_negative'; end if;

  insert into public.leave_ledger_entries(
    organisation_id,employee_id,leave_type_id,entitlement_id,
    entry_type,quantity,effective_date,reason,source_metadata,created_by
  ) values(
    v_employee.organisation_id,v_employee.id,v_leave_type_id,v_entitlement_id,
    'manual_adjustment',p_adjustment,v_business_date,btrim(p_reason),
    jsonb_build_object(
      'adjustment_kind','manual_leave_allocation',
      'leave_type_code',upper(btrim(p_leave_type_code)),
      'previous_balance',v_current,
      'new_balance',v_new,
      'policy_version_id',v_policy.id
    ),
    v_user_id
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_employee.organisation_id,v_user_id,'employee',v_employee.id,
    'leave.manual_allocation.adjusted',
    jsonb_build_object(
      'leave_type_code',upper(btrim(p_leave_type_code)),
      'adjustment',p_adjustment,
      'previous_balance',v_current,
      'new_balance',v_new,
      'reason',btrim(p_reason)
    )
  );

  return v_new;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.decide_leave_request(p_request_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS leave_request_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.leave_requests%rowtype;
  v_entitlement_id uuid;
  v_entitlement_method text;
  v_actor_employee_id uuid;
  v_authorised boolean:=false;
  v_new_status public.leave_request_status;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  perform private.require_decline_reason(p_decision,p_note);

  select * into v_request from public.leave_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status<>'pending_approval' then raise exception 'request_not_pending'; end if;

  select e.id into v_actor_employee_id
  from public.employees e
  where e.organisation_id=v_request.organisation_id
    and e.user_id=v_user_id and e.employment_status='active'
  limit 1;

  if v_actor_employee_id=v_request.employee_id then raise exception 'self_approval_not_allowed'; end if;

  v_authorised:=private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );
  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;

  select entitlement_method into v_entitlement_method
  from public.leave_policy_versions
  where id=v_request.policy_version_id;

  select id into v_entitlement_id
  from public.leave_entitlements
  where organisation_id=v_request.organisation_id
    and employee_id=v_request.employee_id
    and leave_type_id=v_request.leave_type_id
    and v_request.start_date between cycle_start and cycle_end
  order by cycle_start desc
  limit 1;

  if coalesce(v_entitlement_method,'fixed_days')<>'no_balance' then
    insert into public.leave_ledger_entries(
      organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
      entry_type,quantity,effective_date,reason,source_metadata,created_by
    ) values(
      v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,
      v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,
      v_request.start_date,'Release pending leave reservation',
      jsonb_build_object('decision',lower(p_decision)),v_user_id
    );
  end if;

  if lower(p_decision)='approve' then
    v_new_status:='approved';
    if coalesce(v_entitlement_method,'fixed_days')<>'no_balance' then
      insert into public.leave_ledger_entries(
        organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
        entry_type,quantity,effective_date,reason,source_metadata,created_by
      ) values(
        v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,
        v_entitlement_id,v_request.id,'leave_approved',-v_request.quantity,
        v_request.start_date,'Approved leave',
        jsonb_build_object('approved_by',v_user_id),v_user_id
      );
    end if;
  else
    v_new_status:='declined';
  end if;

  update public.leave_requests
  set status=v_new_status,decided_at=now(),decided_by=v_user_id,updated_at=now()
  where id=v_request.id;

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(
    v_request.organisation_id,v_request.id,v_user_id,
    case when v_new_status='approved'
      then 'approved'::public.approval_action_type
      else 'declined'::public.approval_action_type end,
    nullif(btrim(p_note),'')
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'leave_request',v_request.id,
    case when v_new_status='approved' then 'leave.request.approved' else 'leave.request.declined' end,
    jsonb_build_object('quantity',v_request.quantity,'note',nullif(btrim(p_note),''),
                      'entitlement_method',v_entitlement_method)
  );

  return v_new_status;
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
  v_entitlement_method text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select r.* into v_request
  from public.leave_requests r
  join public.employees e on e.id=r.employee_id
  join public.organisation_memberships m
    on m.organisation_id=e.organisation_id and m.user_id=e.user_id and m.is_active
  where r.id=p_request_id and e.user_id=v_user_id and e.employment_status='active'
  for update of r;

  if v_request.id is null then raise exception 'request_not_found_or_not_owned'; end if;
  if v_request.status not in ('submitted','pending_approval') then
    raise exception 'request_not_withdrawable';
  end if;

  select entitlement_method into v_entitlement_method
  from public.leave_policy_versions where id=v_request.policy_version_id;

  if coalesce(v_entitlement_method,'fixed_days')<>'no_balance' then
    select id into v_entitlement_id
    from public.leave_entitlements
    where organisation_id=v_request.organisation_id
      and employee_id=v_request.employee_id
      and leave_type_id=v_request.leave_type_id
      and v_request.start_date between cycle_start and cycle_end
    order by cycle_start desc limit 1;

    insert into public.leave_ledger_entries(
      organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
      entry_type,quantity,effective_date,reason,source_metadata,created_by
    ) values(
      v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,
      v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,
      private.organisation_business_date(v_request.organisation_id),
      'Withdrawn pending leave request',
      jsonb_build_object('previous_status',v_request.status),v_user_id
    );
  end if;

  update public.leave_requests set status='withdrawn',updated_at=now()
  where id=v_request.id;

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(
    v_request.organisation_id,v_request.id,v_user_id,'withdrawn',nullif(btrim(p_note),'')
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'leave_request',v_request.id,
    'leave.request.withdrawn',
    jsonb_build_object('quantity_restored',
      case when coalesce(v_entitlement_method,'fixed_days')='no_balance' then 0 else v_request.quantity end,
      'entitlement_method',v_entitlement_method)
  );

  return 'withdrawn';
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_leave_cancellation(p_request_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS leave_request_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_request public.leave_requests%rowtype;
  v_actor_employee_id uuid;
  v_entitlement_id uuid;
  v_entitlement_method text;
  v_authorised boolean:=false;
  v_new_status public.leave_request_status;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  perform private.require_decline_reason(p_decision,p_note);

  select * into v_request from public.leave_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status<>'cancellation_requested' then raise exception 'cancellation_not_pending'; end if;

  select e.id into v_actor_employee_id
  from public.employees e
  where e.organisation_id=v_request.organisation_id
    and e.user_id=v_user_id and e.employment_status='active'
  limit 1;

  if v_actor_employee_id=v_request.employee_id then raise exception 'self_approval_not_allowed'; end if;

  v_authorised:=private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );
  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;

  select entitlement_method into v_entitlement_method
  from public.leave_policy_versions where id=v_request.policy_version_id;

  if lower(p_decision)='approve' then
    if coalesce(v_entitlement_method,'fixed_days')<>'no_balance' then
      select id into v_entitlement_id
      from public.leave_entitlements
      where organisation_id=v_request.organisation_id
        and employee_id=v_request.employee_id
        and leave_type_id=v_request.leave_type_id
        and v_request.start_date between cycle_start and cycle_end
      order by cycle_start desc limit 1;

      insert into public.leave_ledger_entries(
        organisation_id,employee_id,leave_type_id,entitlement_id,request_id,
        entry_type,quantity,effective_date,reason,source_metadata,created_by
      ) values(
        v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,
        v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,
        private.organisation_business_date(v_request.organisation_id),
        'Approved leave cancellation',
        jsonb_build_object('cancelled_by',v_user_id),v_user_id
      );
    end if;
    v_new_status:='cancelled';
  else
    v_new_status:='approved';
  end if;

  update public.leave_requests
  set status=v_new_status,decided_at=now(),decided_by=v_user_id,updated_at=now()
  where id=v_request.id;

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(
    v_request.organisation_id,v_request.id,v_user_id,
    case when v_new_status='cancelled'
      then 'cancel_approved'::public.approval_action_type
      else 'cancel_declined'::public.approval_action_type end,
    nullif(btrim(p_note),'')
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'leave_request',v_request.id,
    case when v_new_status='cancelled'
      then 'leave.cancellation.approved'
      else 'leave.cancellation.declined' end,
    jsonb_build_object('quantity',v_request.quantity,'note',nullif(btrim(p_note),''),
                      'entitlement_method',v_entitlement_method)
  );

  return v_new_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bootstrap_organisation(p_name text, p_first_name text, p_last_name text, p_email text, p_start_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_employee_id uuid;
  v_schedule_id uuid;
  v_business_date date;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  if nullif(btrim(p_name),'') is null
     or nullif(btrim(p_first_name),'') is null
     or nullif(btrim(p_last_name),'') is null
     or nullif(btrim(p_email),'') is null then
    raise exception 'required_fields_missing';
  end if;

  p_start_date:=coalesce(
    p_start_date,
    (now() at time zone 'Africa/Johannesburg')::date
  );

  if exists(
    select 1 from public.organisation_memberships m
    where m.user_id=v_user_id and m.is_active
  ) or exists(
    select 1 from public.employees e
    where e.user_id=v_user_id and e.employment_status='active'
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  insert into public.organisations(name)
  values(btrim(p_name))
  returning id into v_org_id;

  insert into public.organisation_memberships(
    organisation_id,user_id,role
  ) values
    (v_org_id,v_user_id,'org_admin'),
    (v_org_id,v_user_id,'employee');

  insert into public.employees(
    organisation_id,user_id,first_name,last_name,email,start_date
  ) values(
    v_org_id,v_user_id,btrim(p_first_name),btrim(p_last_name),
    lower(btrim(p_email)),p_start_date
  )
  returning id into v_employee_id;

  insert into public.work_schedules(
    organisation_id,name,
    monday_hours,tuesday_hours,wednesday_hours,thursday_hours,friday_hours,
    saturday_hours,sunday_hours
  ) values(
    v_org_id,'Standard Monday to Friday',8,8,8,8,8,0,0
  )
  returning id into v_schedule_id;

  insert into public.employee_schedule_assignments(
    organisation_id,employee_id,work_schedule_id,effective_from
  ) values(
    v_org_id,v_employee_id,v_schedule_id,p_start_date
  );

  perform private.seed_za_public_holidays(v_org_id);
  v_business_date:=private.organisation_business_date(v_org_id);
  perform private.ensure_za_leave_baseline(v_org_id,v_business_date);
  perform private.provision_employee_entitlements_for_date(
    v_employee_id,v_user_id,v_business_date,'{}'::jsonb
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'organisation',v_org_id,'organisation.bootstrapped',
    jsonb_build_object(
      'country_code','ZA',
      'timezone','Africa/Johannesburg',
      'public_holidays_seeded',true,
      'statutory_leave_baseline_seeded',true,
      'single_active_organisation_identity',true
    )
  );

  return v_org_id;
end;
$function$;


-- Explicit execution boundary.
revoke all on function private.scheduled_workdays_in_range(uuid,date,date) from public,anon,authenticated;
revoke all on function private.scheduled_hours_in_range(uuid,date,date) from public,anon,authenticated;
revoke all on function private.resolve_leave_cycle(uuid,uuid,date) from public,anon,authenticated;
revoke all on function private.calculate_leave_entitlement_target(uuid,uuid,date) from public,anon,authenticated;
revoke all on function private.provision_employee_entitlements_for_date(uuid,uuid,date,jsonb) from public,anon,authenticated;
revoke all on function private.ensure_za_leave_baseline(uuid,date) from public,anon,authenticated;

revoke all on function private.configure_annual_leave_policy_v2(numeric,text,integer,integer,date) from public,anon;
grant execute on function private.configure_annual_leave_policy_v2(numeric,text,integer,integer,date) to authenticated;

revoke all on function public.configure_employer_leave_type(text,text,numeric,text,integer,text,date) from public,anon;
grant execute on function public.configure_employer_leave_type(text,text,numeric,text,integer,text,date) to authenticated;
revoke all on function public.adjust_manual_leave_allocation(uuid,text,numeric,text) from public,anon;
grant execute on function public.adjust_manual_leave_allocation(uuid,text,numeric,text) to authenticated;
revoke all on function public.submit_leave_request_v2(uuid,date,date,text,numeric) from public,anon;
grant execute on function public.submit_leave_request_v2(uuid,date,date,text,numeric) to authenticated;
revoke all on function public.decide_leave_request(uuid,text,text) from public,anon;
grant execute on function public.decide_leave_request(uuid,text,text) to authenticated;
revoke all on function public.withdraw_leave_request(uuid,text) from public,anon;
grant execute on function public.withdraw_leave_request(uuid,text) to authenticated;
revoke all on function public.decide_leave_cancellation(uuid,text,text) from public,anon;
grant execute on function public.decide_leave_cancellation(uuid,text,text) to authenticated;
revoke all on function public.bootstrap_organisation(text,text,text,text,date) from public,anon;
grant execute on function public.bootstrap_organisation(text,text,text,text,date) to authenticated;

-- Backfill existing ZA tenants and active employees. Provisioning is append-only/idempotent.
do $$
declare
  v_org record;
  v_employee record;
begin
  for v_org in select id from public.organisations where country_code='ZA'
  loop
    perform private.ensure_za_leave_baseline(
      v_org.id,
      private.organisation_business_date(v_org.id)
    );
  end loop;

  for v_employee in
    select id,user_id,organisation_id
    from public.employees
    where employment_status='active'
  loop
    perform private.provision_employee_entitlements_for_date(
      v_employee.id,
      v_employee.user_id,
      private.organisation_business_date(v_employee.organisation_id),
      '{}'::jsonb
    );
  end loop;
end;
$$;

