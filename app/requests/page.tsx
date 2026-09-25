import { AppShell } from "@/components/AppShell";
import { DecisionButtons } from "@/components/DecisionButtons";
import { RequestLifecycleAction } from "@/components/RequestLifecycleAction";
import { StatusPill } from "@/components/StatusPill";
import { ToilDecisionButtons, ToilLifecycleButton } from "@/components/ToilRequestActions";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; toilSubmitted?: string }>;
}) {
  const params = await searchParams;
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const [
    { data: leaveTypes },
    { data: employees },
    { data: myRequests },
    { data: visibleWork },
    { data: coverageChecks },
    { data: myToilRequests },
    { data: visibleToilWork },
  ] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status, submitted_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status, submitted_at")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["pending_approval", "cancellation_requested"])
      .order("submitted_at", { ascending: true }),
    supabase
      .from("leave_request_coverage_checks")
      .select("request_id, outcome")
      .eq("organisation_id", employee.organisation_id)
      .eq("outcome", "warning"),
    supabase
      .from("toil_requests")
      .select("id, employee_id, leave_date, hours, status, submitted_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("toil_requests")
      .select("id, employee_id, leave_date, hours, status, submitted_at")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["pending_approval", "cancellation_requested"])
      .order("submitted_at", { ascending: true }),
  ]);

  const typeMap = new Map((leaveTypes ?? []).map((item) => [item.id, item.name]));
  const employeeMap = new Map(
    (employees ?? []).map((item) => [item.id, `${item.first_name} ${item.last_name}`])
  );
  const approvals = (visibleWork ?? []).filter(
    (request) => request.employee_id !== employee.id
  );
  const toilApprovals = (visibleToilWork ?? []).filter(
    (request) => request.employee_id !== employee.id
  );

  const coverageWarningMap = new Map<string, number>();
  for (const check of coverageChecks ?? []) {
    coverageWarningMap.set(
      check.request_id,
      (coverageWarningMap.get(check.request_id) ?? 0) + 1
    );
  }

  return (
    <AppShell
      displayName={displayName}
      role={roleLabel(roles)}
      requestCount={approvals.length + toilApprovals.length}
    >
      <section className="page-head">
        <h1>Requests</h1>
        <p>Your leave and TOIL history, plus approval work that needs your attention.</p>
      </section>

      {params.submitted ? (
        <div className="success-banner">
          Your leave request was submitted and the balance reservation is now recorded.
        </div>
      ) : null}
      {params.toilSubmitted ? (
        <div className="success-banner">
          Your TOIL request was submitted and those hours are reserved while approval is pending.
        </div>
      ) : null}

      <section className="two-col">
        <div className="card data-card">
          <div className="card-title"><h2>My requests</h2></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {(myRequests ?? []).map((request) => (
                  <tr key={request.id}>
                    <td>
                      {formatDate(request.start_date)}
                      {request.end_date !== request.start_date
                        ? ` – ${formatDate(request.end_date)}`
                        : ""}
                    </td>
                    <td>{typeMap.get(request.leave_type_id) ?? "Leave"}</td>
                    <td>
                      {Number(request.quantity)} {Number(request.quantity) === 1 ? "day" : "days"}
                    </td>
                    <td><StatusPill status={request.status}/></td>
                    <td className="request-action-cell">
                      <RequestLifecycleAction requestId={request.id} status={request.status} />
                    </td>
                  </tr>
                ))}
                {(myToilRequests ?? []).map((request) => (
                  <tr key={request.id}>
                    <td>{formatDate(request.leave_date)}</td>
                    <td>TOIL</td>
                    <td>{Number(request.hours).toFixed(2)} hours</td>
                    <td><StatusPill status={request.status}/></td>
                    <td className="request-action-cell">
                      <ToilLifecycleButton requestId={request.id} status={request.status} />
                    </td>
                  </tr>
                ))}
                {!myRequests?.length && !myToilRequests?.length ? (
                  <tr>
                    <td colSpan={5} className="empty-table-cell">No leave or TOIL requests yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card approvals-card">
          <div className="card-title"><h2>Approvals / My Work</h2></div>
          <div className="approval-list">
            {approvals.map((request) => {
              const cancellation = request.status === "cancellation_requested";
              return (
                <div className="approval-row" key={request.id}>
                  <div className="mini-avatar">
                    {(employeeMap.get(request.employee_id) ?? "E")
                      .split(" ").map((x) => x[0]).slice(0, 2).join("")}
                  </div>
                  <div className="approval-person">
                    <strong>{employeeMap.get(request.employee_id) ?? "Employee"}</strong>
                    <span>
                      {cancellation ? "Cancellation · " : ""}
                      {typeMap.get(request.leave_type_id) ?? "Leave"}
                      {coverageWarningMap.get(request.id) ? " · Coverage warning" : ""}
                    </span>
                  </div>
                  <div className="approval-date">
                    <strong>
                      {formatDate(request.start_date)}
                      {request.end_date !== request.start_date
                        ? ` – ${formatDate(request.end_date)}`
                        : ""}
                    </strong>
                    <span>{Number(request.quantity)} {Number(request.quantity) === 1 ? "day" : "days"}</span>
                  </div>
                  <DecisionButtons requestId={request.id} kind={cancellation ? "cancellation" : "leave"} />
                </div>
              );
            })}

            {toilApprovals.map((request) => (
              <div className="approval-row" key={request.id}>
                <div className="mini-avatar">
                  {(employeeMap.get(request.employee_id) ?? "E")
                    .split(" ").map((x) => x[0]).slice(0, 2).join("")}
                </div>
                <div className="approval-person">
                  <strong>{employeeMap.get(request.employee_id) ?? "Employee"}</strong>
                  <span>
                    {request.status === "cancellation_requested"
                      ? "TOIL cancellation"
                      : "TOIL request"}
                  </span>
                </div>
                <div className="approval-date">
                  <strong>{formatDate(request.leave_date)}</strong>
                  <span>{Number(request.hours).toFixed(2)} hours</span>
                </div>
                <ToilDecisionButtons
                  requestId={request.id}
                  kind={request.status === "cancellation_requested" ? "cancellation" : "request"}
                />
              </div>
            ))}

            {!approvals.length && !toilApprovals.length ? (
              <div className="empty-work-state">
                <strong>Nothing needs your approval</strong>
                <span>New leave, cancellation and TOIL requests will appear here.</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
