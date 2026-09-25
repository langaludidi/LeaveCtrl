create index if not exists approval_actions_actor_user_id_idx on public.approval_actions(actor_user_id);
create index if not exists approval_actions_organisation_id_idx on public.approval_actions(organisation_id);
create index if not exists approval_actions_request_id_idx on public.approval_actions(request_id);

create index if not exists audit_events_actor_user_id_idx on public.audit_events(actor_user_id);

create index if not exists departments_manager_employee_id_idx on public.departments(manager_employee_id);

create index if not exists employee_schedule_assignments_employee_id_idx on public.employee_schedule_assignments(employee_id);
create index if not exists employee_schedule_assignments_organisation_id_idx on public.employee_schedule_assignments(organisation_id);
create index if not exists employee_schedule_assignments_work_schedule_id_idx on public.employee_schedule_assignments(work_schedule_id);

create index if not exists employees_department_id_idx on public.employees(department_id);
create index if not exists employees_manager_employee_id_idx on public.employees(manager_employee_id);

create index if not exists leave_entitlements_leave_type_id_idx on public.leave_entitlements(leave_type_id);
create index if not exists leave_entitlements_organisation_id_idx on public.leave_entitlements(organisation_id);
create index if not exists leave_entitlements_policy_version_id_idx on public.leave_entitlements(policy_version_id);

create index if not exists leave_ledger_entries_created_by_idx on public.leave_ledger_entries(created_by);
create index if not exists leave_ledger_entries_employee_id_idx on public.leave_ledger_entries(employee_id);
create index if not exists leave_ledger_entries_entitlement_id_idx on public.leave_ledger_entries(entitlement_id);
create index if not exists leave_ledger_entries_leave_type_id_idx on public.leave_ledger_entries(leave_type_id);
create index if not exists leave_ledger_entries_request_id_idx on public.leave_ledger_entries(request_id);

create index if not exists leave_policy_versions_leave_type_id_idx on public.leave_policy_versions(leave_type_id);

create index if not exists leave_request_days_organisation_id_idx on public.leave_request_days(organisation_id);

create index if not exists leave_requests_decided_by_idx on public.leave_requests(decided_by);
create index if not exists leave_requests_employee_id_idx on public.leave_requests(employee_id);
create index if not exists leave_requests_leave_type_id_idx on public.leave_requests(leave_type_id);
create index if not exists leave_requests_policy_version_id_idx on public.leave_requests(policy_version_id);
