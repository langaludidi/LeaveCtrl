
create table public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  leave_type_id uuid references public.leave_types(id) on delete cascade,
  hard_block boolean not null default true,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index blocked_periods_org_dates_idx
  on public.blocked_periods(organisation_id,start_date,end_date);

alter table public.blocked_periods enable row level security;

create policy blocked_periods_member_read
on public.blocked_periods for select
using (private.is_org_member(organisation_id));

create table public.coverage_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  name text not null,
  minimum_available integer not null check (minimum_available >= 0),
  severity text not null default 'warning' check (severity in ('warning','block')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index coverage_rules_org_idx
  on public.coverage_rules(organisation_id,department_id,active);

alter table public.coverage_rules enable row level security;

create policy coverage_rules_member_read
on public.coverage_rules for select
using (private.is_org_member(organisation_id));

create table public.leave_request_coverage_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_id uuid not null references public.leave_requests(id) on delete cascade,
  rule_id uuid not null references public.coverage_rules(id) on delete cascade,
  leave_date date not null,
  available_after_request integer not null,
  minimum_required integer not null,
  outcome text not null check (outcome in ('ok','warning')),
  created_at timestamptz not null default now(),
  unique(request_id,rule_id,leave_date)
);

alter table public.leave_request_coverage_checks enable row level security;

create policy coverage_checks_member_read
on public.leave_request_coverage_checks for select
using (private.is_org_member(organisation_id));

create or replace function public.create_blocked_period(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_leave_type_id uuid default null,
  p_hard_block boolean default true,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_end_date < p_start_date then raise exception 'invalid_date_range'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'name_required'; end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;

  if p_leave_type_id is not null and not exists(
    select 1 from public.leave_types lt
    where lt.id=p_leave_type_id and lt.organisation_id=v_org_id
  ) then raise exception 'invalid_leave_type'; end if;

  insert into public.blocked_periods(
    organisation_id,name,start_date,end_date,leave_type_id,hard_block,reason,created_by
  ) values(
    v_org_id,btrim(p_name),p_start_date,p_end_date,p_leave_type_id,p_hard_block,
    nullif(btrim(p_reason),''),v_user_id
  ) returning id into v_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'blocked_period',v_id,'availability.blocked_period.created',
    jsonb_build_object('start_date',p_start_date,'end_date',p_end_date,'hard_block',p_hard_block)
  );

  return v_id;
end;
$$;

revoke execute on function public.create_blocked_period(text,date,date,uuid,boolean,text) from public,anon;
grant execute on function public.create_blocked_period(text,date,date,uuid,boolean,text) to authenticated;

create or replace function public.create_coverage_rule(
  p_name text,
  p_department_id uuid,
  p_minimum_available integer,
  p_severity text default 'warning'
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_minimum_available < 0 then raise exception 'invalid_minimum_available'; end if;
  if p_severity not in ('warning','block') then raise exception 'invalid_severity'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'name_required'; end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;

  if p_department_id is not null and not exists(
    select 1 from public.departments d
    where d.id=p_department_id and d.organisation_id=v_org_id and d.active
  ) then raise exception 'invalid_department'; end if;

  insert into public.coverage_rules(
    organisation_id,department_id,name,minimum_available,severity,created_by
  ) values(
    v_org_id,p_department_id,btrim(p_name),p_minimum_available,p_severity,v_user_id
  ) returning id into v_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'coverage_rule',v_id,'availability.coverage_rule.created',
    jsonb_build_object('department_id',p_department_id,'minimum_available',p_minimum_available,'severity',p_severity)
  );

  return v_id;
end;
$$;

revoke execute on function public.create_coverage_rule(text,uuid,integer,text) from public,anon;
grant execute on function public.create_coverage_rule(text,uuid,integer,text) to authenticated;

create or replace function public.submit_leave_request_v2(
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text default null,
  p_day_fraction numeric default 1
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
  v_department_id uuid;
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
  v_charge numeric(5,2);
  v_rule record;
  v_total_people integer;
  v_other_away integer;
  v_available_after integer;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_end_date < p_start_date then raise exception 'invalid_date_range'; end if;
  if p_day_fraction not in (0.5,1) then raise exception 'invalid_day_fraction'; end if;
  if p_day_fraction<>1 and p_start_date<>p_end_date then
    raise exception 'partial_day_requires_single_date';
  end if;

  select e.organisation_id,e.id,e.department_id
    into v_org_id,v_employee_id,v_department_id
  from public.employees e
  where e.user_id=v_user_id and e.employment_status='active'
  order by e.created_at limit 1;

  if v_employee_id is null then raise exception 'employee_profile_required'; end if;

  if exists(
    select 1 from public.blocked_periods bp
    where bp.organisation_id=v_org_id
      and bp.hard_block
      and daterange(bp.start_date,bp.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
      and (bp.leave_type_id is null or bp.leave_type_id=p_leave_type_id)
  ) then
    raise exception 'blocked_period';
  end if;

  if not exists(
    select 1 from public.leave_types lt
    where lt.id=p_leave_type_id and lt.organisation_id=v_org_id and lt.active
  ) then raise exception 'leave_type_not_available'; end if;

  select lpv.id,lpv.negative_balance_allowed
    into v_policy_id,v_negative_allowed
  from public.leave_policy_versions lpv
  where lpv.organisation_id=v_org_id
    and lpv.leave_type_id=p_leave_type_id
    and lpv.effective_from<=p_start_date
    and (lpv.effective_to is null or lpv.effective_to>=p_start_date)
  order by lpv.effective_from desc,lpv.version desc limit 1;

  if v_policy_id is null then raise exception 'leave_policy_not_configured'; end if;

  select lea.id into v_entitlement_id
  from public.leave_entitlements lea
  where lea.organisation_id=v_org_id
    and lea.employee_id=v_employee_id
    and lea.leave_type_id=p_leave_type_id
    and p_start_date between lea.cycle_start and lea.cycle_end
  order by lea.cycle_start desc limit 1;

  if v_entitlement_id is null then raise exception 'leave_entitlement_not_configured'; end if;

  select ws.* into v_schedule
  from public.employee_schedule_assignments esa
  join public.work_schedules ws on ws.id=esa.work_schedule_id
  where esa.employee_id=v_employee_id
    and esa.effective_from<=p_start_date
    and (esa.effective_to is null or esa.effective_to>=p_start_date)
  order by esa.effective_from desc limit 1;

  if v_schedule.id is null then raise exception 'work_schedule_not_configured'; end if;

  insert into public.leave_requests(
    organisation_id,employee_id,leave_type_id,policy_version_id,
    start_date,end_date,quantity,status,note,submitted_at
  ) values(
    v_org_id,v_employee_id,p_leave_type_id,v_policy_id,
    p_start_date,p_end_date,0,'pending_approval',nullif(btrim(p_note),''),now()
  ) returning id into v_request_id;

  v_date:=p_start_date;
  while v_date<=p_end_date loop
    v_hours:=case extract(isodow from v_date)::int
      when 1 then v_schedule.monday_hours
      when 2 then v_schedule.tuesday_hours
      when 3 then v_schedule.wednesday_hours
      when 4 then v_schedule.thursday_hours
      when 5 then v_schedule.friday_hours
      when 6 then v_schedule.saturday_hours
      when 7 then v_schedule.sunday_hours
    end;

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
          and (v_rule.department_id is null or e.department_id=v_rule.department_id);

        select count(distinct r.employee_id)::int into v_other_away
        from public.leave_requests r
        join public.employees e on e.id=r.employee_id
        where r.organisation_id=v_org_id
          and r.id<>v_request_id
          and r.status in ('approved','pending_approval','cancellation_requested')
          and r.start_date<=v_date and r.end_date>=v_date
          and (v_rule.department_id is null or e.department_id=v_rule.department_id);

        v_available_after:=greatest(v_total_people-v_other_away-1,0);

        if v_available_after < v_rule.minimum_available and v_rule.severity='block' then
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

  select coalesce(sum(quantity),0) into v_balance
  from public.leave_ledger_entries
  where organisation_id=v_org_id
    and employee_id=v_employee_id
    and leave_type_id=p_leave_type_id;

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
    'leave_reserved',-v_quantity,p_start_date,'Pending leave request reservation',
    jsonb_build_object('request_status','pending_approval','day_fraction',p_day_fraction),
    v_user_id
  );

  insert into public.approval_actions(
    organisation_id,request_id,actor_user_id,action,note
  ) values(v_org_id,v_request_id,v_user_id,'submitted',null);

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'leave_request',v_request_id,'leave.request.submitted',
    jsonb_build_object(
      'quantity',v_quantity,'start_date',p_start_date,'end_date',p_end_date,
      'day_fraction',p_day_fraction,
      'coverage_warnings',(
        select count(*) from public.leave_request_coverage_checks c
        where c.request_id=v_request_id and c.outcome='warning'
      )
    )
  );

  return v_request_id;
end;
$$;

revoke execute on function public.submit_leave_request_v2(uuid,date,date,text,numeric) from anon;
revoke execute on function public.submit_leave_request_v2(uuid,date,date,text,numeric) from public;
grant execute on function public.submit_leave_request_v2(uuid,date,date,text,numeric) to authenticated;
