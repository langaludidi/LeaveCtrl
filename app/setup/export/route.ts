import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, organisation_id")
    .eq("user_id", user.id)
    .eq("employment_status", "active")
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "employee_profile_required" }, { status: 403 });
  }

  const { data: memberships } = await supabase
    .from("organisation_memberships")
    .select("role")
    .eq("organisation_id", employee.organisation_id)
    .eq("user_id", user.id)
    .eq("is_active", true);

  const roles = new Set((memberships ?? []).map((membership) => membership.role));
  if (!roles.has("org_admin") && !roles.has("hr_admin")) {
    return NextResponse.json({ error: "not_authorised" }, { status: 403 });
  }

  const orgId = employee.organisation_id;

  const [
    organisation,
    employees,
    membershipsExport,
    departments,
    locations,
    schedules,
    scheduleAssignments,
    employmentConditions,
    leaveTypes,
    policies,
    entitlements,
    ledger,
    leaveRequests,
    requestDays,
    approvalActions,
    holidays,
    blockedPeriods,
    coverageRules,
    toilRequests,
    toilLedger,
    overtimeSettings,
    overtimeEvents,
    overtimePayments,
    remuneration,
    variableEarnings,
    invitations,
    auditEvents,
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, name, country_code, timezone, currency_code, created_at, updated_at")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, employee_number, first_name, last_name, email, start_date, end_date, department_id, manager_employee_id, employment_status, created_at, updated_at")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("organisation_memberships")
      .select("user_id, role, is_active, created_at")
      .eq("organisation_id", orgId),
    supabase
      .from("departments")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("locations")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("work_schedules")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("employee_schedule_assignments")
      .select("*")
      .eq("organisation_id", orgId)
      .order("effective_from"),
    supabase
      .from("employee_employment_conditions")
      .select("*")
      .eq("organisation_id", orgId)
      .order("effective_from"),
    supabase
      .from("leave_types")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("leave_policy_versions")
      .select("*")
      .eq("organisation_id", orgId)
      .order("effective_from"),
    supabase
      .from("leave_entitlements")
      .select("*")
      .eq("organisation_id", orgId)
      .order("cycle_start"),
    supabase
      .from("leave_ledger_entries")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("leave_requests")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("leave_request_days")
      .select("*")
      .eq("organisation_id", orgId)
      .order("leave_date"),
    supabase
      .from("approval_actions")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("public_holidays")
      .select("*")
      .eq("organisation_id", orgId)
      .order("holiday_date"),
    supabase
      .from("blocked_periods")
      .select("*")
      .eq("organisation_id", orgId)
      .order("start_date"),
    supabase
      .from("coverage_rules")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("toil_requests")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("toil_ledger_entries")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("overtime_settings")
      .select("*")
      .eq("organisation_id", orgId),
    supabase
      .from("overtime_events")
      .select("*")
      .eq("organisation_id", orgId)
      .order("work_date"),
    supabase
      .from("overtime_event_payments")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("employee_remuneration_history")
      .select("*")
      .eq("organisation_id", orgId)
      .order("effective_from"),
    supabase
      .from("employee_variable_earnings")
      .select("*")
      .eq("organisation_id", orgId)
      .order("earning_date"),
    supabase
      .from("employee_invitations")
      .select("id, employee_id, email, first_name, last_name, employee_number, department_id, manager_employee_id, work_schedule_id, start_date, grant_manager_role, expires_at, accepted_at, created_by, created_at")
      .eq("organisation_id", orgId)
      .order("created_at"),
    supabase
      .from("audit_events")
      .select("id, actor_user_id, entity_type, entity_id, event_type, payload, created_at")
      .eq("organisation_id", orgId)
      .order("created_at"),
  ]);

  const namedResults = {
    organisation,
    employees,
    memberships: membershipsExport,
    departments,
    locations,
    work_schedules: schedules,
    employee_schedule_assignments: scheduleAssignments,
    employee_employment_conditions: employmentConditions,
    leave_types: leaveTypes,
    leave_policy_versions: policies,
    leave_entitlements: entitlements,
    leave_ledger_entries: ledger,
    leave_requests: leaveRequests,
    leave_request_days: requestDays,
    approval_actions: approvalActions,
    public_holidays: holidays,
    blocked_periods: blockedPeriods,
    coverage_rules: coverageRules,
    toil_requests: toilRequests,
    toil_ledger_entries: toilLedger,
    overtime_settings: overtimeSettings,
    overtime_events: overtimeEvents,
    overtime_event_payments: overtimePayments,
    employee_remuneration_history: remuneration,
    employee_variable_earnings: variableEarnings,
    employee_invitations: invitations,
    audit_events: auditEvents,
  };

  const failed = Object.entries(namedResults).filter(
    ([, result]) => result.error
  );

  if (failed.length) {
    return NextResponse.json(
      {
        error: "export_incomplete",
        sections: failed.map(([name, result]) => ({
          name,
          message: result.error?.message ?? "Unknown export error",
        })),
      },
      { status: 500 }
    );
  }

  const { error: auditError } = await supabase.rpc(
    "record_organisation_data_export",
    { p_format: "json" }
  );

  if (auditError) {
    return NextResponse.json({ error: "export_audit_failed" }, { status: 500 });
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    format: "LeaveCtrl Organisation Export",
    version: "1.0",
    exported_at: exportedAt,
    organisation: organisation.data,
    data: {
      employees: employees.data ?? [],
      memberships: membershipsExport.data ?? [],
      departments: departments.data ?? [],
      locations: locations.data ?? [],
      work_schedules: schedules.data ?? [],
      employee_schedule_assignments: scheduleAssignments.data ?? [],
      employee_employment_conditions: employmentConditions.data ?? [],
      leave_types: leaveTypes.data ?? [],
      leave_policy_versions: policies.data ?? [],
      leave_entitlements: entitlements.data ?? [],
      leave_ledger_entries: ledger.data ?? [],
      leave_requests: leaveRequests.data ?? [],
      leave_request_days: requestDays.data ?? [],
      approval_actions: approvalActions.data ?? [],
      public_holidays: holidays.data ?? [],
      blocked_periods: blockedPeriods.data ?? [],
      coverage_rules: coverageRules.data ?? [],
      toil_requests: toilRequests.data ?? [],
      toil_ledger_entries: toilLedger.data ?? [],
      overtime_settings: overtimeSettings.data ?? [],
      overtime_events: overtimeEvents.data ?? [],
      overtime_event_payments: overtimePayments.data ?? [],
      employee_remuneration_history: remuneration.data ?? [],
      employee_variable_earnings: variableEarnings.data ?? [],
      employee_invitations: invitations.data ?? [],
      audit_events: auditEvents.data ?? [],
    },
  };

  const safeName = String(organisation.data?.name ?? "organisation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName || "leavectrl"}-leavectrl-export-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
