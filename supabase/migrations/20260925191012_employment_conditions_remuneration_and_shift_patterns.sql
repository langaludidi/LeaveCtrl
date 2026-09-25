
alter table public.work_schedules
  add column if not exists schedule_kind text not null default 'weekly'
    check (schedule_kind in ('weekly','rotating')),
  add column if not exists cycle_anchor_date date,
  add column if not exists cycle_days jsonb;

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organisation_id,name)
);

alter table public.locations enable row level security;
create policy locations_member_read on public.locations
for select using (private.is_org_member(organisation_id));

create table public.employee_employment_conditions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  work_schedule_id uuid not null references public.work_schedules(id) on delete restrict,
  location_id uuid references public.locations(id) on delete set null,
  work_mode text not null default 'onsite'
    check (work_mode in ('onsite','hybrid','remote','field')),
  change_type text not null default 'baseline'
    check (change_type in ('baseline','transfer','schedule_change','work_mode_change','manager_change','combined_change')),
  reason text,
  effective_from date not null,
  effective_to date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique(employee_id,effective_from)
);

create index employee_conditions_effective_idx
  on public.employee_employment_conditions(employee_id,effective_from,effective_to);
create index employee_conditions_org_idx
  on public.employee_employment_conditions(organisation_id);

alter table public.employee_employment_conditions enable row level security;

create policy employment_conditions_visible
on public.employee_employment_conditions for select
using (
  private.is_self_employee(employee_id)
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role,'auditor'::public.member_role]
  )
);

create table public.employee_remuneration_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  pay_frequency text not null
    check (pay_frequency in ('annual','monthly','weekly','daily','hourly')),
  currency_code text not null default 'ZAR',
  liability_daily_rate numeric(14,4) not null check (liability_daily_rate >= 0),
  calculation_method text not null,
  reason text,
  effective_from date not null,
  effective_to date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique(employee_id,effective_from)
);

create index remuneration_employee_effective_idx
  on public.employee_remuneration_history(employee_id,effective_from,effective_to);
create index remuneration_org_idx
  on public.employee_remuneration_history(organisation_id);

alter table public.employee_remuneration_history enable row level security;

create policy remuneration_authorised_read
on public.employee_remuneration_history for select
using (
  private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role]
  )
);

create or replace function private.scheduled_hours_for_employee(
  p_employee_id uuid,
  p_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  v_schedule public.work_schedules%rowtype;
  v_anchor date;
  v_length integer;
  v_index integer;
begin
  select ws.*
    into v_schedule
  from public.employee_employment_conditions ec
  join public.work_schedules ws on ws.id=ec.work_schedule_id
  where ec.employee_id=p_employee_id
    and ec.effective_from<=p_date
    and (ec.effective_to is null or ec.effective_to>=p_date)
  order by ec.effective_from desc
  limit 1;

  if v_schedule.id is null then
    select ws.*
      into v_schedule
    from public.employee_schedule_assignments esa
    join public.work_schedules ws on ws.id=esa.work_schedule_id
    where esa.employee_id=p_employee_id
      and esa.effective_from<=p_date
      and (esa.effective_to is null or esa.effective_to>=p_date)
    order by esa.effective_from desc
    limit 1;
  end if;

  if v_schedule.id is null then return null; end if;

  if v_schedule.schedule_kind='rotating' then
    v_anchor:=coalesce(v_schedule.cycle_anchor_date,p_date);
    v_length:=coalesce(jsonb_array_length(v_schedule.cycle_days),0);
    if v_length<=0 then return 0; end if;
    v_index:=mod(mod((p_date-v_anchor),v_length)+v_length,v_length);
    return coalesce((v_schedule.cycle_days->>v_index)::numeric,0);
  end if;

  return case extract(isodow from p_date)::int
    when 1 then v_schedule.monday_hours
    when 2 then v_schedule.tuesday_hours
    when 3 then v_schedule.wednesday_hours
    when 4 then v_schedule.thursday_hours
    when 5 then v_schedule.friday_hours
    when 6 then v_schedule.saturday_hours
    when 7 then v_schedule.sunday_hours
  end;
end;
$$;

revoke all on function private.scheduled_hours_for_employee(uuid,date)
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
    where ec.employee_id=employee
      and ec.effective_from<=current_date
      and (ec.effective_to is null or ec.effective_to>=current_date)
      and manager.user_id=auth.uid()
      and manager.organisation_id=ec.organisation_id
      and manager.employment_status='active'
  )
  or exists (
    select 1
    from public.employees report
    join public.employees manager on manager.id=report.manager_employee_id
    where report.id=employee
      and not exists(
        select 1 from public.employee_employment_conditions ec
        where ec.employee_id=report.id
          and ec.effective_from<=current_date
          and (ec.effective_to is null or ec.effective_to>=current_date)
      )
      and manager.user_id=auth.uid()
      and manager.organisation_id=report.organisation_id
      and manager.employment_status='active'
  );
$$;

create or replace function private.capture_condition_from_schedule_assignment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.employee_employment_conditions(
    organisation_id,employee_id,department_id,manager_employee_id,work_schedule_id,
    work_mode,change_type,effective_from,effective_to,created_by
  )
  select
    e.organisation_id,e.id,e.department_id,e.manager_employee_id,new.work_schedule_id,
    'onsite','baseline',new.effective_from,new.effective_to,e.user_id
  from public.employees e
  where e.id=new.employee_id
  on conflict(employee_id,effective_from) do nothing;
  return new;
end;
$$;

drop trigger if exists employee_schedule_to_conditions
on public.employee_schedule_assignments;

create trigger employee_schedule_to_conditions
after insert on public.employee_schedule_assignments
for each row execute function private.capture_condition_from_schedule_assignment();

insert into public.employee_employment_conditions(
  organisation_id,employee_id,department_id,manager_employee_id,work_schedule_id,
  work_mode,change_type,effective_from,effective_to,created_by
)
select
  e.organisation_id,e.id,e.department_id,e.manager_employee_id,esa.work_schedule_id,
  'onsite','baseline',esa.effective_from,esa.effective_to,e.user_id
from public.employees e
join lateral (
  select x.*
  from public.employee_schedule_assignments x
  where x.employee_id=e.id
  order by x.effective_from
  limit 1
) esa on true
on conflict(employee_id,effective_from) do nothing;

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
where ec.effective_from<=current_date
  and (ec.effective_to is null or ec.effective_to>=current_date)
order by ec.employee_id,ec.effective_from desc;

grant select on public.employee_current_conditions to authenticated;

create or replace function public.create_location(
  p_name text,
  p_code text default null
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
  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id and m.is_active and m.role in ('org_admin','hr_admin')
  order by m.created_at limit 1;
  if v_org_id is null then raise exception 'not_authorised'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'location_name_required'; end if;

  insert into public.locations(organisation_id,name,code)
  values(v_org_id,btrim(p_name),nullif(upper(btrim(p_code)),''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_location(text,text) from public,anon;
grant execute on function public.create_location(text,text) to authenticated;

create or replace function public.create_rotating_shift_schedule(
  p_name text,
  p_anchor_date date,
  p_cycle_pattern text
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
  v_values numeric[];
  v_value numeric;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id and m.is_active and m.role in ('org_admin','hr_admin')
  order by m.created_at limit 1;
  if v_org_id is null then raise exception 'not_authorised'; end if;

  begin
    v_values:=string_to_array(regexp_replace(p_cycle_pattern,'\s','','g'),',')::numeric[];
  exception when others then
    raise exception 'invalid_shift_pattern';
  end;

  if array_length(v_values,1) is null or array_length(v_values,1)<2 or array_length(v_values,1)>35 then
    raise exception 'invalid_shift_cycle_length';
  end if;

  foreach v_value in array v_values loop
    if v_value<0 or v_value>24 then raise exception 'invalid_shift_hours'; end if;
  end loop;

  insert into public.work_schedules(
    organisation_id,name,schedule_kind,cycle_anchor_date,cycle_days,
    monday_hours,tuesday_hours,wednesday_hours,thursday_hours,friday_hours,saturday_hours,sunday_hours
  ) values(
    v_org_id,btrim(p_name),'rotating',p_anchor_date,to_jsonb(v_values),
    0,0,0,0,0,0,0
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_rotating_shift_schedule(text,date,text)
from public,anon;
grant execute on function public.create_rotating_shift_schedule(text,date,text)
to authenticated;

create or replace function public.apply_employee_condition_change(
  p_employee_id uuid,
  p_effective_from date,
  p_department_id uuid,
  p_manager_employee_id uuid,
  p_work_schedule_id uuid,
  p_location_id uuid default null,
  p_work_mode text default 'onsite',
  p_change_type text default 'combined_change',
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

  if p_effective_from<=current_date and (v_next is null or v_next>current_date) then
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
$$;

revoke execute on function public.apply_employee_condition_change(uuid,date,uuid,uuid,uuid,uuid,text,text,text)
from public,anon;
grant execute on function public.apply_employee_condition_change(uuid,date,uuid,uuid,uuid,uuid,text,text,text)
to authenticated;

create or replace function public.set_employee_remuneration(
  p_employee_id uuid,
  p_effective_from date,
  p_gross_amount numeric,
  p_pay_frequency text,
  p_daily_rate_override numeric default null,
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
  v_currency text;
  v_schedule public.work_schedules%rowtype;
  v_days_per_week numeric;
  v_work_days integer;
  v_total_hours numeric;
  v_cycle_len integer;
  v_annual_work_days numeric;
  v_avg_hours numeric;
  v_daily numeric;
  v_method text;
  v_next date;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_gross_amount<0 then raise exception 'invalid_remuneration'; end if;
  if p_pay_frequency not in ('annual','monthly','weekly','daily','hourly') then
    raise exception 'invalid_pay_frequency';
  end if;

  select e.organisation_id,o.currency_code
  into v_org_id,v_currency
  from public.employees e
  join public.organisations o on o.id=e.organisation_id
  where e.id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then raise exception 'not_authorised'; end if;

  select ws.* into v_schedule
  from public.employee_employment_conditions ec
  join public.work_schedules ws on ws.id=ec.work_schedule_id
  where ec.employee_id=p_employee_id
    and ec.effective_from<=p_effective_from
    and (ec.effective_to is null or ec.effective_to>=p_effective_from)
  order by ec.effective_from desc limit 1;

  if v_schedule.id is null then
    select ws.* into v_schedule
    from public.employee_schedule_assignments esa
    join public.work_schedules ws on ws.id=esa.work_schedule_id
    where esa.employee_id=p_employee_id
      and esa.effective_from<=p_effective_from
      and (esa.effective_to is null or esa.effective_to>=p_effective_from)
    order by esa.effective_from desc limit 1;
  end if;

  if v_schedule.id is null then raise exception 'work_schedule_not_configured'; end if;

  if v_schedule.schedule_kind='rotating' then
    v_cycle_len:=jsonb_array_length(v_schedule.cycle_days);
    select count(*)::int,coalesce(sum(value::numeric),0)
      into v_work_days,v_total_hours
    from jsonb_array_elements_text(v_schedule.cycle_days)
    where value::numeric>0;
    if v_cycle_len<=0 or v_work_days<=0 then raise exception 'invalid_work_schedule'; end if;
    v_annual_work_days:=365.25*v_work_days/v_cycle_len;
    v_days_per_week:=7.0*v_work_days/v_cycle_len;
    v_avg_hours:=v_total_hours/v_work_days;
  else
    v_days_per_week :=
      (case when v_schedule.monday_hours>0 then 1 else 0 end)+
      (case when v_schedule.tuesday_hours>0 then 1 else 0 end)+
      (case when v_schedule.wednesday_hours>0 then 1 else 0 end)+
      (case when v_schedule.thursday_hours>0 then 1 else 0 end)+
      (case when v_schedule.friday_hours>0 then 1 else 0 end)+
      (case when v_schedule.saturday_hours>0 then 1 else 0 end)+
      (case when v_schedule.sunday_hours>0 then 1 else 0 end);
    if v_days_per_week<=0 then raise exception 'invalid_work_schedule'; end if;
    v_total_hours:=v_schedule.monday_hours+v_schedule.tuesday_hours+
      v_schedule.wednesday_hours+v_schedule.thursday_hours+v_schedule.friday_hours+
      v_schedule.saturday_hours+v_schedule.sunday_hours;
    v_avg_hours:=v_total_hours/v_days_per_week;
    v_annual_work_days:=365.25*v_days_per_week/7.0;
  end if;

  if p_daily_rate_override is not null then
    if p_daily_rate_override<0 then raise exception 'invalid_daily_rate'; end if;
    v_daily:=p_daily_rate_override;
    v_method:='Administrator-supplied daily liability rate';
  elsif p_pay_frequency='annual' then
    v_daily:=p_gross_amount/v_annual_work_days;
    v_method:=format('Annual remuneration / %.2f scheduled working days per year',v_annual_work_days);
  elsif p_pay_frequency='monthly' then
    v_daily:=(p_gross_amount*12)/v_annual_work_days;
    v_method:=format('(Monthly remuneration x 12) / %.2f scheduled working days per year',v_annual_work_days);
  elsif p_pay_frequency='weekly' then
    v_daily:=p_gross_amount/v_days_per_week;
    v_method:=format('Weekly remuneration / %.2f scheduled working days per week',v_days_per_week);
  elsif p_pay_frequency='daily' then
    v_daily:=p_gross_amount;
    v_method:='Daily remuneration used as daily liability rate';
  else
    v_daily:=p_gross_amount*v_avg_hours;
    v_method:=format('Hourly remuneration x %.2f average scheduled hours per working day',v_avg_hours);
  end if;

  select min(r.effective_from) into v_next
  from public.employee_remuneration_history r
  where r.employee_id=p_employee_id and r.effective_from>p_effective_from;

  update public.employee_remuneration_history
  set effective_to=p_effective_from-1
  where employee_id=p_employee_id
    and effective_from<p_effective_from
    and (effective_to is null or effective_to>=p_effective_from);

  insert into public.employee_remuneration_history(
    organisation_id,employee_id,gross_amount,pay_frequency,currency_code,
    liability_daily_rate,calculation_method,reason,effective_from,effective_to,created_by
  ) values(
    v_org_id,p_employee_id,p_gross_amount,p_pay_frequency,v_currency,
    round(v_daily,4),v_method,nullif(btrim(p_reason),''),
    p_effective_from,case when v_next is null then null else v_next-1 end,v_user_id
  )
  on conflict(employee_id,effective_from) do update set
    gross_amount=excluded.gross_amount,
    pay_frequency=excluded.pay_frequency,
    currency_code=excluded.currency_code,
    liability_daily_rate=excluded.liability_daily_rate,
    calculation_method=excluded.calculation_method,
    reason=excluded.reason,
    effective_to=excluded.effective_to,
    created_by=excluded.created_by
  returning id into v_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'employee',p_employee_id,'employee.remuneration.changed',
    jsonb_build_object(
      'effective_from',p_effective_from,
      'pay_frequency',p_pay_frequency,
      'currency_code',v_currency,
      'daily_rate_calculated',round(v_daily,4)
    )
  );

  return v_id;
end;
$$;

revoke execute on function public.set_employee_remuneration(uuid,date,numeric,text,numeric,text)
from public,anon;
grant execute on function public.set_employee_remuneration(uuid,date,numeric,text,numeric,text)
to authenticated;
