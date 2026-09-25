import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight, Clock3, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DecisionButtons } from "@/components/DecisionButtons";
import { StatusPill } from "@/components/StatusPill";
import { ToilDecisionButtons } from "@/components/ToilRequestActions";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function compactNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function SummaryCard({
  tone,
  icon,
  label,
  value,
  unit,
  sub,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  sub: string;
}) {
  return (
    <div className={`summary-card ${tone}`}>
      <div className="summary-head"><span className="summary-icon">{icon}</span><span>{label}</span></div>
      <div className="summary-value">{value} <small>{unit}</small></div>
      <div className="summary-foot"><span>{sub}</span><ChevronRight size={17}/></div>
    </div>
  );
}

export default async function HomePage() {
  const { supabase, employee, displayName, roles, businessDate } =
    await getCurrentContext();
  if (!employee) return null;

  const today = businessDate;

  const [
    { data: leaveTypes },
    { data: balances },
    { data: toilBalance },
    { data: myRequests },
    { data: myToilRequests },
    { data: pendingVisible },
    { data: pendingToilVisible },
    { data: employees },
    { data: departments },
    { data: currentConditions },
    { data: awayToday },
    { data: toilAwayToday },
    { data: upcomingApproved },
    { data: upcomingToil },
    { data: leaveCoverageWarnings },
    { data: toilCoverageWarnings },
  ] = await Promise.all([
    supabase.from("leave_types").select("id, name, code").eq("organisation_id", employee.organisation_id),
    supabase.from("leave_balances").select("leave_type_id, available_balance").eq("employee_id", employee.id),
    supabase.from("toil_balances").select("available_hours").eq("employee_id", employee.id).maybeSingle(),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status, submitted_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("toil_requests")
      .select("id, employee_id, leave_date, hours, status, submitted_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status, submitted_at")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["pending_approval", "cancellation_requested"])
      .order("submitted_at", { ascending: true }),
    supabase
      .from("toil_requests")
      .select("id, employee_id, leave_date, hours, status, submitted_at")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["pending_approval", "cancellation_requested"])
      .order("submitted_at", { ascending: true }),
    supabase
      .from("employees")
      .select("id, first_name, last_name, department_id")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("employee_current_conditions")
      .select("employee_id, department_id")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_requests")
      .select("id, employee_id")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "cancellation_requested"])
      .lte("start_date", today)
      .gte("end_date", today),
    supabase
      .from("toil_requests")
      .select("id, employee_id")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "cancellation_requested"])
      .eq("leave_date", today),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "cancellation_requested"])
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(8),
    supabase
      .from("toil_requests")
      .select("id, employee_id, leave_date, hours, status")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "cancellation_requested"])
      .gte("leave_date", today)
      .order("leave_date", { ascending: true })
      .limit(8),
    supabase
      .from("leave_request_coverage_checks")
      .select("request_id")
      .eq("organisation_id", employee.organisation_id)
      .eq("outcome", "warning"),
    supabase
      .from("toil_request_coverage_checks")
      .select("request_id")
      .eq("organisation_id", employee.organisation_id)
      .eq("outcome", "warning"),
  ]);

  const typeMap = new Map((leaveTypes ?? []).map((item) => [item.id, item.name]));
  const annual = (leaveTypes ?? []).find((item) => item.code === "ANNUAL");
  const balanceMap = new Map(
    (balances ?? []).map((item) => [item.leave_type_id, Number(item.available_balance ?? 0)])
  );
  const annualBalance = annual ? balanceMap.get(annual.id) ?? 0 : 0;
  const availableToil = Number(toilBalance?.available_hours ?? 0);

  const employeeMap = new Map((employees ?? []).map((item) => [item.id, item]));
  const departmentMap = new Map((departments ?? []).map((item) => [item.id, item.name]));
  const currentDepartmentMap = new Map(
    (currentConditions ?? []).map((item) => [item.employee_id, item.department_id])
  );

  const approvals = (pendingVisible ?? []).filter((request) => request.employee_id !== employee.id);
  const toilApprovals = (pendingToilVisible ?? []).filter((request) => request.employee_id !== employee.id);

  const pendingMine =
    (myRequests ?? []).filter((request) =>
      ["pending_approval", "cancellation_requested"].includes(request.status)
    ).length +
    (myToilRequests ?? []).filter((request) =>
      ["pending_approval", "cancellation_requested"].includes(request.status)
    ).length;

  const awayCount = new Set([
    ...(awayToday ?? []).map((item) => item.employee_id),
    ...(toilAwayToday ?? []).map((item) => item.employee_id),
  ]).size;

  const leaveWarningIds = new Set((leaveCoverageWarnings ?? []).map((row) => row.request_id));
  const toilWarningIds = new Set((toilCoverageWarnings ?? []).map((row) => row.request_id));

  const coverageAlerts =
    approvals.filter((request) => request.status === "pending_approval" && leaveWarningIds.has(request.id)).length +
    toilApprovals.filter((request) => request.status === "pending_approval" && toilWarningIds.has(request.id)).length;

  const combinedApprovals = [
    ...approvals.map((request) => ({
      kind: "leave" as const,
      id: request.id,
      employeeId: request.employee_id,
      date: request.start_date,
      duration: `${compactNumber(Number(request.quantity))} ${Number(request.quantity) === 1 ? "day" : "days"}`,
      label: `${request.status === "cancellation_requested" ? "Cancellation · " : ""}${typeMap.get(request.leave_type_id) ?? "Leave"}${leaveWarningIds.has(request.id) ? " · Coverage warning" : ""}`,
      status: request.status,
      submittedAt: request.submitted_at,
    })),
    ...toilApprovals.map((request) => ({
      kind: "toil" as const,
      id: request.id,
      employeeId: request.employee_id,
      date: request.leave_date,
      duration: `${compactNumber(Number(request.hours))} hours`,
      label: `${request.status === "cancellation_requested" ? "TOIL cancellation" : "TOIL request"}${toilWarningIds.has(request.id) ? " · Coverage warning" : ""}`,
      status: request.status,
      submittedAt: request.submitted_at,
    })),
  ].sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

  const upcomingAbsences = [
    ...(upcomingApproved ?? []).map((request) => ({
      id: `leave:${request.id}`,
      employeeId: request.employee_id,
      type: typeMap.get(request.leave_type_id) ?? "Away",
      start: request.start_date,
      end: request.end_date,
      duration: `${compactNumber(Number(request.quantity))} d`,
    })),
    ...(upcomingToil ?? []).map((request) => ({
      id: `toil:${request.id}`,
      employeeId: request.employee_id,
      type: "TOIL",
      start: request.leave_date,
      end: request.leave_date,
      duration: `${compactNumber(Number(request.hours))} h`,
    })),
  ]
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 8);

  return (
    <AppShell
      displayName={displayName}
      role={roleLabel(roles)}
      requestCount={approvals.length + toilApprovals.length}
    >
      <section className="page-head split">
        <div>
          <p className="eyebrow">WORKFORCE AVAILABILITY</p>
          <h1>Welcome back, {employee.first_name}</h1>
          <p>Your balances, requests, TOIL and approval work are reading from the governed LeaveCtrl ledgers.</p>
        </div>
        <Link href="/book-leave" className="btn primary"><CalendarDays size={18}/> Book Leave</Link>
      </section>

      <section className="summary-grid">
        <SummaryCard
          tone="teal"
          icon={<CalendarDays size={20}/>}
          label="Annual Leave Available"
          value={compactNumber(annualBalance)}
          unit="days"
          sub={availableToil > 0 ? `${compactNumber(availableToil)}h TOIL also available` : annual ? "current ledger balance" : "setup required"}
        />
        <SummaryCard
          tone="amber"
          icon={<Clock3 size={20}/>}
          label="My Pending Requests"
          value={String(pendingMine)}
          unit={pendingMine === 1 ? "request" : "requests"}
          sub={approvals.length + toilApprovals.length
            ? `${approvals.length + toilApprovals.length} approval item${approvals.length + toilApprovals.length === 1 ? "" : "s"} for you`
            : "no approval work"}
        />
        <SummaryCard
          tone="blue"
          icon={<Users size={20}/>}
          label="Away Today"
          value={String(awayCount)}
          unit={awayCount === 1 ? "person" : "people"}
          sub="approved leave and TOIL"
        />
        <SummaryCard
          tone="red"
          icon={<AlertTriangle size={20}/>}
          label="Coverage Alerts"
          value={String(coverageAlerts)}
          unit={coverageAlerts === 1 ? "alert" : "alerts"}
          sub={coverageAlerts ? "minimum-staffing warnings awaiting approval" : "no active staffing warnings"}
        />
      </section>

      <section className="two-col">
        <div className="card data-card">
          <div className="card-title"><h2>My Leave & TOIL</h2><Link href="/requests">View all</Link></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Duration</th><th>Status</th></tr></thead>
              <tbody>
                {(myRequests ?? []).map((request) => (
                  <tr key={`leave:${request.id}`}>
                    <td>{formatDate(request.start_date)}{request.end_date !== request.start_date ? ` – ${formatDate(request.end_date)}` : ""}</td>
                    <td>{typeMap.get(request.leave_type_id) ?? "Leave"}</td>
                    <td>{compactNumber(Number(request.quantity))} {Number(request.quantity) === 1 ? "day" : "days"}</td>
                    <td><StatusPill status={request.status}/></td>
                  </tr>
                ))}
                {(myToilRequests ?? []).map((request) => (
                  <tr key={`toil:${request.id}`}>
                    <td>{formatDate(request.leave_date)}</td>
                    <td>TOIL</td>
                    <td>{compactNumber(Number(request.hours))} hours</td>
                    <td><StatusPill status={request.status}/></td>
                  </tr>
                ))}
                {!myRequests?.length && !myToilRequests?.length ? (
                  <tr><td colSpan={4} className="empty-table-cell">No requests yet. Your first submitted leave or TOIL request will appear here.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card approvals-card">
          <div className="card-title"><h2>Approvals / My Work</h2><Link href="/requests">View all</Link></div>
          <div className="approval-list">
            {combinedApprovals.slice(0, 3).map((request) => {
              const person = employeeMap.get(request.employeeId);
              const name = person ? `${person.first_name} ${person.last_name}` : "Employee";
              const initials = name.split(" ").map((value) => value[0]).slice(0, 2).join("");
              return (
                <div className="approval-row" key={`${request.kind}:${request.id}`}>
                  <div className="mini-avatar">{initials}</div>
                  <div className="approval-person"><strong>{name}</strong><span>{request.label}</span></div>
                  <div className="approval-date"><strong>{formatDate(request.date)}</strong><span>{request.duration}</span></div>
                  {request.kind === "leave" ? (
                    <DecisionButtons
                      requestId={request.id}
                      kind={request.status === "cancellation_requested" ? "cancellation" : "leave"}
                    />
                  ) : (
                    <ToilDecisionButtons
                      requestId={request.id}
                      kind={request.status === "cancellation_requested" ? "cancellation" : "request"}
                    />
                  )}
                </div>
              );
            })}
            {!combinedApprovals.length ? (
              <div className="empty-work-state">
                <strong>You&apos;re up to date</strong>
                <span>Actionable leave and TOIL work will remain here until it is resolved.</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card availability-card">
        <div className="availability-head">
          <div>
            <h2>Upcoming approved absence</h2>
            <p>A privacy-aware projection of approved leave and TOIL visible to your role.</p>
          </div>
          <Link href="/calendar" className="btn secondary">Open calendar</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Employee</th><th>Team</th><th>Absence</th><th>Date</th><th>Duration</th></tr></thead>
            <tbody>
              {upcomingAbsences.map((absence) => {
                const person = employeeMap.get(absence.employeeId);
                const departmentId = currentDepartmentMap.get(absence.employeeId) ?? person?.department_id ?? null;
                return (
                  <tr key={absence.id}>
                    <td>{person ? `${person.first_name} ${person.last_name}` : "Employee"}</td>
                    <td>{departmentId ? departmentMap.get(departmentId) ?? "—" : "—"}</td>
                    <td>{absence.type}</td>
                    <td>{formatDate(absence.start)}{absence.end !== absence.start ? ` – ${formatDate(absence.end)}` : ""}</td>
                    <td>{absence.duration}</td>
                  </tr>
                );
              })}
              {!upcomingAbsences.length ? (
                <tr><td colSpan={5} className="empty-table-cell">No approved upcoming absence is visible yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
