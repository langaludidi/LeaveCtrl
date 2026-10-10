import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Clock3,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { getCurrentContext } from "@/lib/current-context";

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  }).format(dateFromKey(value));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dateFromKey(value));
}

function compact(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function unitLabel(unit: string | null, amount: number) {
  const base = unit === "hours" ? "hour" : "day";
  return amount === 1 ? base : `${base}s`;
}

function safeColour(value: string | null) {
  return ["teal", "blue", "amber", "purple", "rose", "slate"].includes(value ?? "")
    ? value!
    : "teal";
}

function weekdayMondayFirst(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function relativeDayLabel(target: string, businessDate: string) {
  const diff = Math.round(
    (dateFromKey(target).getTime() - dateFromKey(businessDate).getTime()) / 86_400_000
  );
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

function requestStatusCopy(status: string) {
  if (status === "cancellation_requested") return "Cancellation awaiting decision";
  return "Awaiting manager approval";
}

export default async function MyLeavePage() {
  const { supabase, employee, displayName, roles, businessDate } =
    await getCurrentContext();
  if (!employee) return null;

  const welcomeRequired = !roles.some((role) =>
    ["org_admin", "hr_admin"].includes(role)
  );
  if (welcomeRequired) {
    const { data: welcomeState } = await supabase
      .from("employees")
      .select("welcome_completed_at")
      .eq("id", employee.id)
      .maybeSingle();

    if (!welcomeState?.welcome_completed_at) redirect("/welcome");
  }

  const today = dateFromKey(businessDate);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  );
  const monthStartKey = dateKey(monthStart);
  const monthEndKey = dateKey(monthEnd);
  const teamWindowEnd = dateKey(addDays(today, 30));
  const holidayWindowEnd = dateKey(addDays(today, 60));

  const [
    { data: leaveTypes },
    { data: balances },
    { data: policies },
    { data: requests },
    { data: toilRequests },
    { data: toilBalance },
    { data: holidays },
    { data: workforceDirectory },
    { data: calendarFeed },
  ] = await Promise.all([
    supabase
      .from("leave_types")
      .select(
        "id, name, code, unit, category, colour_token, employee_visible"
      )
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .eq("employee_visible", true)
      .order("name"),
    supabase
      .from("leave_balances")
      .select("leave_type_id, available_balance, cycle_start, cycle_end")
      .eq("employee_id", employee.id),
    supabase
      .from("leave_policy_versions")
      .select(
        "leave_type_id, entitlement_method, cycle_months, cycle_basis, effective_from, effective_to, version"
      )
      .eq("organisation_id", employee.organisation_id)
      .lte("effective_from", businessDate)
      .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
      .order("effective_from", { ascending: false })
      .order("version", { ascending: false }),
    supabase
      .from("leave_requests")
      .select(
        "id, leave_type_id, start_date, end_date, quantity, status, submitted_at, created_at"
      )
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
      .gte("holiday_date", monthStartKey)
      .lte("holiday_date", holidayWindowEnd)
      .order("holiday_date"),
    supabase.rpc("get_workforce_directory"),
    supabase.rpc("get_workforce_calendar", {
      p_start_date: businessDate,
      p_end_date: teamWindowEnd,
    }),
  ]);

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: requestDays } = requestIds.length
    ? await supabase
        .from("leave_request_days")
        .select(
          "request_id, leave_date, chargeable_quantity, exclusion_reason"
        )
        .in("request_id", requestIds)
        .gte("leave_date", monthStartKey)
        .lte("leave_date", monthEndKey)
    : { data: [] };

  const typeMap = new Map((leaveTypes ?? []).map((type) => [type.id, type]));
  const balanceMap = new Map(
    (balances ?? []).map((row) => [row.leave_type_id, row])
  );

  const policyByType = new Map<
    string,
    NonNullable<typeof policies>[number]
  >();
  for (const policy of policies ?? []) {
    if (!policyByType.has(policy.leave_type_id)) {
      policyByType.set(policy.leave_type_id, policy);
    }
  }

  const priority = new Map([
    ["ANNUAL", 0],
    ["SICK", 1],
    ["FAMILY_RESPONSIBILITY", 2],
  ]);

  const leaveEntries = (leaveTypes ?? [])
    .map((type) => {
      const balance = balanceMap.get(type.id);
      const policy = policyByType.get(type.id);
      const method = policy?.entitlement_method ?? "fixed_days";
      const amount = Number(balance?.available_balance ?? 0);
      let value = "Not configured";
      let meta = "No current entitlement";
      let kind: "balance" | "event" | "no_balance" = "balance";

      if (method === "event_based") {
        value = "Event-based entitlement";
        meta = "Eligibility is assessed for the qualifying event";
        kind = "event";
      } else if (method === "no_balance") {
        value = "No balance";
        meta = "Request as needed under the applicable policy";
        kind = "no_balance";
      } else if (method === "manual_allocation" && !balance) {
        value = "Event-based allocation";
        meta = "Allocated when eligibility is confirmed";
        kind = "event";
      } else if (balance) {
        value = `${compact(amount)} ${unitLabel(type.unit, amount)}`;
        if (method === "statutory_sick") {
          meta = `Current ${policy?.cycle_months ?? 36}-month cycle`;
        } else if (method === "statutory_family_responsibility") {
          meta = "Current entitlement cycle";
        } else if (balance.cycle_start && balance.cycle_end) {
          meta = `${formatDate(balance.cycle_start, true)} – ${formatDate(
            balance.cycle_end,
            true
          )}`;
        } else {
          meta = "Current applicable cycle";
        }
      }

      return {
        id: type.id,
        code: type.code,
        name: type.name,
        value,
        meta,
        kind,
        colour: safeColour(type.colour_token ?? null),
        sort: priority.get(type.code) ?? 10,
      };
    })
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const toilHours = Number(toilBalance?.available_hours ?? 0);
  const availableEntries = [
    ...leaveEntries,
    {
      id: "toil",
      code: "TOIL",
      name: "TOIL",
      value: `${compact(toilHours)} ${toilHours === 1 ? "hour" : "hours"}`,
      meta: "Earned time off",
      kind: "balance" as const,
      colour: "purple",
      sort: 20,
    },
  ];
  const visibleAvailable = availableEntries.slice(0, 5);
  const hiddenAvailableCount = Math.max(availableEntries.length - visibleAvailable.length, 0);

  const pending = [
    ...(requests ?? [])
      .filter((request) =>
        ["pending_approval", "cancellation_requested"].includes(request.status)
      )
      .map((request) => ({
        id: request.id,
        href: `/requests/leave/${request.id}`,
        type: typeMap.get(request.leave_type_id)?.name ?? "Leave",
        dateLabel:
          request.start_date === request.end_date
            ? formatDate(request.start_date)
            : `${formatDate(request.start_date)} – ${formatDate(request.end_date)}`,
        status: request.status,
        submittedAt: request.submitted_at ?? request.created_at,
      })),
    ...(toilRequests ?? [])
      .filter((request) =>
        ["pending_approval", "cancellation_requested"].includes(request.status)
      )
      .map((request) => ({
        id: request.id,
        href: `/requests/toil/${request.id}`,
        type: "TOIL",
        dateLabel: formatDate(request.leave_date),
        status: request.status,
        submittedAt: request.submitted_at ?? request.created_at,
      })),
  ].sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));

  const nextAbsence = [
    ...(requests ?? [])
      .filter(
        (request) =>
          ["approved", "cancellation_requested"].includes(request.status) &&
          request.end_date >= businessDate
      )
      .map((request) => ({
        href: `/requests/leave/${request.id}`,
        start: request.start_date,
        end: request.end_date,
        label: typeMap.get(request.leave_type_id)?.name ?? "Leave",
        duration: `${compact(Number(request.quantity))} ${Number(request.quantity) === 1 ? "working day" : "working days"}`,
      })),
    ...(toilRequests ?? [])
      .filter(
        (request) =>
          ["approved", "cancellation_requested"].includes(request.status) &&
          request.leave_date >= businessDate
      )
      .map((request) => ({
        href: `/requests/toil/${request.id}`,
        start: request.leave_date,
        end: request.leave_date,
        label: "TOIL",
        duration: `${compact(Number(request.hours))} ${Number(request.hours) === 1 ? "hour" : "hours"}`,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start))[0];

  const requestMap = new Map((requests ?? []).map((request) => [request.id, request]));
  const leaveByDate = new Map<
    string,
    { typeName: string; colour: string; status: string; marker: string }
  >();

  for (const day of requestDays ?? []) {
    const request = requestMap.get(day.request_id);
    if (!request) continue;
    if (
      !["approved", "pending_approval", "cancellation_requested"].includes(
        request.status
      )
    ) {
      continue;
    }
    if (day.exclusion_reason || Number(day.chargeable_quantity ?? 0) <= 0) continue;

    const type = typeMap.get(request.leave_type_id);
    leaveByDate.set(day.leave_date, {
      typeName: type?.name ?? "Leave",
      colour: safeColour(type?.colour_token ?? null),
      status: request.status,
      marker: "L",
    });
  }

  const toilByDate = new Map(
    (toilRequests ?? [])
      .filter(
        (request) =>
          ["approved", "pending_approval", "cancellation_requested"].includes(
            request.status
          ) &&
          request.leave_date >= monthStartKey &&
          request.leave_date <= monthEndKey
      )
      .map((request) => [request.leave_date, request])
  );
  const holidayMap = new Map(
    (holidays ?? []).map((holiday) => [holiday.holiday_date, holiday.name])
  );

  const directoryMap = new Map(
    (workforceDirectory ?? []).map((person) => [person.employee_id, person])
  );
  const teamRows: Array<{
    employeeId: string;
    name: string;
    date: string;
    displayLabel: string;
  }> = [];
  const seenTeamMembers = new Set<string>();

  for (const absence of calendarFeed ?? []) {
    if (absence.employee_id === employee.id || seenTeamMembers.has(absence.employee_id)) {
      continue;
    }
    const person = directoryMap.get(absence.employee_id);
    if (!person) continue;
    seenTeamMembers.add(absence.employee_id);
    teamRows.push({
      employeeId: absence.employee_id,
      name: `${person.first_name} ${person.last_name}`,
      date: absence.absence_date,
      displayLabel: absence.display_label ?? "Away",
    });
  }

  const awayToday = new Set(
    (calendarFeed ?? [])
      .filter(
        (absence) =>
          absence.employee_id !== employee.id &&
          absence.absence_date === businessDate
      )
      .map((absence) => absence.employee_id)
  ).size;

  const nextHoliday = (holidays ?? []).find(
    (holiday) => holiday.holiday_date >= businessDate
  );

  const recent = [
    ...(requests ?? []).map((request) => ({
      id: `leave:${request.id}`,
      href: `/requests/leave/${request.id}`,
      date: request.start_date,
      type: typeMap.get(request.leave_type_id)?.name ?? "Leave",
      status: request.status,
      createdAt: request.created_at,
    })),
    ...(toilRequests ?? []).map((request) => ({
      id: `toil:${request.id}`,
      href: `/requests/toil/${request.id}`,
      date: request.leave_date,
      type: "TOIL",
      status: request.status,
      createdAt: request.created_at,
    })),
  ]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 5);

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const totalDays = monthEnd.getUTCDate();
  const leading = weekdayMondayFirst(year, month, 1);
  const calendarCells = Array.from(
    { length: leading + totalDays },
    (_, index) => (index < leading ? null : index - leading + 1)
  );
  const monthLabel = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(today);

  return (
    <AppShell displayName={displayName} roles={roles}>
      <section className="page-head my-leave-page-head">
        <div>
          <p className="eyebrow">MY LEAVE</p>
          <h1>My Leave</h1>
          <p>Your leave and availability at a glance.</p>
        </div>
        <Link href="/book-leave" className="btn primary my-leave-primary-cta">
          <CalendarPlus size={17} aria-hidden="true" />
          Book leave
        </Link>
      </section>

      <section className="card available-leave-card" aria-labelledby="available-leave-heading">
        <div className="my-leave-section-head">
          <div>
            <p className="section-kicker">AVAILABLE LEAVE</p>
            <h2 id="available-leave-heading">Your current position</h2>
          </div>
          <Link href="/book-leave">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="available-leave-list">
          {visibleAvailable.map((entry, index) => (
            <div
              className={`available-leave-row ${index === 0 ? "primary-balance" : ""}`}
              key={entry.id}
            >
              <div>
                <strong>{entry.name}</strong>
                <span>{entry.meta}</span>
              </div>
              <div className="available-leave-value">
                <strong>{entry.value}</strong>
                {entry.kind === "event" ? (
                  <span>Check eligibility</span>
                ) : entry.kind === "no_balance" ? (
                  <span>Request when needed</span>
                ) : null}
              </div>
            </div>
          ))}

          {!visibleAvailable.length ? (
            <div className="compact-empty-state">
              No employee-visible leave types are currently configured.
            </div>
          ) : null}
        </div>

        {hiddenAvailableCount ? (
          <Link href="/book-leave" className="available-leave-more">
            {hiddenAvailableCount} more configured leave {hiddenAvailableCount === 1 ? "type" : "types"}
          </Link>
        ) : null}
      </section>

      <section className="my-leave-action-grid">
        <Link
          href={pending[0]?.href ?? "/requests"}
          className="card my-leave-action-card"
          aria-label={
            pending.length
              ? `${pending.length} pending request${pending.length === 1 ? "" : "s"}. Open request details.`
              : "No pending requests. Open request history."
          }
        >
          <div className="action-card-heading">
            <span>PENDING</span>
            <Clock3 size={17} aria-hidden="true" />
          </div>
          {pending[0] ? (
            <>
              <strong>
                {pending.length} pending {pending.length === 1 ? "request" : "requests"}
              </strong>
              <span>{pending[0].type} · {pending[0].dateLabel}</span>
              <small>{requestStatusCopy(pending[0].status)}</small>
            </>
          ) : (
            <>
              <strong>No pending requests</strong>
              <small>Your submitted requests will appear here.</small>
            </>
          )}
        </Link>

        <Link
          href={nextAbsence?.href ?? "/calendar"}
          className="card my-leave-action-card"
          aria-label={
            nextAbsence
              ? `Next approved absence: ${nextAbsence.label}, ${formatLongDate(nextAbsence.start)}.`
              : "No approved leave coming up. Open calendar."
          }
        >
          <div className="action-card-heading">
            <span>NEXT ABSENCE</span>
            <CalendarDays size={17} aria-hidden="true" />
          </div>
          {nextAbsence ? (
            <>
              <strong>{nextAbsence.label}</strong>
              <span>
                {nextAbsence.start === nextAbsence.end
                  ? formatDate(nextAbsence.start)
                  : `${formatDate(nextAbsence.start)} – ${formatDate(nextAbsence.end)}`}
              </span>
              <small>{nextAbsence.duration} · {relativeDayLabel(nextAbsence.start, businessDate)}</small>
            </>
          ) : (
            <>
              <strong>Nothing scheduled</strong>
              <small>View calendar →</small>
            </>
          )}
        </Link>
      </section>

      <section className="card team-availability-card" aria-labelledby="team-availability-heading">
        <div className="my-leave-section-head">
          <div>
            <p className="section-kicker">AROUND YOU</p>
            <h2 id="team-availability-heading">Team availability</h2>
          </div>
          <Link href="/calendar">
            Full calendar <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="team-availability-summary">
          <div className="team-away-count">
            <Users size={18} aria-hidden="true" />
            <strong>{awayToday}</strong>
            <span>{awayToday === 1 ? "colleague away today" : "colleagues away today"}</span>
          </div>

          <div className="team-availability-list">
            {teamRows.slice(0, 3).map((item) => (
              <div key={item.employeeId}>
                <strong>{item.name}</strong>
                <span>
                  {item.date === businessDate ? "Away today" : `Away ${formatDate(item.date)}`}
                  {item.displayLabel !== "Away" ? ` · ${item.displayLabel}` : ""}
                </span>
              </div>
            ))}

            {!teamRows.length ? (
              <div className="compact-empty-state">No approved colleague absence in the next 30 days.</div>
            ) : null}
          </div>
        </div>

        {nextHoliday ? (
          <div className="next-public-holiday">
            <span>Next public holiday</span>
            <strong>{nextHoliday.name}</strong>
            <span>{formatLongDate(nextHoliday.holiday_date)}</span>
          </div>
        ) : null}
      </section>

      <section className="card landing-calendar-card" aria-labelledby="landing-calendar-heading">
        <div className="my-leave-section-head landing-calendar-head">
          <div>
            <p className="section-kicker">PERSONAL CALENDAR</p>
            <h2 id="landing-calendar-heading">{monthLabel}</h2>
          </div>
          <Link href="/calendar">
            Open calendar <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="landing-calendar-legend" aria-label="Calendar legend">
          <span><i className="legend-swatch leave-teal" aria-hidden="true" /> L · Leave</span>
          <span><i className="legend-swatch toil-swatch" aria-hidden="true" /> T · TOIL</span>
          <span><i className="legend-swatch is-pending" aria-hidden="true" /> Pending</span>
          <span><i className="legend-swatch holiday-swatch" aria-hidden="true" /> PH · Public holiday</span>
        </div>

        <div className="landing-month-calendar">
          <div className="landing-month-weekdays" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
              <span key={`${label}:${index}`}>{label}</span>
            ))}
          </div>
          <div className="landing-month-days">
            {calendarCells.map((day, index) => {
              if (!day) {
                return <span className="landing-calendar-day blank" key={`blank:${index}`} />;
              }

              const key = dateKey(new Date(Date.UTC(year, month, day)));
              const leave = leaveByDate.get(key);
              const toil = toilByDate.get(key);
              const holiday = holidayMap.get(key);
              const isToday = key === businessDate;
              const pendingStatus =
                leave?.status === "pending_approval" ||
                toil?.status === "pending_approval";
              const marker = holiday ? "PH" : leave ? "L" : toil ? "T" : "";
              const label = holiday
                ? `${formatLongDate(key)}. Public holiday: ${holiday}.`
                : leave
                  ? `${formatLongDate(key)}. ${leave.typeName}. ${leave.status.replaceAll("_", " ")}.`
                  : toil
                    ? `${formatLongDate(key)}. TOIL. ${toil.status.replaceAll("_", " ")}.`
                    : formatLongDate(key);

              return (
                <span
                  key={key}
                  aria-label={label}
                  title={label}
                  className={[
                    "landing-calendar-day",
                    isToday ? "today" : "",
                    holiday ? "holiday" : "",
                    leave && !holiday ? `leave-${leave.colour}` : "",
                    toil && !leave && !holiday ? "toil" : "",
                    pendingStatus && !holiday ? "pending" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span>{day}</span>
                  {marker ? <small>{marker}</small> : null}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card recent-request-card" aria-labelledby="recent-requests-heading">
        <div className="my-leave-section-head">
          <div>
            <p className="section-kicker">RECENT ACTIVITY</p>
            <h2 id="recent-requests-heading">Your requests</h2>
          </div>
          <Link href="/requests">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="recent-request-list">
          {recent.map((item) => (
            <Link href={item.href} key={item.id} className="recent-request-row">
              <div>
                <strong>{item.type}</strong>
                <span>{formatDate(item.date, true)}</span>
              </div>
              <StatusPill status={item.status} />
            </Link>
          ))}
          {!recent.length ? (
            <div className="compact-empty-state">
              No leave or TOIL requests yet.
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
