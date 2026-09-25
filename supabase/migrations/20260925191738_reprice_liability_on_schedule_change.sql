
create or replace function private.reprice_liability_after_condition_change()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_prior_schedule uuid;
  v_rem public.employee_remuneration_history%rowtype;
begin
  select ec.work_schedule_id into v_prior_schedule
  from public.employee_employment_conditions ec
  where ec.employee_id=new.employee_id
    and ec.effective_from<new.effective_from
  order by ec.effective_from desc
  limit 1;

  if v_prior_schedule is not null and v_prior_schedule=new.work_schedule_id then
    return new;
  end if;

  select r.* into v_rem
  from public.employee_remuneration_history r
  where r.employee_id=new.employee_id
    and r.effective_from<=new.effective_from
    and (r.effective_to is null or r.effective_to>=new.effective_from)
  order by r.effective_from desc
  limit 1;

  if v_rem.id is not null and auth.uid() is not null then
    perform public.set_employee_remuneration(
      new.employee_id,
      new.effective_from,
      v_rem.gross_amount,
      v_rem.pay_frequency,
      null,
      'Daily leave-liability rate recalculated after work schedule change'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists employment_condition_reprices_liability
on public.employee_employment_conditions;

create trigger employment_condition_reprices_liability
after insert or update of work_schedule_id
on public.employee_employment_conditions
for each row
execute function private.reprice_liability_after_condition_change();
