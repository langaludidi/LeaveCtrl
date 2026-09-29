-- LeaveCtrl release assurance: make the authenticated SECURITY DEFINER surface explicit.
-- Supabase lint 0029 will continue to report the allowlisted RPCs because they are
-- intentionally exposed privileged workflow endpoints. This migration prevents
-- implicit exposure, revokes browser execution from every non-allowlisted
-- SECURITY DEFINER function in public, and fails if an allowlisted endpoint loses
-- its authentication/search_path guard.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

do $$
declare
  allowed_names constant text[] := array[
    'add_employee_record',
    'adjust_manual_leave_allocation',
    'adjust_toil_balance',
    'apply_employee_condition_change',
    'assign_employee_department',
    'assign_employee_manager',
    'assign_employee_schedule',
    'bootstrap_organisation',
    'claim_employee_invitation',
    'configure_employer_leave_type',
    'configure_initial_leave_policy',
    'create_blocked_period',
    'create_coverage_rule',
    'create_department',
    'create_employee_invitation',
    'create_location',
    'create_rotating_shift_schedule',
    'create_work_schedule',
    'decide_leave_cancellation',
    'decide_leave_request',
    'decide_toil_cancellation',
    'decide_toil_request',
    'exit_employee',
    'get_workforce_calendar',
    'get_workforce_directory',
    'prepare_employee_access_invitation',
    'record_organisation_data_export',
    'record_overtime_event',
    'record_variable_earning',
    'request_leave_cancellation',
    'request_toil_cancellation',
    'set_employee_opening_balance',
    'set_employee_remuneration',
    'submit_leave_request_v2',
    'submit_toil_request',
    'update_overtime_settings',
    'withdraw_leave_request',
    'withdraw_toil_request'
  ];
  fn record;
  expected_name text;
  matching_count integer;
begin
  for fn in
    select
      p.oid,
      p.proname,
      coalesce(array_to_string(p.proconfig, ','), '') as config_text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      fn.oid::regprocedure
    );

    if fn.proname = any(allowed_names) then
      if position('auth.uid' in lower(pg_get_functiondef(fn.oid))) = 0 then
        raise exception
          'security_definer_contract_missing_auth_uid:%',
          fn.oid::regprocedure;
      end if;

      if position('search_path' in lower(fn.config_text)) = 0 then
        raise exception
          'security_definer_contract_missing_search_path:%',
          fn.oid::regprocedure;
      end if;

      execute format(
        'grant execute on function %s to authenticated',
        fn.oid::regprocedure
      );
    else
      execute format(
        'revoke execute on function %s from authenticated',
        fn.oid::regprocedure
      );
    end if;
  end loop;

  foreach expected_name in array allowed_names
  loop
    select count(*)
      into matching_count
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = expected_name;

    if matching_count <> 1 then
      raise exception
        'security_definer_contract_expected_exactly_one:%:%',
        expected_name,
        matching_count;
    end if;
  end loop;
end
$$;
