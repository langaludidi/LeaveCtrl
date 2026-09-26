import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function dateKey(date: Date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}
function fromKey(value: string) { return new Date(`${value}T12:00:00Z`); }
function addDays(date: Date, amount: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + amount); return next; }
function startOfMondayWeek(date: Date) { const day = date.getUTCDay(); return addDays(date, day === 0 ? -6 : 1 - day); }
function safeColour(value: string | null) { return ["teal", "blue", "amber", "purple", "rose", "slate"].includes(value ?? "") ? value! : "teal"; }
function formatRangeDate(date: Date, withYear = false) { return new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", day: "2-digit", month: "short", ...(withYear ? { year: "numeric" as const } : {}) }).format(date); }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const params = await searchParams;
  const { supabase, employee, displayName, roles, businessDate } = await getCurrentContext();
  if (!employee) return null;

  const canApprove = roles.some((role) => ["org_admin", "hr_admin", "manager"].includes(role));
  const candidate = params.start && /^\d{4}-\d{2}-\d{2}$/.test(params.start) ? params.start : businessDate;
  const start = startOfMondayWeek(fromKey(candidate));
  const days = Array.from({ length: 28 }, (_, index) => addDays(start, index));
  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[days.length - 1]);
  const previousStart = dateKey(addDays(start, -28));
  const nextStart = dateKey(addDays(start, 28));

  const [
    { data: employees }, { data: departments }, { data: currentConditions }, { data: leaveTypes },
    { data: calendarFeed }, { data: holidays },
  ] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, department_id, employment_status").eq("organisation_id", employee.organisation_id).eq("employment_status", "active").order("first_name"),
    supabase.from("departments").select("id, name").eq("organisation_id", employee.organisation_id),
    supabase.from("employee_current_conditions").select("employee_id, department_id").eq("organisation_id", employee.organisation_id),
    supabase.from("leave_types").select("id, code, name, colour_token").eq("organisation_id", employee.organisation_id).eq("active", true).order("name"),
    supabase.rpc("get_workforce_calendar", { p_start_date: startKey, p_end_date: endKey }),
    supabase.from("public_holidays").select("holiday_date, name").eq("organisation_id", employee.organisation_id).gte("holiday_date", startKey).lte("holiday_date", endKey),
  ]);

  // Pending requests are operational approval context, not general workforce-calendar data.
  // Only decision-making roles should query or render them. RLS remains the backend boundary;
  // this application gate prevents reporters/auditors from receiving unnecessary pending detail.
  const [{ data: pendingLeave }, { data: pendingToil }] = canApprove
    ? await Promise.all([
        supabase.from("leave_requests").select("id, employee_id, leave_type_id, status").eq("organisation_id", employee.organisation_id).eq("status", "pending_approval"),
        supabase.from("toil_requests").select("id, employee_id, leave_date, hours, status").eq("organisation_id", employee.organisation_id).eq("status", "pending_approval").gte("leave_date", startKey).lte("leave_date", endKey),
      ])
    : [{ data: [] }, { data: [] }];

  const pendingIds = (pendingLeave ?? []).map((request) => request.id);
  const { data: pendingLeaveDays } = canApprove && pendingIds.length
    ? await supabase.from("leave_request_days").select("request_id, leave_date, chargeable_quantity, exclusion_reason").in("request_id", pendingIds).gte("leave_date", startKey).lte("leave_date", endKey)
    : { data: [] };

  const departmentMap = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const currentDepartmentMap = new Map((currentConditions ?? []).map((condition) => [condition.employee_id, condition.department_id]));
  const typeMap = new Map((leaveTypes ?? []).map((type) => [type.id, type]));
  const pendingRequestMap = new Map((pendingLeave ?? []).map((request) => [request.id, request]));
  const holidayMap = new Map((holidays ?? []).map((holiday) => [holiday.holiday_date, holiday.name]));

  const approvedByEmployeeDate = new Map<string, NonNullable<typeof calendarFeed>[number]>();
  for (const absence of calendarFeed ?? []) approvedByEmployeeDate.set(`${absence.employee_id}:${absence.absence_date}`, absence);

  const pendingLeaveByEmployeeDate = new Map<string, NonNullable<typeof pendingLeave>[number]>();
  for (const day of pendingLeaveDays ?? []) {
    if (day.exclusion_reason || Number(day.chargeable_quantity ?? 0) <= 0) continue;
    const request = pendingRequestMap.get(day.request_id);
    if (request) pendingLeaveByEmployeeDate.set(`${request.employee_id}:${day.leave_date}`, request);
  }
  const pendingToilByEmployeeDate = new Map((pendingToil ?? []).map((request) => [`${request.employee_id}:${request.leave_date}`, request]));

  const visibleEmployees = [...(employees ?? [])].sort((a, b) => {
    const departmentAId = currentDepartmentMap.get(a.id) ?? a.department_id;
    const departmentBId = currentDepartmentMap.get(b.id) ?? b.department_id;
    const departmentA = departmentAId ? departmentMap.get(departmentAId) ?? "" : "";
    const departmentB = departmentBId ? departmentMap.get(departmentBId) ?? "" : "";
    return departmentA.localeCompare(departmentB) || `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  return <AppShell displayName={displayName} role={roleLabel(roles)}>
    <section className="page-head split"><div><p className="eyebrow">WORKFORCE AVAILABILITY</p><h1>Company Calendar</h1><p>A privacy-aware four-week view of approved absence{canApprove ? ", actionable pending requests" : ""} and public holidays.</p></div>
      <div className="calendar-legend calendar-legend-wrap">
        <span className="calendar-legend-item"><i className="legend-swatch leave-teal"/> Away</span>
        {(leaveTypes ?? []).map((type) => <span key={type.id} className="calendar-legend-item"><i className={`legend-swatch leave-${safeColour(type.colour_token)}`}/>{type.name}</span>)}
        <span className="calendar-legend-item"><i className="legend-swatch toil-swatch"/> TOIL</span>
        {canApprove ? <span className="calendar-legend-item"><i className="legend-swatch is-pending"/> Pending</span> : null}
        <span className="calendar-legend-item"><i className="legend-swatch holiday-swatch"/> Public holiday</span>
      </div>
    </section>

    <section className="card company-calendar-card">
      <div className="calendar-range-title"><div><strong>{formatRangeDate(days[0])} – {formatRangeDate(days[days.length - 1], true)}</strong><span>{visibleEmployees.length} active employees</span></div><div className="calendar-nav"><Link href={`/calendar?start=${previousStart}`} aria-label="Previous four weeks"><ChevronLeft size={16}/></Link><Link href="/calendar" className="today-link">Today</Link><Link href={`/calendar?start=${nextStart}`} aria-label="Next four weeks"><ChevronRight size={16}/></Link></div></div>
      <div className="company-calendar-scroll"><div className="company-calendar-grid" style={{ gridTemplateColumns: `220px repeat(${days.length}, 42px)` }}>
        <div className="calendar-corner">Employee</div>
        {days.map((day) => { const key = dateKey(day); const holiday = holidayMap.get(key); const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6; const today = key === businessDate; return <div className={["calendar-day-head", weekend ? "weekend" : "", holiday ? "holiday" : "", today ? "today-column" : ""].filter(Boolean).join(" ")} key={key} title={holiday ?? undefined}><span>{new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", weekday: "short" }).format(day).slice(0, 2)}</span><strong>{day.getUTCDate()}</strong></div>; })}
        {visibleEmployees.map((person) => { const departmentId = currentDepartmentMap.get(person.id) ?? person.department_id; return <div className="calendar-row-fragment" key={person.id}><div className="calendar-person"><strong>{person.first_name} {person.last_name}</strong><span>{departmentId ? departmentMap.get(departmentId) ?? "No department" : "No department"}</span></div>
          {days.map((day) => { const key = dateKey(day); const mapKey = `${person.id}:${key}`; const pendingLeaveRequest = pendingLeaveByEmployeeDate.get(mapKey); const pendingToilRequest = pendingToilByEmployeeDate.get(mapKey); const approved = approvedByEmployeeDate.get(mapKey); const holiday = holidayMap.get(key); const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6; const today = key === businessDate;
            if (pendingLeaveRequest) { const type = typeMap.get(pendingLeaveRequest.leave_type_id); return <div key={key} className={`calendar-cell calendar-leave leave-${safeColour(type?.colour_token ?? null)} is-pending ${today ? "today-column" : ""}`} title={`${person.first_name} ${person.last_name} · ${type?.name ?? "Leave"} · Pending`}><span>{type?.code?.slice(0, 2) ?? "L"}</span></div>; }
            if (pendingToilRequest) return <div key={key} className={`calendar-cell calendar-leave toil-cell is-pending ${today ? "today-column" : ""}`} title={`${person.first_name} ${person.last_name} · TOIL · Pending`}><span>T</span></div>;
            if (approved) { const sourceKind = approved.source_kind ?? "away"; const label = approved.display_label ?? "Away"; const code = sourceKind === "toil" ? "T" : sourceKind === "away" ? "A" : label.slice(0, 2).toUpperCase(); return <div key={key} className={`calendar-cell calendar-leave leave-${safeColour(approved.colour_token)} ${today ? "today-column" : ""}`} title={`${person.first_name} ${person.last_name} · ${label}`}><span>{code}</span></div>; }
            if (holiday) return <div key={key} className={`calendar-cell calendar-holiday ${today ? "today-column" : ""}`} title={holiday}><span>PH</span></div>;
            return <div key={key} className={["calendar-cell", weekend ? "calendar-weekend" : "", today ? "today-column" : ""].filter(Boolean).join(" ")}/>;
          })}
        </div>; })}
      </div></div>
    </section>
    <p className="calendar-privacy-note">Colleagues see that a person is away. Leave category and TOIL detail are shown only where the viewer has an authorised operational reason to see them.{canApprove ? " Pending requests are visible only as approval context." : " Pending requests are not included in this view."}</p>
  </AppShell>;
}
