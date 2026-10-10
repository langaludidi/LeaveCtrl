import { loadAnnualLeaveLiability } from "@/lib/report-liability";
import Link from "next/link";
import { CalendarDays, Coins, Download, FileClock, LockKeyhole, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCurrentContext } from "@/lib/current-context";
import { reportCatalogue } from "@/lib/report-catalogue";
import { BrandLogo } from "@/components/BrandLogo";
import { PrintReportButton } from "@/components/PrintReportButton";
import { LeaveHistoryTable } from "@/components/LeaveHistoryTable";
import { reportReference, reportTimestamp } from "@/lib/report-export";

function days(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function money(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ historyYear?: string; historyPage?: string }> }) {
  const params = await searchParams;
  const { supabase, employee, accessState, displayName, roles, businessDate } =
    await getCurrentContext({ requireEmployee: false });

  const { data: reportOrganisation } = await supabase.from("organisations").select("name").eq("id", accessState.organisation_id).maybeSingle();

  const adminScope = roles.some((role) =>
    ["org_admin", "hr_admin", "reporter", "auditor"].includes(role)
  );
  const managerScope = roles.includes("manager") && !adminScope;
  const canViewLiability = roles.some((role) =>
    ["org_admin", "hr_admin", "reporter"].includes(role)
  );

  const [
    { data: allEmployees, error: employeesError },
    { data: departments, error: departmentsError },
    { data: leaveTypes, error: leaveTypesError },
    { data: currentConditions, error: conditionsError },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, department_id, employment_status, manager_employee_id")
      .eq("organisation_id", accessState.organisation_id)
      .eq("employment_status", "active")
      .order("first_name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", accessState.organisation_id),
    supabase
      .from("leave_types")
      .select("id, code, name")
      .eq("organisation_id", accessState.organisation_id)
      .eq("active", true),
    supabase
      .from("employee_current_conditions")
      .select("employee_id, department_id, manager_employee_id")
      .eq("organisation_id", accessState.organisation_id),
  ]);

  if (employeesError || departmentsError || leaveTypesError || conditionsError) throw new Error("Reporting sources unavailable");

  const conditionByEmployee = new Map(
    (currentConditions ?? []).map((condition) => [condition.employee_id, condition])
  );

  const scopedEmployees = adminScope
    ? allEmployees ?? []
    : managerScope
      ? (allEmployees ?? []).filter((person) => {
          if (person.id === employee?.id) return true;
          const condition = conditionByEmployee.get(person.id);
          return (condition?.manager_employee_id ?? person.manager_employee_id) === employee?.id;
        })
      : (allEmployees ?? []).filter((person) => person.id === employee?.id);

  const employeeIds = scopedEmployees.map((person) => person.id);
  const currentYear = Number(businessDate.slice(0, 4));
  const requestedYear = Number(params.historyYear);
  const historyYear = Number.isInteger(requestedYear) && requestedYear >= currentYear - 5 && requestedYear <= currentYear ? requestedYear : currentYear;
  const yearStart = `${currentYear}-01-01`;
  const historyStart = `${historyYear}-01-01`;
  const historyYearEnd = historyYear === currentYear ? businessDate : `${historyYear}-12-31`;
  const requestedPage = Number(params.historyPage);
  const historyPage = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10000 ? requestedPage : 1;
  const historyPageSize = 100;
  const today = businessDate;

  const [
    { data: balances, error: balancesError },
    { data: requests, error: requestsError },
    { data: toilBalances, error: toilError },
    remunerationResult,
    liabilityRateResult,
  ] = employeeIds.length
    ? await Promise.all([
        supabase
          .from("leave_balances")
          .select("employee_id, entitlement_id, leave_type_id, available_balance")
          .in("employee_id", employeeIds),
        supabase
          .from("leave_requests")
          .select("id, employee_id, leave_type_id, quantity, status, start_date, end_date")
          .in("employee_id", employeeIds)
          .gte("start_date", yearStart)
          .lte("start_date", businessDate),
        supabase
          .from("toil_balances")
          .select("employee_id, available_hours")
          .in("employee_id", employeeIds),
        canViewLiability
          ? supabase
              .from("employee_remuneration_history")
              .select("employee_id, gross_amount, pay_frequency, currency_code, effective_from, effective_to")
              .in("employee_id", employeeIds)
              .lte("effective_from", today)
              .order("effective_from", { ascending: false })
          : Promise.resolve({ data: [] }),
        canViewLiability
          ? supabase
              .from("employee_leave_liability_rates")
              .select("employee_id, currency_code, base_daily_rate, variable_earnings_total, averaging_weeks, scheduled_days, variable_daily_rate, effective_daily_rate, liability_calculation_method")
              .in("employee_id", employeeIds)
          : Promise.resolve({ data: [] }),
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];

  if (balancesError || requestsError || toilError || ("error" in remunerationResult && remunerationResult.error) || ("error" in liabilityRateResult && liabilityRateResult.error)) throw new Error("Reporting ledger unavailable");

  // Historical reporting includes former employees; current balances and dashboard
  // continue to use active employees only.
  const { data: historyLeaveTypes, error: historyTypesError } = await supabase.from("leave_types")
    .select("id, name").eq("organisation_id", accessState.organisation_id);
  const historyTypeMap = new Map((historyLeaveTypes ?? []).map((type) => [type.id, type.name]));
  const { data: historyEmployees, error: historyEmployeesError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, manager_employee_id")
    .eq("organisation_id", accessState.organisation_id);
  const historyScopedEmployees = (historyEmployees ?? []).filter((person) => {
    if (adminScope) return true;
    if (person.id === employee?.id) return true;
    if (!managerScope) return false;
    // Former employees require HR/organisation-level reporting access.
    if (!(allEmployees ?? []).some((active) => active.id === person.id)) return false;
    const condition = conditionByEmployee.get(person.id);
    return (condition?.manager_employee_id ?? person.manager_employee_id) === employee?.id;
  });
  const historyEmployeeIds = historyScopedEmployees.map((person) => person.id);

  const { data: historyRequests, error: historyError, count: historyTotal } = historyEmployeeIds.length
    ? await supabase.from("leave_requests")
        .select("id, employee_id, leave_type_id, quantity, status, start_date, end_date", { count: "exact" })
        .in("employee_id", historyEmployeeIds)
        .gte("start_date", historyStart)
        .lte("start_date", historyYearEnd)
        .order("start_date", { ascending: false })
        .range((historyPage - 1) * historyPageSize, historyPage * historyPageSize - 1)
    : { data: [], error: null, count: 0 };

  if (historyError || historyEmployeesError || historyTypesError) throw new Error("Historical reporting unavailable");

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
  const toilBalanceMap = new Map(
    (toilBalances ?? []).map((row) => [
      row.employee_id,
      Number(row.available_hours ?? 0),
    ])
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

  const remunerationMap = new Map<
    string,
    {
      gross_amount: number;
      pay_frequency: string;
      currency_code: string;
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
      });
    }
  }

  const liabilityRateMap = new Map(
    (liabilityRateResult.data ?? []).map((row) => [
      row.employee_id,
      {
        currency_code: row.currency_code,
        base_daily_rate: Number(row.base_daily_rate ?? 0),
        variable_earnings_total: Number(row.variable_earnings_total ?? 0),
        averaging_weeks: Number(row.averaging_weeks ?? 13),
        scheduled_days: Number(row.scheduled_days ?? 0),
        variable_daily_rate: Number(row.variable_daily_rate ?? 0),
        effective_daily_rate: Number(row.effective_daily_rate ?? 0),
        liability_calculation_method: row.liability_calculation_method,
      },
    ])
  );

  const liabilityDaysMap = canViewLiability
    ? await loadAnnualLeaveLiability(supabase, (balances ?? []).filter((row) => row.leave_type_id === annualType?.id), annualType?.id, today)
    : new Map<string, number>();
  const liabilityAmountMap = new Map<string, number>();
  let totalLiability = 0;

  for (const person of scopedEmployees ?? []) {
    const liabilityDays = liabilityDaysMap.get(person.id) ?? 0;

    const rate = liabilityRateMap.get(person.id);
    if (rate) {
      const amount = liabilityDays * rate.effective_daily_rate;
      liabilityAmountMap.set(person.id, amount);
      totalLiability += amount;
    }
  }

  const activePeople = scopedEmployees.length;
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

  const generatedAt = new Date().toISOString();
  const reportId = reportReference(generatedAt, accessState.organisation_id.slice(0, 8));

  const scopeLabel = adminScope
    ? "Organisation"
    : managerScope
      ? "My team"
      : "My leave";

  return (
    <AppShell displayName={displayName} roles={roles} hasEmployee={Boolean(employee)}>
      <section className="page-head split">
        <div>
          <p className="eyebrow">LIVE LEDGER REPORTING</p>
          <h1>Reports</h1>
          <p>
            {scopeLabel} reporting based on leave ledgers, effective working conditions,
            TOIL and the organisation&apos;s confidential remuneration rules.
          </p>
        </div>
        <div className="report-export-actions">
          <PrintReportButton />
          <Link href="/reports/export" className="btn secondary">
            <Download size={17}/> Export CSV
          </Link>
        </div>
      </section>

      <section className="report-print-header" aria-label="Report identification">
        <BrandLogo variant="primary" />
        <h2>Leave Balance and Workforce Summary</h2>
        <p>Organisation scope: {scopeLabel} · Period: {businessDate.slice(0, 4)}-01-01 to {businessDate}</p>
        <p>Generated: {reportTimestamp(generatedAt)} · Reference: {reportId}</p>
        <p>Classification: {canViewLiability ? "Confidential" : "Internal"} · LeaveCtrl — Leave &amp; Workforce Availability</p>
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

      <section className="card data-card" aria-labelledby="report-catalogue-heading">
        <div className="card-title">
          <div>
            <h2 id="report-catalogue-heading">Report catalogue</h2>
            <p className="card-subtitle">Eighteen planned reports. Availability is shown explicitly; reports marked partial or requiring data are not yet downloadable as complete reports.</p>
          </div>
          <span className="muted-count">18 reports</span>
        </div>
        <div className="table-scroll">
          <table className="mobile-data-table">
            <thead><tr><th>Report</th><th>Category</th><th>Readiness</th><th>Requirements</th></tr></thead>
            <tbody>
              {reportCatalogue.filter((report) => {
                if (roles.includes("org_admin") || roles.includes("hr_admin")) return true;
                if (roles.includes("auditor")) return report.audiences.includes("executive");
                if (roles.includes("reporter")) return report.audiences.includes("executive") && report.id !== 8 && report.id !== 16;
                if (roles.includes("manager")) return report.audiences.includes("manager");
                return report.audiences.includes("employee");
              }).map((report) => (
                <tr key={report.id}>
                  <td data-label="Report"><strong>{report.id}. {report.title}</strong></td>
                  <td data-label="Category">{report.category}</td>
                  <td data-label="Readiness">{report.readiness === "available" ? "Existing summary" : report.readiness === "partial" ? "In development" : "Additional data required"}</td>
                  <td data-label="Requirements">{report.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="card-subtitle">{historyError || historyEmployeesError || historyTypesError ? "History records could not be loaded. Export is unavailable." : `History: page ${historyPage} of ${Math.max(1, Math.ceil((historyTotal ?? 0) / historyPageSize))}, showing ${(historyRequests ?? []).length} of ${historyTotal ?? 0} matching requests. Use the complete-year CSV action for server-side audited export; table filters apply to the displayed page and the full filtered CSV export.`}</p>
      <form action="/reports" method="get" className="report-history-filters" aria-label="History reporting year">
        <label>History reporting year
          <select name="historyYear" defaultValue={String(historyYear)}>
            {Array.from({ length: 6 }, (_, i) => currentYear - i).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <button type="submit" className="btn secondary">Load year</button>
      </form>
      <div className="report-export-actions">
        <Link className="btn secondary" href={`/reports/history/export?year=${historyYear}`}>Export complete year CSV</Link>
      </div>
      <LeaveHistoryTable exportAllowed={false} exportYear={historyYear} leaveTypeIds={Object.fromEntries((historyLeaveTypes ?? []).map((type) => [type.name, type.id]))} organisationName={reportOrganisation?.name ?? "Organisation"} periodStart={historyStart} periodEnd={historyYearEnd} rows={(historyRequests ?? []).map((request) => {
        const person = historyScopedEmployees.find((row) => row.id === request.employee_id);
        const leaveTypeName = historyTypeMap.get(request.leave_type_id);
        return {
          id: request.id,
          employee: person ? `${person.first_name} ${person.last_name}` : "Employee",
          leaveType: leaveTypeName ?? "Leave",
          startDate: request.start_date,
          endDate: request.end_date,
          quantity: Number(request.quantity ?? 0),
          status: request.status,
        };
      })} />
      <nav className="report-history-pagination" aria-label="Historical report server pages">
        {historyPage > 1 ? <Link className="btn secondary" href={`/reports?historyYear=${historyYear}&historyPage=${historyPage - 1}`}>Previous 100</Link> : <span>First page</span>}
        <span>Page {historyPage} of {Math.max(1, Math.ceil((historyTotal ?? 0) / historyPageSize))}</span>
        {!historyError && !historyEmployeesError && historyPage * historyPageSize < (historyTotal ?? 0) ? <Link className="btn secondary" href={`/reports?historyYear=${historyYear}&historyPage=${historyPage + 1}`}>Next 100</Link> : <span>Last page</span>}
      </nav>


      {canViewLiability ? (
        <section className="card liability-summary-card">
          <div>
            <span className="summary-icon"><Coins size={20}/></span>
            <div>
              <span className="liability-kicker">CONFIDENTIAL FINANCE VIEW</span>
              <h2>Estimated annual-leave liability</h2>
              <p>
                Untaken annual leave is valued using the employee&apos;s base daily rate plus
                the configured average of qualifying variable earnings such as overtime.
                Future approved leave is added back until it is actually taken.
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
          <table className="mobile-data-table report-position-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Annual available</th>
                <th>Approved this year</th>
                <th>Pending</th>
                <th>TOIL</th>
              </tr>
            </thead>
            <tbody>
              {scopedEmployees.map((person) => {
                const departmentId =
                  currentDepartmentMap.get(person.id) ?? person.department_id;
                return (
                  <tr key={person.id}>
                    <td data-label="Employee">{person.first_name} {person.last_name}</td>
                    <td data-label="Department">{departmentId ? departmentMap.get(departmentId) ?? "—" : "—"}</td>
                    <td data-label="Annual available"><strong>{days(annualBalanceMap.get(person.id) ?? 0)} days</strong></td>
                    <td data-label="Approved this year">{days(approvedByEmployee.get(person.id) ?? 0)} days</td>
                    <td data-label="Pending">{days(pendingByEmployee.get(person.id) ?? 0)} days</td>
                    <td data-label="TOIL">{days(toilBalanceMap.get(person.id) ?? 0)} h</td>
                  </tr>
                );
              })}
              {!scopedEmployees.length ? (
                <tr><td colSpan={6} className="empty-table-cell" data-label="">No employees are visible in this reporting scope.</td></tr>
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
                Base remuneration and variable earnings are restricted to authorised company roles and are never displayed in the employee workspace.
              </p>
            </div>
            <span className="verified-pill"><LockKeyhole size={14}/> Confidential</span>
          </div>
          <div className="table-scroll">
            <table className="mobile-data-table liability-mobile-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Liability days</th>
                  <th>Remuneration basis</th>
                  <th>Base daily</th>
                  <th>Variable average</th>
                  <th>Effective daily</th>
                  <th>Liability</th>
                  <th>Calculation</th>
                </tr>
              </thead>
              <tbody>
                {scopedEmployees.map((person) => {
                  const remuneration = remunerationMap.get(person.id);
                  const rate = liabilityRateMap.get(person.id);
                  const liabilityDays = liabilityDaysMap.get(person.id) ?? 0;
                  const currency = rate?.currency_code ?? remuneration?.currency_code ?? "ZAR";

                  return (
                    <tr key={person.id}>
                      <td data-label="Employee">{person.first_name} {person.last_name}</td>
                      <td data-label="Liability days">{days(liabilityDays)}</td>
                      <td data-label="Remuneration basis">
                        {remuneration
                          ? `${money(remuneration.gross_amount, remuneration.currency_code)} / ${remuneration.pay_frequency}`
                          : "Not captured"}
                      </td>
                      <td data-label="Base daily">{rate ? money(rate.base_daily_rate, currency) : "—"}</td>
                      <td data-label="Variable average">
                        {rate
                          ? <>
                              <strong>{money(rate.variable_daily_rate, currency)}</strong>
                              <span className="table-secondary">
                                {money(rate.variable_earnings_total, currency)} over {rate.averaging_weeks} weeks
                              </span>
                            </>
                          : "—"}
                      </td>
                      <td data-label="Effective daily">{rate ? <strong>{money(rate.effective_daily_rate, currency)}</strong> : "—"}</td>
                      <td data-label="Liability">
                        {rate
                          ? <strong>{money(liabilityAmountMap.get(person.id) ?? 0, currency)}</strong>
                          : "—"}
                      </td>
                      <td data-label="Calculation" className="liability-method">
                        {rate?.liability_calculation_method ?? "Capture remuneration to calculate"}
                      </td>
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
