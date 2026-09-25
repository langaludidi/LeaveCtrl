import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pretty(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default async function CalendarPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 90);

  const [{ data: employees }, { data: leaveTypes }, { data: approved }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_types")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "cancellation_requested"])
      .gte("end_date", dateOnly(today))
      .lte("start_date", dateOnly(horizon))
      .order("start_date", { ascending: true }),
  ]);

  const employeeMap = new Map((employees ?? []).map((item) => [item.id, `${item.first_name} ${item.last_name}`]));
  const typeMap = new Map((leaveTypes ?? []).map((item) => [item.id, item.name]));

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split">
        <div>
          <h1>Calendar</h1>
          <p>Approved leave visible to your role over the next 90 days. Leave stays visible while a cancellation is awaiting approval.</p>
        </div>
        <div className="calendar-legend"><span className="legend-dot teal-dot"/> Approved leave</div>
      </section>

      <section className="card calendar-card">
        <div className="card-title"><h2>Upcoming availability</h2></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Employee</th><th>Leave type</th><th>From</th><th>To</th><th>Working days</th></tr></thead>
            <tbody>
              {(approved ?? []).map((request) => (
                <tr key={request.id}>
                  <td>{employeeMap.get(request.employee_id) ?? "Employee"}</td>
                  <td><span className="leave-chip annual">{typeMap.get(request.leave_type_id) ?? "Away"}</span></td>
                  <td>{pretty(request.start_date)}</td>
                  <td>{pretty(request.end_date)}</td>
                  <td>{Number(request.quantity)}</td>
                </tr>
              ))}
              {!approved?.length ? (
                <tr><td className="empty-table-cell" colSpan={5}>No approved leave is visible in the next 90 days.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
