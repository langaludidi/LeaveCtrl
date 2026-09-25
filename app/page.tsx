import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight, Clock3, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DecisionButtons } from "@/components/DecisionButtons";
import { StatusPill } from "@/components/StatusPill";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function zaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const today = zaToday();

  const [
    { data: leaveTypes },
    { data: balances },
    { data: myRequests },
    { data: pendingVisible },
    { data: employees },
    { data: departments },
    { data: awayToday },
    { data: upcomingApproved },
  ] = await Promise.all([
    supabase.from("leave_types").select("id, name, code").eq("organisation_id", employee.organisation_id),
    supabase.from("leave_balances").select("leave_type_id, available_balance").eq("employee_id", employee.id),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status")
      .eq("organisation_id", employee.organisation_id)
      .eq("status", "pending_approval")
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
      .from("leave_requests")
      .select("id, employee_id")
      .eq("organisation_id", employee.organisation_id)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity")
      .eq("organisation_id", employee.organisation_id)
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(8),
  ]);

  const typeMap = new Map((leaveTypes ?? []).map((item) => [item.id, item.name]));
  const annual = (leaveTypes ?? []).find((item) => item.code === "ANNUAL");
  const balanceMap = new Map((balances ?? []).map((item) => [item.leave_type_id, Number(item.available_balance ?? 0)]));
  const annualBalance = annual ? balanceMap.get(annual.id) ?? 0 : 0;

  const employeeMap = new Map((employees ?? []).map((item) => [item.id, item]));
  const departmentMap = new Map((departments ?? []).map((item) => [item.id, item.name]));
  const approvals = (pendingVisible ?? []).filter((request) => request.employee_id !== employee.id);
  const pendingMine = (myRequests ?? []).filter((request) => request.status === "pending_approval").length;
  const awayCount = new Set((awayToday ?? []).map((item) => item.employee_id)).size;

  return (
    <AppShell
      displayName={displayName}
      role={roleLabel(roles)}
      requestCount={approvals.length}
    >
      <section className="page-head split">
        <div>
          <p className="eyebrow">WORKFORCE AVAILABILITY</p>
          <h1>Good morning, {employee.first_name}</h1>
          <p>Your balances, requests and approval work are now reading from the LeaveCtrl ledger.</p>
        </div>
        <Link href="/book-leave" className="btn primary"><CalendarDays size={18}/> Book Leave</Link>
      </section>

      <section className="summary-grid">
        <SummaryCard
          tone="teal"
          icon={<CalendarDays size={20}/>}
          label="Annual Leave Available"
          value={String(annualBalance)}
          unit="days"
          sub={annual ? "current ledger balance" : "setup required"}
        />
        <SummaryCard
          tone="amber"
          icon={<Clock3 size={20}/>}
          label="My Pending Requests"
          value={String(pendingMine)}
          unit={pendingMine === 1 ? "request" : "requests"}
          sub={approvals.length ? `${approvals.length} approval item${approvals.length === 1 ? "" : "s"} for you` : "no approval work"}
        />
        <SummaryCard
          tone="blue"
          icon={<Users size={20}/>}
          label="Away Today"
          value={String(awayCount)}
          unit={awayCount === 1 ? "person" : "people"}
          sub="visible to your role"
        />
        <SummaryCard
          tone="red"
          icon={<AlertTriangle size={20}/>}
          label="Coverage Alerts"
          value="0"
          unit="alerts"
          sub="coverage rules next"
        />
      </section>

      <section className="two-col">
        <div className="card data-card">
          <div className="card-title"><h2>My Leave & Requests</h2><Link href="/requests">View all</Link></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Dates</th><th>Type</th><th>Duration</th><th>Status</th></tr></thead>
              <tbody>
                {(myRequests ?? []).map((request) => (
                  <tr key={request.id}>
                    <td>{formatDate(request.start_date)}{request.end_date !== request.start_date ? ` – ${formatDate(request.end_date)}` : ""}</td>
                    <td>{typeMap.get(request.leave_type_id) ?? "Leave"}</td>
                    <td>{Number(request.quantity)} {Number(request.quantity) === 1 ? "day" : "days"}</td>
                    <td><StatusPill status={request.status}/></td>
                  </tr>
                ))}
                {!myRequests?.length ? (
                  <tr><td colSpan={4} className="empty-table-cell">No requests yet. Your first submitted request will appear here.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card approvals-card">
          <div className="card-title"><h2>Approvals / My Work</h2><Link href="/requests">View all</Link></div>
          <div className="approval-list">
            {approvals.slice(0, 3).map((request) => {
              const person = employeeMap.get(request.employee_id);
              const name = person ? `${person.first_name} ${person.last_name}` : "Employee";
              const initials = name.split(" ").map((value) => value[0]).slice(0, 2).join("");
              return (
                <div className="approval-row" key={request.id}>
                  <div className="mini-avatar">{initials}</div>
                  <div className="approval-person"><strong>{name}</strong><span>{typeMap.get(request.leave_type_id) ?? "Leave"}</span></div>
                  <div className="approval-date"><strong>{formatDate(request.start_date)}</strong><span>{Number(request.quantity)} {Number(request.quantity) === 1 ? "day" : "days"}</span></div>
                  <DecisionButtons requestId={request.id}/>
                </div>
              );
            })}
            {!approvals.length ? (
              <div className="empty-work-state">
                <strong>You're up to date</strong>
                <span>Actionable work will remain here until it is resolved.</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card availability-card">
        <div className="availability-head">
          <div>
            <h2>Upcoming approved leave</h2>
            <p>A privacy-aware projection of approved leave visible to your role.</p>
          </div>
          <Link href="/calendar" className="btn secondary">Open calendar</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Employee</th><th>Team</th><th>Leave</th><th>Dates</th><th>Days</th></tr></thead>
            <tbody>
              {(upcomingApproved ?? []).map((request) => {
                const person = employeeMap.get(request.employee_id);
                return (
                  <tr key={request.id}>
                    <td>{person ? `${person.first_name} ${person.last_name}` : "Employee"}</td>
                    <td>{person?.department_id ? departmentMap.get(person.department_id) ?? "—" : "—"}</td>
                    <td>{typeMap.get(request.leave_type_id) ?? "Away"}</td>
                    <td>{formatDate(request.start_date)}{request.end_date !== request.start_date ? ` – ${formatDate(request.end_date)}` : ""}</td>
                    <td>{Number(request.quantity)}</td>
                  </tr>
                );
              })}
              {!upcomingApproved?.length ? (
                <tr><td colSpan={5} className="empty-table-cell">No approved upcoming leave is visible yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
