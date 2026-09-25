import { AppShell } from "@/components/AppShell";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function fromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfMondayWeek(date: Date) {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function safeColour(value: string | null) {
  return ["teal", "blue", "amber", "purple", "rose", "slate"].includes(value ?? "")
    ? value!
    : "teal";
}

export default async function CalendarPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const now = new Date();
  const start = startOfMondayWeek(now);
  const days = Array.from({ length: 28 }, (_, index) => addDays(start, index));
  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[days.length - 1]);

  const [
    { data: employees },
    { data: departments },
    { data: currentConditions },
    { data: leaveTypes },
    { data: requests },
    { data: toilRequests },
    { data: holidays },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, department_id, employment_status")
      .eq("organisation_id", employee.organisation_id)
      .eq("employment_status", "active")
      .order("first_name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("employee_current_conditions")
      .select("employee_id, department_id")
      .eq("organisation_id", employee.organisation_id),
    supabase
      .from("leave_types")
      .select("id, code, name, colour_token")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, quantity, status")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "pending_approval", "cancellation_requested"])
      .lte("start_date", endKey)
      .gte("end_date", startKey),
    supabase
      .from("toil_requests")
      .select("id, employee_id, leave_date, hours, status")
      .eq("organisation_id", employee.organisation_id)
      .in("status", ["approved", "pending_approval"])
      .gte("leave_date", startKey)
      .lte("leave_date", endKey),
    supabase
      .from("public_holidays")
      .select("holiday_date, name")
      .eq("organisation_id", employee.organisation_id)
      .gte("holiday_date", startKey)
      .lte("holiday_date", endKey),
  ]);

  const departmentMap = new Map(
    (departments ?? []).map((department) => [department.id, department.name])
  );
  const currentDepartmentMap = new Map(
    (currentConditions ?? []).map((condition) => [condition.employee_id, condition.department_id])
  );
  const typeMap = new Map((leaveTypes ?? []).map((type) => [type.id, type]));
  const holidayMap = new Map(
    (holidays ?? []).map((holiday) => [holiday.holiday_date, holiday.name])
  );

  const requestByEmployeeDate = new Map<string, NonNullable<typeof requests>[number]>();
  const toilByEmployeeDate = new Map<string, NonNullable<typeof toilRequests>[number]>();
  const requestPriority = (status: string) =>
    status === "approved" || status === "cancellation_requested" ? 2 : 1;

  for (const request of requests ?? []) {
    let cursor = fromKey(request.start_date);
    const requestEnd = fromKey(request.end_date);

    while (cursor <= requestEnd) {
      const key = dateKey(cursor);
      if (key >= startKey && key <= endKey) {
        const mapKey = `${request.employee_id}:${key}`;
        const existing = requestByEmployeeDate.get(mapKey);
        if (!existing || requestPriority(request.status) > requestPriority(existing.status)) {
          requestByEmployeeDate.set(mapKey, request);
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  for (const request of toilRequests ?? []) {
    toilByEmployeeDate.set(`${request.employee_id}:${request.leave_date}`, request);
  }

  const visibleEmployees = [...(employees ?? [])].sort((a, b) => {
    const departmentAId = currentDepartmentMap.get(a.id) ?? a.department_id;
    const departmentBId = currentDepartmentMap.get(b.id) ?? b.department_id;
    const departmentA = departmentAId ? departmentMap.get(departmentAId) ?? "" : "";
    const departmentB = departmentBId ? departmentMap.get(departmentBId) ?? "" : "";
    return departmentA.localeCompare(departmentB) ||
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split">
        <div>
          <p className="eyebrow">WORKFORCE AVAILABILITY</p>
          <h1>Company Calendar</h1>
          <p>
            A four-week operational view of approved and pending leave, TOIL, public
            holidays and employee availability visible to your role.
          </p>
        </div>

        <div className="calendar-legend calendar-legend-wrap">
          {(leaveTypes ?? []).map((type) => (
            <span key={type.id} className="calendar-legend-item">
              <i className={`legend-swatch leave-${safeColour(type.colour_token)}`}/>
              {type.name}
            </span>
          ))}
          <span className="calendar-legend-item">
            <i className="legend-swatch toil-swatch"/>
            TOIL
          </span>
          <span className="calendar-legend-item">
            <i className="legend-swatch is-pending"/>
            Pending
          </span>
          <span className="calendar-legend-item">
            <i className="legend-swatch holiday-swatch"/>
            Public holiday
          </span>
        </div>
      </section>

      <section className="card company-calendar-card">
        <div className="calendar-range-title">
          <strong>
            {days[0].toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
            {" – "}
            {days[days.length - 1].toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
          </strong>
          <span>{visibleEmployees.length} visible employees</span>
        </div>

        <div className="company-calendar-scroll">
          <div
            className="company-calendar-grid"
            style={{ gridTemplateColumns: `220px repeat(${days.length}, 42px)` }}
          >
            <div className="calendar-corner">Employee</div>

            {days.map((day) => {
              const key = dateKey(day);
              const holiday = holidayMap.get(key);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  className={`calendar-day-head ${weekend ? "weekend" : ""} ${holiday ? "holiday" : ""}`}
                  key={key}
                  title={holiday ?? undefined}
                >
                  <span>{day.toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 2)}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              );
            })}

            {visibleEmployees.map((person) => {
              const departmentId = currentDepartmentMap.get(person.id) ?? person.department_id;
              return (
                <div className="calendar-row-fragment" key={person.id}>
                  <div className="calendar-person">
                    <strong>{person.first_name} {person.last_name}</strong>
                    <span>
                      {departmentId
                        ? departmentMap.get(departmentId) ?? "No department"
                        : "No department"}
                    </span>
                  </div>

                  {days.map((day) => {
                    const key = dateKey(day);
                    const request = requestByEmployeeDate.get(`${person.id}:${key}`);
                    const toil = toilByEmployeeDate.get(`${person.id}:${key}`);
                    const holiday = holidayMap.get(key);
                    const weekend = day.getDay() === 0 || day.getDay() === 6;

                    if (request) {
                      const type = typeMap.get(request.leave_type_id);
                      const pending = request.status === "pending_approval";
                      const statusLabel = pending
                        ? "Pending"
                        : request.status === "cancellation_requested"
                          ? "Approved · cancellation pending"
                          : "Approved";

                      return (
                        <div
                          key={key}
                          className={`calendar-cell calendar-leave leave-${safeColour(type?.colour_token ?? null)} ${pending ? "is-pending" : ""}`}
                          title={`${person.first_name} ${person.last_name} · ${type?.name ?? "Leave"} · ${statusLabel}`}
                        >
                          <span>{type?.code?.slice(0, 2) ?? "L"}</span>
                        </div>
                      );
                    }

                    if (toil) {
                      const pending = toil.status === "pending_approval";
                      return (
                        <div
                          key={key}
                          className={`calendar-cell calendar-leave toil-cell ${pending ? "is-pending" : ""}`}
                          title={`${person.first_name} ${person.last_name} · TOIL · ${Number(toil.hours).toFixed(2)} hours · ${pending ? "Pending" : "Approved"}`}
                        >
                          <span>T</span>
                        </div>
                      );
                    }

                    if (holiday) {
                      return (
                        <div key={key} className="calendar-cell calendar-holiday" title={holiday}>
                          <span>PH</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={key}
                        className={`calendar-cell ${weekend ? "calendar-weekend" : ""}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
