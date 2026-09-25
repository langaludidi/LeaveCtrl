import Link from "next/link";
import { CalendarDays, Download, FileClock, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function currentYearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function days(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default async function ReportsPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const adminScope = roles.some((role) =>
    ["org_admin", "hr_admin", "reporter", "auditor"].includes(role)
  );
  const managerScope = roles.includes("manager") && !adminScope;

  let scopedEmployeesQuery = supabase
    .from("employees")
    .select("id, first_name, last_name, department_id, employment_status")
    .eq("organisation_id", employee.organisation_id)
    .eq("employment_status", "active")
    .order("first_name");

  if (managerScope) {
    scopedEmployeesQuery = scopedEmployeesQuery.or(
      `id.eq.${employee.id},manager_employee_id.eq.${employee.id}`
    );
  } else if (!adminScope) {
    scopedEmployeesQuery = scopedEmployeesQuery.eq("id", employee.id);
  }

  const [
    { data: scopedEmployees },
    { data: departments },
    { data: leaveTypes },
  ] = await Promise.all([
    scopedEmployeesQuery,
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_types")
      .select("id, code, name")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true),
  ]);

  const employeeIds = (scopedEmployees ?? []).map((person) => person.id);
  const yearStart = currentYearStart();

  const [{ data: balances }, { data: requests }] = employeeIds.length
    ? await Promise.all([
        supabase
          .from("leave_balances")
          .select("employee_id, leave_type_id, available_balance")
          .in("employee_id", employeeIds),
        supabase
          .from("leave_requests")
          .select("id, employee_id, leave_type_id, quantity, status, start_date, end_date")
          .in("employee_id", employeeIds)
          .gte("start_date", yearStart),
      ])
    : [{ data: [] }, { data: [] }];

  const annualType = (leaveTypes ?? []).find((type) => type.code === "ANNUAL");
  const departmentMap = new Map(
    (departments ?? []).map((department) => [department.id, department.name])
  );

  const annualBalanceMap = new Map(
    (balances ?? [])
      .filter((row) => row.leave_type_id === annualType?.id)
      .map((row) => [row.employee_id, Number(row.available_balance ?? 0)])
  );

  const approvedStatuses = new Set(["approved", "cancellation_requested"]);
  const approvedByEmployee = new Map<string, number>();
  const pendingByEmployee = new Map<string, number>();

  for (const request of requests ?? []) {
    if (approvedStatuses.has(request.status)) {
      approvedByEmployee.set(
        request.employee_id,
        (approvedByEmployee.get(request.employee_id) ?? 0) + Number(request.quantity)
      );
    }
    if (request.status === "pending_approval") {
      pendingByEmployee.set(
        request.employee_id,
        (pendingByEmployee.get(request.employee_id) ?? 0) + Number(request.quantity)
      );
    }
  }

  const activePeople = scopedEmployees?.length ?? 0;
  const totalAvailableAnnual = Array.from(annualBalanceMap.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const approvedDays = Array.from(approvedByEmployee.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const pendingDays = Array.from(pendingByEmployee.values()).reduce(
    (sum, value) => sum + value,
    0
  );

  const scopeLabel = adminScope
    ? "Organisation"
    : managerScope
      ? "My team"
      : "My leave";

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split">
        <div>
          <p className="eyebrow">LIVE LEDGER REPORTING</p>
          <h1>Reports</h1>
          <p>
            {scopeLabel} reporting based on the same balances, requests and approval states
            used by LeaveCtrl workflows.
          </p>
        </div>
        <Link href="/reports/export" className="btn secondary">
          <Download size={17}/> Export CSV
        </Link>
      </section>

      <section className="summary-grid">
        <div className="summary-card teal">
          <div className="summary-head">
            <span className="summary-icon"><Users size={20}/></span>
            <span>Active people</span>
          </div>
          <div className="summary-value">{activePeople} <small>people</small></div>
          <div className="summary-foot"><span>{scopeLabel.toLowerCase()} scope</span></div>
        </div>

        <div className="summary-card blue">
          <div className="summary-head">
            <span className="summary-icon"><CalendarDays size={20}/></span>
            <span>Annual leave available</span>
          </div>
          <div className="summary-value">{days(totalAvailableAnnual)} <small>days</small></div>
          <div className="summary-foot"><span>current ledger position</span></div>
        </div>

        <div className="summary-card teal">
          <div className="summary-head">
            <span className="summary-icon"><CalendarDays size={20}/></span>
            <span>Approved leave this year</span>
          </div>
          <div className="summary-value">{days(approvedDays)} <small>days</small></div>
          <div className="summary-foot"><span>approved and still effective</span></div>
        </div>

        <div className="summary-card amber">
          <div className="summary-head">
            <span className="summary-icon"><FileClock size={20}/></span>
            <span>Pending leave</span>
          </div>
          <div className="summary-value">{days(pendingDays)} <small>days</small></div>
          <div className="summary-foot"><span>reserved awaiting decision</span></div>
        </div>
      </section>

      <section className="card data-card">
        <div className="card-title">
          <h2>Leave position by employee</h2>
          <span className="muted-count">{scopeLabel}</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Annual available</th>
                <th>Approved this year</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {(scopedEmployees ?? []).map((person) => (
                <tr key={person.id}>
                  <td>{person.first_name} {person.last_name}</td>
                  <td>
                    {person.department_id
                      ? departmentMap.get(person.department_id) ?? "—"
                      : "—"}
                  </td>
                  <td><strong>{days(annualBalanceMap.get(person.id) ?? 0)} days</strong></td>
                  <td>{days(approvedByEmployee.get(person.id) ?? 0)} days</td>
                  <td>{days(pendingByEmployee.get(person.id) ?? 0)} days</td>
                </tr>
              ))}
              {!scopedEmployees?.length ? (
                <tr>
                  <td colSpan={5} className="empty-table-cell">
                    No employees are visible in this reporting scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
