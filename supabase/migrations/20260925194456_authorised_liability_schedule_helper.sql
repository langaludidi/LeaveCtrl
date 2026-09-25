
create or replace function public.liability_scheduled_days(
  p_employee_id uuid,
  p_start_date date,
  p_end_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  v_org_id uuid;
  v_count numeric;
begin
  select organisation_id into v_org_id
  from public.employees
  where id=p_employee_id;

  if v_org_id is null then raise exception 'employee_not_found'; end if;

  if not private.has_org_role(
    v_org_id,
    array[
      'org_admin'::public.member_role,
      'hr_admin'::public.member_role,
      'reporter'::public.member_role
    ]
  ) then
    raise exception 'not_authorised';
  end if;

  select count(*)::numeric into v_count
  from generate_series(p_start_date,p_end_date,interval '1 day') d(day)
  where private.scheduled_hours_for_employee(p_employee_id,d.day::date)>0;

  return coalesce(v_count,0);
end;
$$;

revoke execute on function public.liability_scheduled_days(uuid,date,date)
from public,anon;
grant execute on function public.liability_scheduled_days(uuid,date,date)
to authenticated;

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
          and (ve.category<>'overtime' or p.include_paid_overtime)
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
    public.liability_scheduled_days(
      p.employee_id,p.averaging_start,p.averaging_end
    ) as scheduled_days
  from periods p
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
    case
      when w.scheduled_days>0 then v.variable_earnings_total/w.scheduled_days
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
