
create or replace function public.configure_employer_leave_type(
  p_code text,
  p_name text,
  p_entitlement_days numeric,
  p_cycle_basis text default 'employment_anniversary',
  p_cycle_months integer default 12,
  p_colour_token text default 'slate',
  p_effective_from date default null
)
returns uuid
language plpgsql
security definer
set search_path='public','private'
as $$
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
  if v_code in ('ANNUAL','SICK','FAMILY_RESPONSIBILITY','PARENTAL_INTERIM','TOIL') then
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
$$;

revoke execute on function public.configure_employer_leave_type(
  text,text,numeric,text,integer,text,date
) from public,anon;
grant execute on function public.configure_employer_leave_type(
  text,text,numeric,text,integer,text,date
) to authenticated;
