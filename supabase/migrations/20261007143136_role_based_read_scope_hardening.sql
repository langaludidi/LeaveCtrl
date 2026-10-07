-- Final role-based UAT hardening.
-- Managers may read self + employees they actually manage, not organisation-wide
-- employee/request/ledger detail. HR/Admin/Reporter/Auditor retain governed
-- organisation-wide read visibility where appropriate.

drop policy if exists entitlements_read on public.leave_entitlements;
create policy entitlements_read
on public.leave_entitlements
for select
to authenticated
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

drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read
on public.leave_requests
for select
to authenticated
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

drop policy if exists request_days_read on public.leave_request_days;
create policy request_days_read
on public.leave_request_days
for select
to authenticated
using (
  exists (
    select 1
    from public.leave_requests r
    where r.id=request_id
      and (
        private.is_self_employee(r.employee_id)
        or private.manages_employee(r.employee_id)
        or private.has_org_role(
          r.organisation_id,
          array[
            'hr_admin'::public.member_role,
            'org_admin'::public.member_role,
            'reporter'::public.member_role,
            'auditor'::public.member_role
          ]
        )
      )
  )
);

drop policy if exists ledger_read on public.leave_ledger_entries;
create policy ledger_read
on public.leave_ledger_entries
for select
to authenticated
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

drop policy if exists approvals_read on public.approval_actions;
create policy approvals_read
on public.approval_actions
for select
to authenticated
using (
  exists (
    select 1
    from public.leave_requests r
    where r.id=request_id
      and (
        private.is_self_employee(r.employee_id)
        or private.manages_employee(r.employee_id)
        or private.has_org_role(
          r.organisation_id,
          array[
            'hr_admin'::public.member_role,
            'org_admin'::public.member_role,
            'reporter'::public.member_role,
            'auditor'::public.member_role
          ]
        )
      )
  )
);

drop policy if exists coverage_checks_member_read
on public.leave_request_coverage_checks;
create policy coverage_checks_member_read
on public.leave_request_coverage_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.leave_requests r
    where r.id=request_id
      and (
        private.is_self_employee(r.employee_id)
        or private.manages_employee(r.employee_id)
        or private.has_org_role(
          r.organisation_id,
          array[
            'hr_admin'::public.member_role,
            'org_admin'::public.member_role,
            'reporter'::public.member_role,
            'auditor'::public.member_role
          ]
        )
      )
  )
);

drop policy if exists toil_request_coverage_checks_member_read
on public.toil_request_coverage_checks;
create policy toil_request_coverage_checks_member_read
on public.toil_request_coverage_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.toil_requests tr
    where tr.id=request_id
      and (
        private.is_self_employee(tr.employee_id)
        or private.manages_employee(tr.employee_id)
        or private.has_org_role(
          tr.organisation_id,
          array[
            'hr_admin'::public.member_role,
            'org_admin'::public.member_role,
            'reporter'::public.member_role,
            'auditor'::public.member_role
          ]
        )
      )
  )
);
