import Link from "next/link";
import { CalendarDays, Coins, Download, FileClock, LockKeyhole, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function currentYearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function days(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function money(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ReportsPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const adminScope = roles.some((role) =>
    ["org_admin", "hr_admin", "reporter", "auditor"].includes(role)
  );
  const managerScope = roles.includes("manager") && !adminScope;
  const canViewLiability = roles.some((role) =>
    ["org_admin", "hr_admin", "reporter"].includes(role)
  );

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
    { data: currentConditions },
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
    supabase
      .from("employee_current_conditions")
      .select("employee_id, department_id")
      .eq("organisation_id", employee.organisation_id),
  ]);

  const employeeIds = (scopedEmployees ?? []).map((person) => person.id);
  const yearStart = currentYearStart();
  const today = todayKey();

  const [{ data: balances }, { data: requests }, remunerationResult] = employeeIds.length
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
        canViewLiability
          ? supabase
              .from("employee_remuneration_history")
              .select("employee_id, gross_amount, pay_frequency, currency_code, liability_daily_rate, calculation_method, effective_from, effective_to")
              .in("employee_id", employeeIds)
              .lte("effective_from", today)
              .order("effective_from", { ascending: false })
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: futureRequestDays } = requestIds.length && canViewLiability
    ? await supabase
        .from("leave_request_days")
        .select("request_id, leave_date, chargeable_quantity")
        .in("request_id", requestIds)
        .gt("leave_date", today)
    : { data: [] };

  const annualType = (leaveTypes ?? []).find((type) => type.code === "ANNUAL");
  const departmentMap = new Map(
    (departments ?? []).map((department) => [department.id, department.name])
  );
  const currentDepartmentMap = new Map(
    (currentConditions ?? []).map((condition) => [
      condition.employee_id,
      condition.department_id,
    ])
  );

  const annualBalanceMap = new Map(
    (balances ?? [])
      .filter((row) => row.leave_type_id === annualType?.id)
      .map((row) => [row.employee_id, Number(row.available_balance ?? 0)])
  );

  const approvedStatuses = new Set(["approved", "cancellation_requested"]);
  const approvedByEmployee = new Map<string, number>();
  const pendingByEmployee = new Map<string, number>();
  const requestMap = new Map((requests ?? []).map((request) => [request.id, request]));

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

  const futureApprovedByEmployee = new Map<string, number>();
  for (const day of futureRequestDays ?? []) {
    const request = requestMap.get(day.request_id);
    if (!request || !approvedStatuses.has(request.status)) continue;
    futureApprovedByEmployee.set(
      request.employee_id,
      (futureApprovedByEmployee.get(request.employee_id) ?? 0) +
        Number(day.chargeable_quantity ?? 0)
    );
  }

  const remunerationMap = new Map<
    string,
    {
      gross_amount: number;
      pay_frequency: string;
      currency_code: string;
      liability_daily_rate: number;
      calculation_method: string;
    }
  >();

  for (const row of remunerationResult.data ?? []) {
    if (
      !remunerationMap.has(row.employee_id) &&
      (!row.effective_to || row.effective_to >= today)
    ) {
      remunerationMap.set(row.employee_id, {
        gross_amount: Number(row.gross_amount),
        pay_frequency: row.pay_frequency,
        currency_code: row.currency_code,
        liability_daily_rate: Number(row.liability_daily_rate),
        calculation_method: row.calculation_method,
      });
    }
  }

  const liabilityDaysMap = new Map<string, number>();
  const liabilityAmountMap = new Map<string, number>();
  let totalLiability = 0;

  for (const person of scopedEmployees ?? []) {
    const liabilityDays = Math.max(
      0,
      (annualBalanceMap.get(person.id) ?? 0) +
        (pendingByEmployee.get(person.id) ?? 0) +
        (futureApprovedByEmployee.get(person.id) ?? 0)
    );
    liabilityDaysMap.set(person.id, liabilityDays);

    const remuneration = remunerationMap.get(person.id);
    if (remuneration) {
      const amount = liabilityDays * remuneration.liability_daily_rate;
      liabilityAmountMap.set(person.id, amount);
      totalLiability += amount;
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
            {scopeLabel} reporting based on the same balances, requests and effective
            employment conditions used by LeaveCtrl workflows.
          </p>
        </div>
        <Link href="/reports/export" className="btn secondary">
          <Download size={17}/> Export CSV
        </Link>
      </section>

      <section className="summary-grid">
        <div className="summary-card teal">
          <div className="summary-head"><span className="summary-icon"><Users size={20}/></span><span>Active people</span></div>
          <div className="summary-value">{activePeople} <small>people</small></div>
          <div className="summary-foot"><span>{scopeLabel.toLowerCase()} scope</span></div>
        </div>

        <div className="summary-card blue">
          <div className="summary-head"><span className="summary-icon"><CalendarDays size={20}/></span><span>Annual leave available</span></div>
          <div className="summary-value">{days(totalAvailableAnnual)} <small>days</small></div>
          <div className="summary-foot"><span>current employee-facing ledger position</span></div>
        </div>

        <div className="summary-card teal">
          <div className="summary-head"><span className="summary-icon"><CalendarDays size={20}/></span><span>Approved leave this year</span></div>
          <div className="summary-value">{days(approvedDays)} <small>days</small></div>
          <div className="summary-foot"><span>approved and still effective</span></div>
        </div>

        <div className="summary-card amber">
          <div className="summary-head"><span className="summary-icon"><FileClock size={20}/></span><span>Pending leave</span></div>
          <div className="summary-value">{days(pendingDays)} <small>days</small></div>
          <div className="summary-foot"><span>reserved awaiting decision</span></div>
        </div>
      </section>

      {canViewLiability ? (
        <section className="card liability-summary-card">
          <div>
            <span className="summary-icon"><Coins size={20}/></span>
            <div>
              <span className="liability-kicker">CONFIDENTIAL FINANCE VIEW</span>
              <h2>Estimated annual-leave liability</h2>
              <p>
                Uses untaken annual-leave days multiplied by each employee&apos;s effective
                daily liability rate. Pending requests and approved future leave are added
                back so they do not prematurely reduce the obligation.
              </p>
            </div>
          </div>
          <strong>{money(totalLiability)}</strong>
        </section>
      ) : null}

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
              {(scopedEmployees ?? []).map((person) => {
                const departmentId =
                  currentDepartmentMap.get(person.id) ?? person.department_id;
                return (
                  <tr key={person.id}>
                    <td>{person.first_name} {person.last_name}</td>
                    <td>{departmentId ? departmentMap.get(departmentId) ?? "—" : "—"}</td>
                    <td><strong>{days(annualBalanceMap.get(person.id) ?? 0)} days</strong></td>
                    <td>{days(approvedByEmployee.get(person.id) ?? 0)} days</td>
                    <td>{days(pendingByEmployee.get(person.id) ?? 0)} days</td>
                  </tr>
                );
              })}
              {!scopedEmployees?.length ? (
                <tr><td colSpan={5} className="empty-table-cell">No employees are visible in this reporting scope.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {canViewLiability ? (
        <section className="card data-card liability-table-card">
          <div className="card-title">
            <div>
              <h2>Leave liability verification</h2>
              <p className="card-subtitle">
                Remuneration is restricted to authorised company roles and is never displayed in the employee workspace.
              </p>
            </div>
            <span className="verified-pill"><LockKeyhole size={14}/> Confidential</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Liability days</th>
                  <th>Remuneration basis</th>
                  <th>Daily rate</th>
                  <th>Liability</th>
                  <th>Calculation</th>
                </tr>
              </thead>
              <tbody>
                {(scopedEmployees ?? []).map((person) => {
                  const remuneration = remunerationMap.get(person.id);
                  const liabilityDays = liabilityDaysMap.get(person.id) ?? 0;
                  return (
                    <tr key={person.id}>
                      <td>{person.first_name} {person.last_name}</td>
                      <td>{days(liabilityDays)}</td>
                      <td>
                        {remuneration
                          ? `${money(remuneration.gross_amount, remuneration.currency_code)} / ${remuneration.pay_frequency}`
                          : "Not captured"}
                      </td>
                      <td>
                        {remuneration
                          ? money(remuneration.liability_daily_rate, remuneration.currency_code)
                          : "—"}
                      </td>
                      <td>
                        {remuneration
                          ? <strong>{money(liabilityAmountMap.get(person.id) ?? 0, remuneration.currency_code)}</strong>
                          : "—"}
                      </td>
                      <td className="liability-method">{remuneration?.calculation_method ?? "Capture remuneration to calculate"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
