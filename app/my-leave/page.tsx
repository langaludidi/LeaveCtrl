import Link from "next/link";
import { CalendarDays, CalendarPlus, Clock3, FileText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function compact(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function safeColour(value: string | null) {
  return ["teal", "blue", "amber", "purple", "rose", "slate"].includes(value ?? "")
    ? value!
    : "teal";
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function weekdayMondayFirst(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function dateKey(year: number, month: number, day: number) {
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function MyLeavePage() {
  const { supabase, employee, displayName, roles, businessDate } =
    await getCurrentContext();
  if (!employee) return null;

  const [
    { data: leaveTypes },
    { data: balances },
    { data: requests },
    { data: toilRequests },
    { data: toilBalance },
    { data: holidays },
  ] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, name, code, colour_token")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("leave_balances")
      .select("leave_type_id, available_balance, cycle_start, cycle_end")
      .eq("employee_id", employee.id),
    supabase
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, quantity, status, submitted_at, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("toil_requests")
      .select("id, leave_date, hours, status, submitted_at, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("toil_balances")
      .select("available_hours")
      .eq("employee_id", employee.id)
      .maybeSingle(),
    supabase
      .from("public_holidays")
      .select("holiday_date, name")
      .eq("organisation_id", employee.organisation_id)
      .gte("holiday_date", `${businessDate.slice(0, 4)}-01-01`)
      .lte("holiday_date", `${businessDate.slice(0, 4)}-12-31`)
      .order("holiday_date"),
  ]);

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: requestDays } = requestIds.length
    ? await supabase
        .from("leave_request_days")
        .select("request_id, leave_date, chargeable_quantity, exclusion_reason")
        .in("request_id", requestIds)
    : { data: [] };

  const typeMap = new Map((leaveTypes ?? []).map((type) => [type.id, type]));
  const balanceMap = new Map(
    (balances ?? []).map((row) => [row.leave_type_id, row])
  );
  const annualType = (leaveTypes ?? []).find((type) => type.code === "ANNUAL");
  const annualBalance = annualType
    ? Number(balanceMap.get(annualType.id)?.available_balance ?? 0)
    : 0;
  const annualCycle = annualType ? balanceMap.get(annualType.id) : null;
  const toilHours = Number(toilBalance?.available_hours ?? 0);

  const pendingCount =
    (requests ?? []).filter((request) =>
      ["pending_approval", "cancellation_requested"].includes(request.status)
    ).length +
    (toilRequests ?? []).filter((request) =>
      ["pending_approval", "cancellation_requested"].includes(request.status)
    ).length;

  const requestMap = new Map((requests ?? []).map((request) => [request.id, request]));
  const leaveByDate = new Map<
    string,
    { typeName: string; colour: string; status: string }
  >();

  for (const day of requestDays ?? []) {
    const request = requestMap.get(day.request_id);
    if (!request) continue;
    if (!["approved", "pending_approval", "cancellation_requested"].includes(request.status)) {
      continue;
    }
    if (day.exclusion_reason || Number(day.chargeable_quantity ?? 0) <= 0) continue;

    const type = typeMap.get(request.leave_type_id);
    leaveByDate.set(day.leave_date, {
      typeName: type?.name ?? "Leave",
      colour: safeColour(type?.colour_token ?? null),
      status: request.status,
    });
  }

  const toilByDate = new Map(
    (toilRequests ?? [])
      .filter((request) =>
        ["approved", "pending_approval", "cancellation_requested"].includes(request.status)
      )
      .map((request) => [request.leave_date, request])
  );
  const holidayMap = new Map(
    (holidays ?? []).map((holiday) => [holiday.holiday_date, holiday.name])
  );

  const recent = [
    ...(requests ?? []).map((request) => ({
      id: `leave:${request.id}`,
      date: request.start_date,
      type: typeMap.get(request.leave_type_id)?.name ?? "Leave",
      duration: `${compact(Number(request.quantity))} ${Number(request.quantity) === 1 ? "day" : "days"}`,
      status: request.status,
      createdAt: request.created_at,
    })),
    ...(toilRequests ?? []).map((request) => ({
      id: `toil:${request.id}`,
      date: request.leave_date,
      type: "TOIL",
      duration: `${compact(Number(request.hours))} hours`,
      status: request.status,
      createdAt: request.created_at,
    })),
  ]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 6);

  const upcoming = [
    ...(requests ?? [])
      .filter(
        (request) =>
          ["approved", "cancellation_requested"].includes(request.status) &&
          request.end_date >= businessDate
      )
      .map((request) => ({
        id: `leave:${request.id}`,
        date: request.start_date,
        label: typeMap.get(request.leave_type_id)?.name ?? "Leave",
        duration: `${compact(Number(request.quantity))} d`,
      })),
    ...(toilRequests ?? [])
      .filter(
        (request) =>
          ["approved", "cancellation_requested"].includes(request.status) &&
          request.leave_date >= businessDate
      )
      .map((request) => ({
        id: `toil:${request.id}`,
        date: request.leave_date,
        label: "TOIL",
        duration: `${compact(Number(request.hours))} h`,
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const year = Number(businessDate.slice(0, 4));

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head split">
        <div>
          <p className="eyebrow">MY LEAVE</p>
          <h1>My Leave</h1>
          <p>
            Your current entitlement position, approved absence and request history in one place.
          </p>
        </div>
        <Link href="/book-leave" className="btn primary">
          <CalendarPlus size={17}/> Book leave
        </Link>
      </section>

      <section className="my-leave-summary">
        <div className="my-leave-stat">
          <span>Annual leave available</span>
          <strong>{compact(annualBalance)} <small>days</small></strong>
          <small>
            {annualCycle?.cycle_start && annualCycle?.cycle_end
              ? `${formatDate(annualCycle.cycle_start)} – ${formatDate(annualCycle.cycle_end)}`
              : "No active annual entitlement"}
          </small>
        </div>
        <div className="my-leave-stat">
          <span>TOIL available</span>
          <strong>{compact(toilHours)} <small>hours</small></strong>
          <small>Earned and not yet used</small>
        </div>
        <div className="my-leave-stat">
          <span>Pending actions</span>
          <strong>{pendingCount} <small>{pendingCount === 1 ? "request" : "requests"}</small></strong>
          <small>Awaiting approval or cancellation decision</small>
        </div>
        <div className="my-leave-stat">
          <span>Next approved absence</span>
          <strong className="my-leave-next">
            {upcoming[0] ? formatDate(upcoming[0].date) : "None"}
          </strong>
          <small>{upcoming[0] ? `${upcoming[0].label} · ${upcoming[0].duration}` : "Nothing currently scheduled"}</small>
        </div>
      </section>

      <section className="my-leave-layout">
        <div className="card personal-calendar-card">
          <div className="card-title personal-calendar-head">
            <div>
              <h2>{year} personal calendar</h2>
              <p className="card-subtitle">
                Approved and pending leave, TOIL and public holidays.
              </p>
            </div>
            <div className="personal-calendar-legend">
              <span><i className="legend-swatch leave-teal"/> Leave</span>
              <span><i className="legend-swatch toil-swatch"/> TOIL</span>
              <span><i className="legend-swatch is-pending"/> Pending</span>
              <span><i className="legend-swatch holiday-swatch"/> Public holiday</span>
            </div>
          </div>

          <div className="year-calendar-grid">
            {monthNames.map((monthName, month) => {
              const totalDays = daysInMonth(year, month);
              const leading = weekdayMondayFirst(year, month, 1);
              const cells = Array.from({ length: leading + totalDays }, (_, index) =>
                index < leading ? null : index - leading + 1
              );

              return (
                <div className="month-card" key={monthName}>
                  <strong className="month-title">{monthName}</strong>
                  <div className="month-weekdays">
                    {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
                      <span key={`${label}:${index}`}>{label}</span>
                    ))}
                  </div>
                  <div className="month-days">
                    {cells.map((day, index) => {
                      if (!day) return <span className="month-day blank" key={`blank:${index}`}/>;

                      const key = dateKey(year, month, day);
                      const leave = leaveByDate.get(key);
                      const toil = toilByDate.get(key);
                      const holiday = holidayMap.get(key);
                      const isToday = key === businessDate;
                      const pending =
                        leave?.status === "pending_approval" ||
                        toil?.status === "pending_approval";

                      const title = holiday
                        ? holiday
                        : leave
                          ? `${leave.typeName} · ${leave.status.replaceAll("_", " ")}`
                          : toil
                            ? `TOIL · ${toil.status.replaceAll("_", " ")}`
                            : undefined;

                      return (
                        <span
                          key={key}
                          title={title}
                          className={[
                            "month-day",
                            isToday ? "today" : "",
                            holiday ? "holiday" : "",
                            leave && !holiday ? `leave-${leave.colour}` : "",
                            toil && !leave && !holiday ? "toil" : "",
                            pending && !holiday ? "pending" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          {day}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="my-leave-side">
          <section className="card my-balance-card">
            <div className="card-title">
              <h2>Current balances</h2>
              <CalendarDays size={18}/>
            </div>
            <div className="my-balance-list">
              {(leaveTypes ?? []).map((type) => {
                const balance = balanceMap.get(type.id);
                return (
                  <div key={type.id}>
                    <span>{type.name}</span>
                    <strong>
                      {balance
                        ? `${compact(Number(balance.available_balance))} days`
                        : "Not configured"}
                    </strong>
                  </div>
                );
              })}
              <div>
                <span>TOIL</span>
                <strong>{compact(toilHours)} hours</strong>
              </div>
            </div>
          </section>

          <section className="card upcoming-card">
            <div className="card-title">
              <h2>Upcoming</h2>
              <Clock3 size={18}/>
            </div>
            <div className="upcoming-list">
              {upcoming.map((item) => (
                <div key={item.id}>
                  <strong>{formatDate(item.date)}</strong>
                  <span>{item.label} · {item.duration}</span>
                </div>
              ))}
              {!upcoming.length ? (
                <p className="empty-compact">No approved future absence.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </section>

      <section className="card data-card my-leave-history">
        <div className="card-title">
          <div>
            <h2>Recent requests</h2>
            <p className="card-subtitle">Your latest leave and TOIL activity.</p>
          </div>
          <Link href="/requests">View all requests</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Duration</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.date)}</td>
                  <td>{item.type}</td>
                  <td>{item.duration}</td>
                  <td><StatusPill status={item.status}/></td>
                </tr>
              ))}
              {!recent.length ? (
                <tr>
                  <td colSpan={4} className="empty-table-cell">
                    No leave or TOIL requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="my-leave-footer-action">
        <Link href="/book-leave" className="btn secondary">
          <CalendarPlus size={16}/> Book another absence
        </Link>
        <Link href="/requests" className="btn ghost">
          <FileText size={16}/> Request history
        </Link>
      </div>
    </AppShell>
  );
}
