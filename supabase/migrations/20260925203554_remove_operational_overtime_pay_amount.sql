
update public.overtime_events
set paid_amount=null
where paid_amount is not null;

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
    include_in_leave_liability,note,status,approved_by,approved_at,created_by
  ) values(
    v_org_id,p_employee_id,p_work_date,p_hours,p_treatment,p_multiplier,
    p_include_in_leave_liability,nullif(btrim(p_note),''),
    'approved',v_user_id,now(),v_user_id
  )
  returning id into v_event_id;

  if p_treatment='paid' then
    insert into public.overtime_event_payments(
      overtime_event_id,organisation_id,employee_id,amount,currency_code
    ) values(
      v_event_id,v_org_id,p_employee_id,p_paid_amount,v_currency
    );

    insert into public.employee_variable_earnings(
      organisation_id,employee_id,earning_date,category,amount,currency_code,
      include_in_leave_liability,source_type,source_overtime_event_id,note,created_by
    ) values(
      v_org_id,p_employee_id,p_work_date,'overtime',p_paid_amount,v_currency,
      p_include_in_leave_liability,'overtime_event',v_event_id,
      'Paid overtime',v_user_id
    );
  else
    v_toil_hours:=round(p_hours*p_multiplier,2);

    insert into public.toil_ledger_entries(
      organisation_id,employee_id,overtime_event_id,entry_type,hours,
      effective_date,expires_on,reason,created_by
    ) values(
      v_org_id,p_employee_id,v_event_id,'earned',v_toil_hours,
      p_work_date,null,
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
      'include_in_leave_liability',p_include_in_leave_liability
    )
  );

  return v_event_id;
end;
$$;

alter table public.overtime_events
  drop column paid_amount;
