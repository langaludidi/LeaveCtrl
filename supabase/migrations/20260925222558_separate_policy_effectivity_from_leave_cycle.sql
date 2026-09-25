
alter table public.leave_policy_versions
  add column if not exists cycle_basis text not null default 'organisation_fixed'
    check (cycle_basis in ('organisation_fixed','employment_anniversary')),
  add column if not exists cycle_anchor_month smallint
    check (cycle_anchor_month between 1 and 12),
  add column if not exists cycle_anchor_day smallint
    check (cycle_anchor_day between 1 and 31);

update public.leave_policy_versions
set cycle_basis='organisation_fixed',
    cycle_anchor_month=coalesce(cycle_anchor_month,extract(month from effective_from)::smallint),
    cycle_anchor_day=coalesce(cycle_anchor_day,extract(day from effective_from)::smallint)
where cycle_basis='organisation_fixed';

update public.leave_policy_versions lpv
set effective_to=null
where lpv.id in (
  select distinct on (x.organisation_id,x.leave_type_id) x.id
  from public.leave_policy_versions x
  where coalesce(x.statutory_source->>'status','')='employer_configured'
    and x.effective_to is not null
    and x.effective_to = (
      x.effective_from
      + make_interval(months=>coalesce(x.cycle_months,12))
      - interval '1 day'
    )::date
  order by x.organisation_id,x.leave_type_id,x.version desc
);

create or replace function private.safe_cycle_date(
  p_year integer,
  p_month integer,
  p_day integer
)
returns date
language sql
immutable
set search_path=''
as $$
  select make_date(
    p_year,
    p_month,
    least(
      p_day,
      extract(
        day from (
          date_trunc('month',make_date(p_year,p_month,1))
          + interval '1 month - 1 day'
        )
      )::integer
    )
  );
$$;

revoke all on function private.safe_cycle_date(integer,integer,integer)
from public,anon,authenticated;

create or replace function private.resolve_leave_cycle(
  p_employee_id uuid,
  p_policy_id uuid,
  p_reference_date date
)
returns table(cycle_start date,cycle_end date)
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  v_employee public.employees%rowtype;
  v_policy public.leave_policy_versions%rowtype;
  v_anchor date;
  v_month integer;
  v_day integer;
  v_year integer;
begin
  select * into v_employee
  from public.employees
  where id=p_employee_id;

  select * into v_policy
  from public.leave_policy_versions
  where id=p_policy_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;
  if v_policy.id is null then raise exception 'policy_not_found'; end if;
  if v_employee.organisation_id<>v_policy.organisation_id then
    raise exception 'policy_employee_org_mismatch';
  end if;

  if v_policy.cycle_basis='employment_anniversary' then
    v_month:=extract(month from v_employee.start_date)::integer;
    v_day:=extract(day from v_employee.start_date)::integer;
  else
    v_month:=coalesce(v_policy.cycle_anchor_month,extract(month from v_policy.effective_from)::integer);
    v_day:=coalesce(v_policy.cycle_anchor_day,extract(day from v_policy.effective_from)::integer);
  end if;

  v_year:=extract(year from p_reference_date)::integer;
  v_anchor:=private.safe_cycle_date(v_year,v_month,v_day);

  if v_anchor>p_reference_date then
    v_anchor:=private.safe_cycle_date(v_year-1,v_month,v_day);
  end if;

  if v_policy.cycle_basis='employment_anniversary'
     and v_anchor<v_employee.start_date then
    v_anchor:=v_employee.start_date;
  end if;

  cycle_start:=v_anchor;
  cycle_end:=(
    v_anchor
    + make_interval(months=>coalesce(v_policy.cycle_months,12))
    - interval '1 day'
  )::date;

  return next;
end;
$$;

revoke all on function private.resolve_leave_cycle(uuid,uuid,date)
from public,anon,authenticated;

create or replace function private.provision_employee_entitlements(
  p_employee_id uuid,
  p_actor_user_id uuid,
  p_opening_balances jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_employee public.employees%rowtype;
  v_policy record;
  v_reference_date date;
  v_cycle_start date;
  v_cycle_end date;
  v_entitlement_id uuid;
  v_quantity numeric(10,2);
  v_explicit boolean;
  v_results jsonb:='[]'::jsonb;
begin
  select * into v_employee
  from public.employees
  where id=p_employee_id;

  if v_employee.id is null then raise exception 'employee_not_found'; end if;

  v_reference_date:=greatest(current_date,v_employee.start_date);

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
    elsif v_policy.entitlement_method='fixed_days' then
      v_quantity:=coalesce(v_policy.entitlement_amount,0);
    else
      v_quantity:=0;
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

    if v_quantity<>0 and not exists(
      select 1
      from public.leave_ledger_entries l
      where l.entitlement_id=v_entitlement_id
        and l.entry_type in ('entitlement_granted','migration_opening_balance')
    ) then
      insert into public.leave_ledger_entries(
        organisation_id,employee_id,leave_type_id,entitlement_id,
        entry_type,quantity,effective_date,reason,source_metadata,created_by
      ) values(
        v_employee.organisation_id,v_employee.id,v_policy.leave_type_id,
        v_entitlement_id,
        case
          when v_explicit then 'migration_opening_balance'::public.ledger_entry_type
          else 'entitlement_granted'::public.ledger_entry_type
        end,
        v_quantity,
        greatest(v_employee.start_date,v_cycle_start,v_policy.effective_from),
        case
          when v_explicit then 'Administrator-confirmed opening balance'
          else 'Policy entitlement provisioned'
        end,
        jsonb_build_object(
          'source',case when v_explicit then 'admin_opening_balance' else 'policy_default' end,
          'policy_version_id',v_policy.id,
          'leave_type_code',v_policy.leave_type_code,
          'cycle_basis',v_policy.cycle_basis,
          'cycle_start',v_cycle_start,
          'cycle_end',v_cycle_end
        ),
        p_actor_user_id
      );
    end if;

    v_results:=v_results||jsonb_build_array(
      jsonb_build_object(
        'leave_type_code',v_policy.leave_type_code,
        'entitlement_id',v_entitlement_id,
        'cycle_start',v_cycle_start,
        'cycle_end',v_cycle_end,
        'opening_balance',v_quantity,
        'cycle_basis',v_policy.cycle_basis,
        'source',case when v_explicit then 'admin_opening_balance' else 'policy_default' end
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function private.provision_employee_entitlements(uuid,uuid,jsonb)
from public,anon,authenticated;

create or replace function private.configure_annual_leave_policy_v2(
  p_annual_days numeric,
  p_cycle_basis text,
  p_fixed_cycle_start_month integer,
  p_fixed_cycle_start_day integer,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
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
  if p_effective_from is null then raise exception 'effective_date_required'; end if;

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
          and current_date between le.cycle_start and le.cycle_end
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
$$;

revoke all on function private.configure_annual_leave_policy_v2(numeric,text,integer,integer,date)
from public,anon;
grant execute on function private.configure_annual_leave_policy_v2(numeric,text,integer,integer,date)
to authenticated;

create or replace function public.configure_annual_leave_policy_v2(
  p_annual_days numeric,
  p_cycle_basis text,
  p_fixed_cycle_start_month integer default null,
  p_fixed_cycle_start_day integer default null,
  p_effective_from date default current_date
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.configure_annual_leave_policy_v2(
    p_annual_days,
    p_cycle_basis,
    p_fixed_cycle_start_month,
    p_fixed_cycle_start_day,
    p_effective_from
  );
$$;

revoke execute on function public.configure_annual_leave_policy_v2(numeric,text,integer,integer,date)
from public,anon;
grant execute on function public.configure_annual_leave_policy_v2(numeric,text,integer,integer,date)
to authenticated;
