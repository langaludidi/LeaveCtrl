-- LeaveCtrl V1: one-time contextual onboarding for newly invited employees.

alter table public.employees
  add column if not exists welcome_completed_at timestamptz;

create or replace function public.complete_employee_welcome()
returns timestamptz
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  update public.employees e
  set welcome_completed_at = coalesce(e.welcome_completed_at, now()),
      updated_at = case
        when e.welcome_completed_at is null then now()
        else e.updated_at
      end
  where e.user_id = v_user_id
    and e.employment_status = 'active'
  returning e.welcome_completed_at into v_completed_at;

  if v_completed_at is null then
    raise exception 'employee_profile_required';
  end if;

  return v_completed_at;
end;
$function$;

revoke all on function public.complete_employee_welcome() from public, anon;
grant execute on function public.complete_employee_welcome() to authenticated;
