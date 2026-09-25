
alter table public.public_holidays
  add column if not exists jurisdiction_code text not null default 'ZA',
  add column if not exists is_observed boolean not null default false,
  add column if not exists is_one_off boolean not null default false,
  add column if not exists source_kind text not null default 'statutory_calendar',
  add column if not exists source_verified_at timestamptz;

create or replace function private.seed_za_public_holidays(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer := 0;
begin
  insert into public.public_holidays(
    organisation_id,
    holiday_date,
    name,
    source_reference,
    jurisdiction_code,
    is_observed,
    is_one_off,
    source_kind,
    source_verified_at
  )
  values
    (p_org_id, '2026-01-01', 'New Year''s Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-03-21', 'Human Rights Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-04-03', 'Good Friday', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-04-06', 'Family Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-04-27', 'Freedom Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-05-01', 'Workers'' Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-06-16', 'Youth Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-08-09', 'National Women''s Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-08-10', 'National Women''s Day observed', 'https://www.gov.za/about-sa/public-holidays', 'ZA', true, false, 'statutory_observed', now()),
    (p_org_id, '2026-09-24', 'Heritage Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-11-04', 'Local Government Election Day', 'https://www.gov.za/news/media-statements/president-cyril-ramaphosa-declares-election-day', 'ZA', false, true, 'presidential_proclamation', now()),
    (p_org_id, '2026-12-16', 'Day of Reconciliation', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-12-25', 'Christmas Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2026-12-26', 'Day of Goodwill', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),

    (p_org_id, '2027-01-01', 'New Year''s Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-03-21', 'Human Rights Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-03-22', 'Human Rights Day observed', 'https://www.gov.za/about-sa/public-holidays', 'ZA', true, false, 'statutory_observed', now()),
    (p_org_id, '2027-03-26', 'Good Friday', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-03-29', 'Family Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-04-27', 'Freedom Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-05-01', 'Workers'' Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-06-16', 'Youth Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-08-09', 'National Women''s Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-09-24', 'Heritage Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-12-16', 'Day of Reconciliation', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-12-25', 'Christmas Day', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now()),
    (p_org_id, '2027-12-26', 'Day of Goodwill', 'https://www.gov.za/about-sa/public-holidays', 'ZA', false, false, 'statutory_calendar', now())
  on conflict (organisation_id, holiday_date)
  do update set
    name = excluded.name,
    source_reference = excluded.source_reference,
    jurisdiction_code = excluded.jurisdiction_code,
    is_observed = excluded.is_observed,
    is_one_off = excluded.is_one_off,
    source_kind = excluded.source_kind,
    source_verified_at = excluded.source_verified_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.seed_za_public_holidays(uuid) from public, anon, authenticated;

create or replace function private.provision_employee_entitlements(
  p_employee_id uuid,
  p_actor_user_id uuid,
  p_opening_balances jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_employee public.employees%rowtype;
  v_policy record;
  v_reference_date date;
  v_entitlement_id uuid;
  v_quantity numeric(10,2);
  v_explicit boolean;
  v_results jsonb := '[]'::jsonb;
begin
  select * into v_employee
  from public.employees
  where id = p_employee_id;

  if v_employee.id is null then
    raise exception 'employee_not_found';
  end if;

  v_reference_date := greatest(current_date, v_employee.start_date);

  for v_policy in
    select distinct on (lpv.leave_type_id)
      lpv.*,
      lt.code as leave_type_code,
      lt.name as leave_type_name
    from public.leave_policy_versions lpv
    join public.leave_types lt
      on lt.id = lpv.leave_type_id
     and lt.active
    where lpv.organisation_id = v_employee.organisation_id
      and lpv.effective_from <= v_reference_date
      and (lpv.effective_to is null or lpv.effective_to >= v_reference_date)
    order by lpv.leave_type_id, lpv.effective_from desc, lpv.version desc
  loop
    v_explicit := p_opening_balances ? v_policy.leave_type_code;

    if v_explicit then
      begin
        v_quantity := (p_opening_balances ->> v_policy.leave_type_code)::numeric;
      exception when others then
        raise exception 'invalid_opening_balance_%', v_policy.leave_type_code;
      end;
    elsif v_policy.entitlement_method = 'fixed_days' then
      v_quantity := coalesce(v_policy.entitlement_amount, 0);
    else
      v_quantity := 0;
    end if;

    insert into public.leave_entitlements(
      organisation_id,
      employee_id,
      leave_type_id,
      policy_version_id,
      cycle_start,
      cycle_end,
      opening_entitlement
    )
    values (
      v_employee.organisation_id,
      v_employee.id,
      v_policy.leave_type_id,
      v_policy.id,
      v_policy.effective_from,
      coalesce(
        v_policy.effective_to,
        (v_policy.effective_from + make_interval(months => coalesce(v_policy.cycle_months,12)) - interval '1 day')::date
      ),
      v_quantity
    )
    on conflict (employee_id, leave_type_id, cycle_start)
    do update set
      cycle_end = excluded.cycle_end,
      policy_version_id = excluded.policy_version_id
    returning id into v_entitlement_id;

    if v_quantity <> 0 and not exists (
      select 1
      from public.leave_ledger_entries l
      where l.entitlement_id = v_entitlement_id
        and l.entry_type in ('entitlement_granted','migration_opening_balance')
    ) then
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
        v_policy.leave_type_id,
        v_entitlement_id,
        case
          when v_explicit then 'migration_opening_balance'::public.ledger_entry_type
          else 'entitlement_granted'::public.ledger_entry_type
        end,
        v_quantity,
        greatest(v_employee.start_date, v_policy.effective_from),
        case
          when v_explicit then 'Administrator-confirmed opening balance'
          else 'Policy entitlement provisioned'
        end,
        jsonb_build_object(
          'source', case when v_explicit then 'admin_opening_balance' else 'policy_default' end,
          'policy_version_id', v_policy.id,
          'leave_type_code', v_policy.leave_type_code
        ),
        p_actor_user_id
      );
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'leave_type_code', v_policy.leave_type_code,
        'entitlement_id', v_entitlement_id,
        'opening_balance', v_quantity,
        'source', case when v_explicit then 'admin_opening_balance' else 'policy_default' end
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function private.provision_employee_entitlements(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.set_employee_opening_balance(
  p_employee_id uuid,
  p_leave_type_code text,
  p_balance numeric,
  p_reason text default 'Opening balance confirmed by administrator'
)
returns numeric
language plpgsql
security definer
set search_path = public, private
as $$
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
  where l.employee_id = v_employee.id
    and l.leave_type_id = v_leave_type_id;

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
$$;

revoke execute on function public.set_employee_opening_balance(uuid,text,numeric,text) from anon;
revoke execute on function public.set_employee_opening_balance(uuid,text,numeric,text) from public;
grant execute on function public.set_employee_opening_balance(uuid,text,numeric,text) to authenticated;

create or replace function public.add_employee_record(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_start_date date,
  p_employee_number text default null,
  p_department_id uuid default null,
  p_manager_employee_id uuid default null,
  p_work_schedule_id uuid default null,
  p_grant_manager_role boolean default false,
  p_prepare_invitation boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_employee_id uuid;
  v_schedule_id uuid;
  v_token text;
  v_entitlements jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id
    into v_org_id
  from public.organisation_memberships m
  where m.user_id = v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;

  if nullif(btrim(p_email), '') is null
     or nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null then
    raise exception 'required_fields_missing';
  end if;

  if exists (
    select 1
    from public.employees e
    where e.organisation_id = v_org_id
      and lower(e.email) = lower(btrim(p_email))
  ) then
    raise exception 'employee_email_already_exists';
  end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments d
    where d.id = p_department_id
      and d.organisation_id = v_org_id
  ) then
    raise exception 'invalid_department';
  end if;

  if p_manager_employee_id is not null and not exists (
    select 1 from public.employees m
    where m.id = p_manager_employee_id
      and m.organisation_id = v_org_id
      and m.employment_status = 'active'
  ) then
    raise exception 'invalid_manager';
  end if;

  if p_work_schedule_id is not null then
    select ws.id into v_schedule_id
    from public.work_schedules ws
    where ws.id = p_work_schedule_id
      and ws.organisation_id = v_org_id;
  else
    select ws.id into v_schedule_id
    from public.work_schedules ws
    where ws.organisation_id = v_org_id
    order by ws.created_at
    limit 1;
  end if;

  if v_schedule_id is null then raise exception 'work_schedule_required'; end if;

  insert into public.employees(
    organisation_id, employee_number, first_name, last_name, email,
    start_date, department_id, manager_employee_id
  )
  values (
    v_org_id, nullif(btrim(p_employee_number), ''),
    btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)),
    p_start_date, p_department_id, p_manager_employee_id
  )
  returning id into v_employee_id;

  insert into public.employee_schedule_assignments(
    organisation_id, employee_id, work_schedule_id, effective_from
  )
  values (v_org_id, v_employee_id, v_schedule_id, p_start_date);

  v_entitlements := private.provision_employee_entitlements(
    v_employee_id,
    v_user_id,
    '{}'::jsonb
  );

  if p_prepare_invitation then
    v_token := encode(gen_random_bytes(24), 'hex');

    insert into public.employee_invitations(
      organisation_id, employee_id, email, first_name, last_name,
      employee_number, department_id, manager_employee_id, work_schedule_id,
      start_date, grant_manager_role, token_hash, created_by
    )
    values (
      v_org_id, v_employee_id, lower(btrim(p_email)),
      btrim(p_first_name), btrim(p_last_name),
      nullif(btrim(p_employee_number), ''), p_department_id,
      p_manager_employee_id, v_schedule_id, p_start_date,
      p_grant_manager_role, digest(v_token, 'sha256'), v_user_id
    );
  end if;

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'employee', v_employee_id, 'employee.added',
    jsonb_build_object(
      'access_invitation_prepared', p_prepare_invitation,
      'manager_role_requested', p_grant_manager_role,
      'entitlements', v_entitlements
    )
  );

  return jsonb_build_object(
    'employee_id', v_employee_id,
    'invitation_token', v_token,
    'entitlements', v_entitlements
  );
end;
$$;

revoke execute on function public.add_employee_record(text,text,text,date,text,uuid,uuid,uuid,boolean,boolean) from anon;
revoke execute on function public.add_employee_record(text,text,text,date,text,uuid,uuid,uuid,boolean,boolean) from public;
grant execute on function public.add_employee_record(text,text,text,date,text,uuid,uuid,uuid,boolean,boolean) to authenticated;

create or replace function public.bootstrap_organisation(
  p_name text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_start_date date default current_date
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
  v_schedule_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if nullif(btrim(p_name), '') is null
     or nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null
     or nullif(btrim(p_email), '') is null then
    raise exception 'required_fields_missing';
  end if;

  insert into public.organisations(name)
  values (btrim(p_name))
  returning id into v_org_id;

  insert into public.organisation_memberships(organisation_id, user_id, role)
  values
    (v_org_id, v_user_id, 'org_admin'),
    (v_org_id, v_user_id, 'employee');

  insert into public.employees(
    organisation_id, user_id, first_name, last_name, email, start_date
  )
  values (
    v_org_id, v_user_id, btrim(p_first_name), btrim(p_last_name),
    lower(btrim(p_email)), p_start_date
  )
  returning id into v_employee_id;

  insert into public.work_schedules(
    organisation_id, name,
    monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
    saturday_hours, sunday_hours
  )
  values (v_org_id, 'Standard Monday to Friday', 8, 8, 8, 8, 8, 0, 0)
  returning id into v_schedule_id;

  insert into public.employee_schedule_assignments(
    organisation_id, employee_id, work_schedule_id, effective_from
  )
  values (v_org_id, v_employee_id, v_schedule_id, p_start_date);

  perform private.seed_za_public_holidays(v_org_id);

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'organisation', v_org_id, 'organisation.bootstrapped',
    jsonb_build_object(
      'country_code','ZA',
      'timezone','Africa/Johannesburg',
      'public_holidays_seeded',true
    )
  );

  return v_org_id;
end;
$$;

revoke execute on function public.bootstrap_organisation(text,text,text,text,date) from anon;
revoke execute on function public.bootstrap_organisation(text,text,text,text,date) from public;
grant execute on function public.bootstrap_organisation(text,text,text,text,date) to authenticated;

do $$
declare
  v_org record;
begin
  for v_org in
    select id from public.organisations where country_code = 'ZA'
  loop
    perform private.seed_za_public_holidays(v_org.id);
  end loop;
end;
$$;

do $$
declare
  v_employee record;
begin
  for v_employee in
    select e.id, e.user_id
    from public.employees e
    where e.employment_status = 'active'
  loop
    perform private.provision_employee_entitlements(
      v_employee.id,
      v_employee.user_id,
      '{}'::jsonb
    );
  end loop;
end;
$$;

update public.leave_policy_versions lpv
set statutory_source =
  coalesce(lpv.statutory_source,'{}'::jsonb)
  || jsonb_build_object(
    'jurisdiction','ZA',
    'legal_reference','BCEA section 20',
    'official_source','https://www.labour.gov.za/DocumentCenter/Acts/Basic%20Conditions%20of%20Employment/Act%20-%20Basic%20Conditions%20of%20Employment.pdf',
    'baseline_note','Annual leave statutory baseline requires separate schedule-aware evaluation; employer policy remains the configured entitlement.',
    'last_verified_at',now()
  )
where exists (
  select 1
  from public.organisations o
  where o.id = lpv.organisation_id
    and o.country_code = 'ZA'
);
