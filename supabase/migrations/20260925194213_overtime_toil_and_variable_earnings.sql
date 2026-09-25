
create table public.overtime_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  enabled boolean not null default true,
  default_treatment text not null default 'paid'
    check (default_treatment in ('paid','toil','choice')),
  default_multiplier numeric(6,3) not null default 1.5
    check (default_multiplier > 0),
  toil_expiry_days integer
    check (toil_expiry_days is null or toil_expiry_days > 0),
  liability_averaging_weeks integer not null default 13
    check (liability_averaging_weeks between 1 and 52),
  include_paid_overtime_in_liability boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.overtime_settings enable row level security;

create policy overtime_settings_member_read
on public.overtime_settings for select
using (private.is_org_member(organisation_id));

create table public.overtime_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  hours numeric(8,2) not null check (hours > 0 and hours <= 24),
  treatment text not null check (treatment in ('paid','toil')),
  multiplier numeric(6,3) not null default 1.5 check (multiplier > 0),
  paid_amount numeric(14,2) check (paid_amount is null or paid_amount >= 0),
  include_in_leave_liability boolean not null default true,
  note text,
  status text not null default 'approved'
    check (status in ('pending','approved','declined','reversed')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index overtime_events_employee_date_idx
  on public.overtime_events(employee_id,work_date);
create index overtime_events_org_status_idx
  on public.overtime_events(organisation_id,status);

alter table public.overtime_events enable row level security;

create policy overtime_events_authorised_read
on public.overtime_events for select
using (
  private.is_self_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array[
      'manager'::public.member_role,
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'reporter'::public.member_role,
      'auditor'::public.member_role
    ]
  )
);

create table public.employee_variable_earnings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  earning_date date not null,
  category text not null
    check (category in ('overtime','allowance','commission','bonus','shift_allowance','other')),
  amount numeric(14,2) not null check (amount >= 0),
  currency_code text not null default 'ZAR',
  include_in_leave_liability boolean not null default true,
  source_type text not null default 'manual'
    check (source_type in ('manual','overtime_event','payroll_import','integration')),
  source_overtime_event_id uuid references public.overtime_events(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index variable_earnings_employee_date_idx
  on public.employee_variable_earnings(employee_id,earning_date);
create index variable_earnings_org_idx
  on public.employee_variable_earnings(organisation_id);

alter table public.employee_variable_earnings enable row level security;

create policy variable_earnings_confidential_read
on public.employee_variable_earnings for select
using (
  private.has_org_role(
    organisation_id,
    array[
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'reporter'::public.member_role
    ]
  )
);

create table public.toil_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  overtime_event_id uuid references public.overtime_events(id) on delete set null,
  entry_type text not null check (entry_type in ('earned','used','expired','adjustment','reversed')),
  hours numeric(10,2) not null check (hours <> 0),
  effective_date date not null,
  expires_on date,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index toil_ledger_employee_date_idx
  on public.toil_ledger_entries(employee_id,effective_date);

alter table public.toil_ledger_entries enable row level security;

create policy toil_ledger_visible
on public.toil_ledger_entries for select
using (
  private.is_self_employee(employee_id)
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array[
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'reporter'::public.member_role,
      'auditor'::public.member_role
    ]
  )
);

create or replace view public.toil_balances
with (security_invoker=true)
as
select
  organisation_id,
  employee_id,
  coalesce(sum(hours),0)::numeric(10,2) as available_hours
from public.toil_ledger_entries
group by organisation_id,employee_id;

grant select on public.toil_balances to authenticated;

insert into public.overtime_settings(organisation_id)
select id
from public.organisations
on conflict (organisation_id) do nothing;

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

  insert into public.overtime_settings(
    organisation_id,default_treatment,default_multiplier,toil_expiry_days,
    liability_averaging_weeks,include_paid_overtime_in_liability,updated_by,updated_at
  ) values(
    v_org_id,p_default_treatment,p_default_multiplier,p_toil_expiry_days,
    p_liability_averaging_weeks,p_include_paid_overtime_in_liability,v_user_id,now()
  )
  on conflict(organisation_id) do update set
    default_treatment=excluded.default_treatment,
    default_multiplier=excluded.default_multiplier,
    toil_expiry_days=excluded.toil_expiry_days,
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
      'toil_expiry_days',p_toil_expiry_days,
      'liability_averaging_weeks',p_liability_averaging_weeks,
      'include_paid_overtime_in_liability',p_include_paid_overtime_in_liability
    )
  );
end;
$$;

revoke execute on function public.update_overtime_settings(text,numeric,integer,integer,boolean)
from public,anon;
grant execute on function public.update_overtime_settings(text,numeric,integer,integer,boolean)
to authenticated;

create or replace function public.record_overtime_event(
  p_employee_id uuid,
  p_work_date date,
  p_hours numeric,
  p_treatment text,
  p_multiplier numeric default 1.5,
  p_paid_amount numeric default null,
  p_include_in_leave_liability boolean default true,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_event_id uuid;
  v_expiry_days integer;
  v_toil_hours numeric(10,2);
  v_currency text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_hours<=0 or p_hours>24 then raise exception 'invalid_overtime_hours'; end if;
  if p_treatment not in ('paid','toil') then raise exception 'invalid_overtime_treatment'; end if;
  if p_multiplier<=0 then raise exception 'invalid_multiplier'; end if;
  if p_treatment='paid' and p_paid_amount is null then
    raise exception 'paid_overtime_amount_required';
  end if;

  select e.organisation_id,o.currency_code
    into v_org_id,v_currency
  from public.employees e
  join public.organisations o on o.id=e.organisation_id
  where e.id=p_employee_id and e.employment_status='active';

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then raise exception 'not_authorised'; end if;

  insert into public.overtime_events(
    organisation_id,employee_id,work_date,hours,treatment,multiplier,
    paid_amount,include_in_leave_liability,note,status,approved_by,approved_at,created_by
  ) values(
    v_org_id,p_employee_id,p_work_date,p_hours,p_treatment,p_multiplier,
    p_paid_amount,p_include_in_leave_liability,nullif(btrim(p_note),''),
    'approved',v_user_id,now(),v_user_id
  )
  returning id into v_event_id;

  if p_treatment='paid' then
    insert into public.employee_variable_earnings(
      organisation_id,employee_id,earning_date,category,amount,currency_code,
      include_in_leave_liability,source_type,source_overtime_event_id,note,created_by
    ) values(
      v_org_id,p_employee_id,p_work_date,'overtime',p_paid_amount,v_currency,
      p_include_in_leave_liability,'overtime_event',v_event_id,
      'Paid overtime',v_user_id
    );
  else
    select os.toil_expiry_days into v_expiry_days
    from public.overtime_settings os
    where os.organisation_id=v_org_id;

    v_toil_hours:=round(p_hours*p_multiplier,2);

    insert into public.toil_ledger_entries(
      organisation_id,employee_id,overtime_event_id,entry_type,hours,
      effective_date,expires_on,reason,created_by
    ) values(
      v_org_id,p_employee_id,v_event_id,'earned',v_toil_hours,
      p_work_date,
      case when v_expiry_days is null then null else p_work_date+v_expiry_days end,
      format('TOIL earned from %s overtime hours at %sx',p_hours,p_multiplier),
      v_user_id
    );
  end if;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'overtime_event',v_event_id,'overtime.recorded',
    jsonb_build_object(
      'employee_id',p_employee_id,
      'work_date',p_work_date,
      'hours',p_hours,
      'treatment',p_treatment,
      'multiplier',p_multiplier,
      'paid_amount',p_paid_amount,
      'include_in_leave_liability',p_include_in_leave_liability
    )
  );

  return v_event_id;
end;
$$;

revoke execute on function public.record_overtime_event(uuid,date,numeric,text,numeric,numeric,boolean,text)
from public,anon;
grant execute on function public.record_overtime_event(uuid,date,numeric,text,numeric,numeric,boolean,text)
to authenticated;

create or replace function public.record_variable_earning(
  p_employee_id uuid,
  p_earning_date date,
  p_category text,
  p_amount numeric,
  p_include_in_leave_liability boolean default true,
  p_note text default null
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
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_category not in ('allowance','commission','bonus','shift_allowance','other') then
    raise exception 'invalid_earning_category';
  end if;
  if p_amount<0 then raise exception 'invalid_earning_amount'; end if;

  select e.organisation_id,o.currency_code
    into v_org_id,v_currency
  from public.employees e
  join public.organisations o on o.id=e.organisation_id
  where e.id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then raise exception 'not_authorised'; end if;

  insert into public.employee_variable_earnings(
    organisation_id,employee_id,earning_date,category,amount,currency_code,
    include_in_leave_liability,source_type,note,created_by
  ) values(
    v_org_id,p_employee_id,p_earning_date,p_category,p_amount,v_currency,
    p_include_in_leave_liability,'manual',nullif(btrim(p_note),''),v_user_id
  )
  returning id into v_id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'variable_earning',v_id,'remuneration.variable_earning.recorded',
    jsonb_build_object(
      'employee_id',p_employee_id,
      'earning_date',p_earning_date,
      'category',p_category,
      'amount',p_amount,
      'include_in_leave_liability',p_include_in_leave_liability
    )
  );

  return v_id;
end;
$$;

revoke execute on function public.record_variable_earning(uuid,date,text,numeric,boolean,text)
from public,anon;
grant execute on function public.record_variable_earning(uuid,date,text,numeric,boolean,text)
to authenticated;

create or replace function public.adjust_toil_balance(
  p_employee_id uuid,
  p_hours numeric,
  p_reason text
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
  if p_hours=0 then raise exception 'adjustment_cannot_be_zero'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;

  select organisation_id into v_org_id
  from public.employees where id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  ) then raise exception 'not_authorised'; end if;

  insert into public.toil_ledger_entries(
    organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
  ) values(
    v_org_id,p_employee_id,'adjustment',p_hours,current_date,btrim(p_reason),v_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.adjust_toil_balance(uuid,numeric,text) from public,anon;
grant execute on function public.adjust_toil_balance(uuid,numeric,text) to authenticated;

create or replace view public.employee_leave_liability_rates
with (security_invoker=true)
as
with current_rem as (
  select distinct on (r.employee_id)
    r.organisation_id,
    r.employee_id,
    r.currency_code,
    r.liability_daily_rate as base_daily_rate,
    r.calculation_method as base_calculation_method
  from public.employee_remuneration_history r
  where r.effective_from<=current_date
    and (r.effective_to is null or r.effective_to>=current_date)
  order by r.employee_id,r.effective_from desc
),
settings as (
  select
    o.id as organisation_id,
    coalesce(os.liability_averaging_weeks,13) as averaging_weeks,
    coalesce(os.include_paid_overtime_in_liability,true) as include_paid_overtime
  from public.organisations o
  left join public.overtime_settings os on os.organisation_id=o.id
),
periods as (
  select
    cr.organisation_id,
    cr.employee_id,
    cr.currency_code,
    cr.base_daily_rate,
    cr.base_calculation_method,
    s.averaging_weeks,
    s.include_paid_overtime,
    current_date-(s.averaging_weeks*7-1) as averaging_start,
    current_date as averaging_end
  from current_rem cr
  join settings s on s.organisation_id=cr.organisation_id
),
variable as (
  select
    p.employee_id,
    coalesce(sum(
      case
        when ve.include_in_leave_liability
          and (
            ve.category<>'overtime'
            or p.include_paid_overtime
          )
        then ve.amount
        else 0
      end
    ),0)::numeric(14,2) as variable_earnings_total
  from periods p
  left join public.employee_variable_earnings ve
    on ve.employee_id=p.employee_id
   and ve.earning_date between p.averaging_start and p.averaging_end
  group by p.employee_id
),
workdays as (
  select
    p.employee_id,
    count(*) filter(
      where private.scheduled_hours_for_employee(p.employee_id,d.day::date)>0
    )::numeric as scheduled_days
  from periods p
  cross join lateral generate_series(
    p.averaging_start,p.averaging_end,interval '1 day'
  ) d(day)
  group by p.employee_id
)
select
  p.organisation_id,
  p.employee_id,
  p.currency_code,
  p.base_daily_rate,
  v.variable_earnings_total,
  p.averaging_weeks,
  p.averaging_start,
  p.averaging_end,
  w.scheduled_days,
  case
    when w.scheduled_days>0
      then round(v.variable_earnings_total/w.scheduled_days,4)
    else 0
  end as variable_daily_rate,
  round(
    p.base_daily_rate+
    case when w.scheduled_days>0
      then v.variable_earnings_total/w.scheduled_days
      else 0
    end
  ,4) as effective_daily_rate,
  p.base_calculation_method,
  format(
    'Base daily rate + includable variable earnings over %s weeks / %s scheduled working days',
    p.averaging_weeks,
    coalesce(w.scheduled_days,0)
  ) as liability_calculation_method
from periods p
join variable v on v.employee_id=p.employee_id
join workdays w on w.employee_id=p.employee_id;

grant select on public.employee_leave_liability_rates to authenticated;
