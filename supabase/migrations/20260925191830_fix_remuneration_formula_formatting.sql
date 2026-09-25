CREATE OR REPLACE FUNCTION public.set_employee_remuneration(p_employee_id uuid, p_effective_from date, p_gross_amount numeric, p_pay_frequency text, p_daily_rate_override numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
    v_method:=format('Annual remuneration / %s scheduled working days per year',round(v_annual_work_days,2));
  elsif p_pay_frequency='monthly' then
    v_daily:=(p_gross_amount*12)/v_annual_work_days;
    v_method:=format('(Monthly remuneration x 12) / %s scheduled working days per year',round(v_annual_work_days,2));
  elsif p_pay_frequency='weekly' then
    v_daily:=p_gross_amount/v_days_per_week;
    v_method:=format('Weekly remuneration / %s scheduled working days per week',round(v_days_per_week,2));
  elsif p_pay_frequency='daily' then
    v_daily:=p_gross_amount;
    v_method:='Daily remuneration used as daily liability rate';
  else
    v_daily:=p_gross_amount*v_avg_hours;
    v_method:=format('Hourly remuneration x %s average scheduled hours per working day',round(v_avg_hours,2));
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
$function$
