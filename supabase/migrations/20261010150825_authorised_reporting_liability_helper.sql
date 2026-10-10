-- The invoker-security liability view referenced a service-only public helper.
-- Use a private, bounded and role-checked helper without reopening that public RPC.
create function private.reporting_liability_scheduled_days(
  p_employee_id uuid,p_start_date date,p_end_date date
) returns numeric
language plpgsql stable security definer set search_path='' as $$
declare v_org_id uuid; v_count numeric;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_verified_email_identity(auth.uid()) then raise exception 'email_verification_required'; end if;
  select organisation_id into v_org_id from public.employees where id=p_employee_id;
  if v_org_id is null or not private.has_org_role(v_org_id,
    array['org_admin','hr_admin','reporter']::public.member_role[]) then
    raise exception 'not_authorised';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date
    or p_end_date-p_start_date>366 then raise exception 'invalid_liability_date_range'; end if;
  select count(*)::numeric into v_count
  from generate_series(p_start_date,p_end_date,interval '1 day') d(day)
  where private.scheduled_hours_for_employee(p_employee_id,d.day::date)>0;
  return coalesce(v_count,0);
end $$;
revoke all on function private.reporting_liability_scheduled_days(uuid,date,date) from public,anon;
grant execute on function private.reporting_liability_scheduled_days(uuid,date,date) to authenticated;

do $$
declare v_view text;
begin
  v_view := pg_catalog.pg_get_viewdef('public.employee_leave_liability_rates'::regclass,true);
  if position('public.liability_scheduled_days(' in v_view)=0 and position('liability_scheduled_days(' in v_view)=0 then
    raise exception 'liability_view_dependency_requires_review';
  end if;
  v_view := replace(v_view,'public.liability_scheduled_days(','private.reporting_liability_scheduled_days(');
  -- pg_get_viewdef may omit public when it is in the migration session search_path.
  if position('private.reporting_liability_scheduled_days(' in v_view)=0 then
    v_view := replace(v_view,'liability_scheduled_days(','private.reporting_liability_scheduled_days(');
  end if;
  execute 'create or replace view public.employee_leave_liability_rates with (security_invoker=true) as ' || v_view;
end $$;
