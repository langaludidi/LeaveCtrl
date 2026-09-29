-- LeaveCtrl P0 reconciliation.
-- This migration already exists in the authoritative Supabase migration history.
-- It is recorded here to restore repository/deployed migration parity.

create or replace function public.import_employee_core_v1(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_start_date date,
  p_employee_number text default null,
  p_department_id uuid default null,
  p_manager_employee_id uuid default null,
  p_work_schedule_id uuid default null,
  p_opening_annual_balance numeric default null,
  p_gross_amount numeric default null,
  p_pay_frequency text default 'monthly',
  p_grant_manager_role boolean default false,
  p_prepare_invitation boolean default true
)
returns jsonb
language plpgsql
set search_path to 'public','private'
as $function$
declare
  v_created jsonb;
  v_employee_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  v_created:=public.add_employee_record(
    p_email,
    p_first_name,
    p_last_name,
    p_start_date,
    p_employee_number,
    p_department_id,
    p_manager_employee_id,
    p_work_schedule_id,
    p_grant_manager_role,
    false
  );

  v_employee_id:=nullif(v_created->>'employee_id','')::uuid;
  if v_employee_id is null then
    raise exception 'employee_creation_failed';
  end if;

  if p_opening_annual_balance is not null then
    perform public.set_employee_opening_balance(
      v_employee_id,
      'ANNUAL',
      p_opening_annual_balance,
      'Opening annual leave balance confirmed by CSV import'
    );
  end if;

  if p_gross_amount is not null then
    perform public.set_employee_remuneration(
      v_employee_id,
      p_start_date,
      p_gross_amount,
      p_pay_frequency,
      null,
      'Remuneration captured by CSV import'
    );
  end if;

  if p_prepare_invitation then
    v_token:=public.prepare_employee_access_invitation(
      v_employee_id,
      p_grant_manager_role
    );
  end if;

  return jsonb_build_object(
    'employee_id',v_employee_id,
    'invitation_token',v_token
  );
end;
$function$;

revoke all on function public.import_employee_core_v1(
  text,text,text,date,text,uuid,uuid,uuid,numeric,numeric,text,boolean,boolean
) from public, anon;

grant execute on function public.import_employee_core_v1(
  text,text,text,date,text,uuid,uuid,uuid,numeric,numeric,text,boolean,boolean
) to authenticated, service_role;
