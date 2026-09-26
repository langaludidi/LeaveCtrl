import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, ShieldCheck, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DecisionButtons } from "@/components/DecisionButtons";
import { RequestLifecycleAction } from "@/components/RequestLifecycleAction";
import { StatusPill } from "@/components/StatusPill";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function compact(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); }

export default async function LeaveRequestReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const { data: request } = await supabase.from("leave_requests").select("id, organisation_id, employee_id, leave_type_id, start_date, end_date, quantity, status, note, submitted_at, decided_at").eq("id", id).maybeSingle();
  if (!request) notFound();

  const [{ data: person }, { data: leaveType }, { data: balance }, { data: days }, { data: coverage }, { data: warnings }, { data: conditions }, { data: departments }] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, email, employee_number").eq("id", request.employee_id).maybeSingle(),
    supabase.from("leave_types").select("id, name, code").eq("id", request.leave_type_id).maybeSingle(),
    supabase.from("leave_balances").select("available_balance, cycle_start, cycle_end").eq("employee_id", request.employee_id).eq("leave_type_id", request.leave_type_id).maybeSingle(),
    supabase.from("leave_request_days").select("leave_date, scheduled_hours, chargeable_quantity, exclusion_reason").eq("request_id", request.id).order("leave_date"),
    supabase.from("leave_request_coverage_checks").select("leave_date, available_after_request, minimum_required, outcome, rule_id").eq("request_id", request.id).order("leave_date"),
    supabase.from("absence_request_warnings").select("warning_code, message").eq("leave_request_id", request.id),
    supabase.from("employee_current_conditions").select("department_id, work_mode").eq("employee_id", request.employee_id).maybeSingle(),
    supabase.from("departments").select("id, name").eq("organisation_id", request.organisation_id),
  ]);

  const departmentMap = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const coverageWarningCount = (coverage ?? []).filter((row) => row.outcome === "warning").length;
  const isOwner = request.employee_id === employee.id;
  const isDecisionRole = roles.some((role) => ["org_admin", "hr_admin", "manager"].includes(role));
  const pendingDecision = !isOwner && isDecisionRole && ["pending_approval", "cancellation_requested"].includes(request.status);

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split"><div><Link href="/requests" className="back-link"><ArrowLeft size={13}/> Back to requests</Link><p className="eyebrow">REQUEST REVIEW</p><h1>{person ? `${person.first_name} ${person.last_name}` : "Leave request"}</h1><p>{leaveType?.name ?? "Leave"} · {formatDate(request.start_date)}{request.end_date !== request.start_date ? ` – ${formatDate(request.end_date)}` : ""}</p></div><StatusPill status={request.status}/></section>

      <section className="review-summary-grid">
        <div className="card review-stat"><span>Requested</span><strong>{compact(Number(request.quantity))} <small>{Number(request.quantity) === 1 ? "day" : "days"}</small></strong><small>{leaveType?.name ?? "Leave"}</small></div>
        <div className="card review-stat"><span>Balance after reservation</span><strong>{balance ? compact(Number(balance.available_balance)) : "—"} <small>days</small></strong><small>{balance?.cycle_start && balance?.cycle_end ? `${formatDate(balance.cycle_start)} – ${formatDate(balance.cycle_end)}` : "No current entitlement"}</small></div>
        <div className="card review-stat"><span>Coverage</span><strong>{coverageWarningCount ? `${coverageWarningCount} warning${coverageWarningCount === 1 ? "" : "s"}` : "Within rule"}</strong><small>Minimum staffing checks recorded at submission</small></div>
        <div className="card review-stat"><span>Team context</span><strong className="review-stat-text">{conditions?.department_id ? departmentMap.get(conditions.department_id) ?? "Department" : "No department"}</strong><small>{conditions?.work_mode?.replaceAll("_", " ") ?? "Onsite"}</small></div>
      </section>

      <section className="review-layout"><div className="review-main">
        <section className="card review-card"><div className="card-title"><div><h2>Request details</h2><p className="card-subtitle">The exact working days and deductions recorded by LeaveCtrl.</p></div><CalendarDays size={18}/></div>
          <div className="review-meta"><div><span>Employee</span><strong>{person ? `${person.first_name} ${person.last_name}` : "Employee"}</strong></div><div><span>Email</span><strong>{person?.email ?? "—"}</strong></div><div><span>Employee no.</span><strong>{person?.employee_number ?? "—"}</strong></div><div><span>Submitted</span><strong>{request.submitted_at ? new Intl.DateTimeFormat("en-ZA",{dateStyle:"medium",timeStyle:"short"}).format(new Date(request.submitted_at)) : "—"}</strong></div></div>
          {request.note ? <div className="request-note"><span>Employee note</span><p>{request.note}</p></div> : null}
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Scheduled hours</th><th>Leave charge</th><th>Reason</th></tr></thead><tbody>{(days ?? []).map((day) => <tr key={day.leave_date}><td>{formatDate(day.leave_date)}</td><td>{compact(Number(day.scheduled_hours ?? 0))} h</td><td>{compact(Number(day.chargeable_quantity ?? 0))} d</td><td className="capitalize-cell">{day.exclusion_reason ? day.exclusion_reason.replaceAll("_", " ") : "Working day"}</td></tr>)}</tbody></table></div>
        </section>
        <section className="card review-card"><div className="card-title"><div><h2>Operational checks</h2><p className="card-subtitle">Coverage and availability evidence preserved from submission.</p></div><ShieldCheck size={18}/></div>
          {(warnings ?? []).length ? <div className="review-warning-list">{(warnings ?? []).map((warning,index) => <div key={`${warning.warning_code}:${index}`} className="review-warning"><AlertTriangle size={16}/><div><strong>{warning.warning_code.replaceAll("_", " ")}</strong><span>{warning.message}</span></div></div>)}</div> : null}
          <div className="coverage-review-list">{(coverage ?? []).map((check,index) => <div className="coverage-review-row" key={`${check.leave_date}:${index}`}><div><strong>{formatDate(check.leave_date)}</strong><span>{check.outcome === "warning" ? "Coverage warning" : "Coverage rule met"}</span></div><div><span>Available after request</span><strong>{check.available_after_request}</strong></div><div><span>Minimum required</span><strong>{check.minimum_required}</strong></div></div>)}{!coverage?.length && !warnings?.length ? <div className="empty-work-state"><strong>No operational exceptions recorded</strong><span>No configured coverage rule raised a warning for this request.</span></div> : null}</div>
        </section>
      </div>
      <aside className="review-side"><section className="card decision-card"><div className="decision-card-icon"><UserRound size={19}/></div><h2>{isOwner ? "My request" : request.status === "cancellation_requested" ? "Cancellation decision" : "Approval decision"}</h2><p>{isOwner ? "Manage your request here. Approval controls are only shown to authorised decision-makers." : "Review the balance, working-day calculation and coverage context before completing the decision."}</p>
        {isOwner ? <RequestLifecycleAction requestId={request.id} status={request.status}/> : pendingDecision ? <DecisionButtons requestId={request.id} kind={request.status === "cancellation_requested" ? "cancellation" : "leave"} showNote/> : <div className="decision-complete"><StatusPill status={request.status}/><span>{isDecisionRole ? "This workflow no longer needs a decision." : "You have read-only access to this request."}</span></div>}
      </section></aside></section>
    </AppShell>
  );
}
