import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Circle, Download, Scale, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InitialPolicyForm } from "@/components/InitialPolicyForm";
import { OrganisationControls } from "@/components/OrganisationControls";
import { AvailabilityControls } from "@/components/AvailabilityControls";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatHolidayDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default async function SetupPage() {
  const { supabase, employee, displayName, roles, businessDate } = await getCurrentContext();
  if (!employee) return null;

  const canAdmin = roles.includes("org_admin") || roles.includes("hr_admin");
  if (!canAdmin) redirect("/");
  const businessYear = Number(businessDate.slice(0, 4));
  const holidayStart = `${businessYear}-01-01`;
  const holidayEnd = `${businessYear + 1}-12-31`;

  const [
    { data: annualType },
    { data: holidays },
    { data: statutoryRules },
    { data: departments },
    { data: schedules },
    { data: people },
    { data: assignments },
    { data: leaveTypes },
    { data: blockedPeriods },
    { data: coverageRules },
  ] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id")
      .eq("organisation_id", employee.organisation_id)
      .eq("code", "ANNUAL")
      .maybeSingle(),
    supabase
      .from("public_holidays")
      .select("holiday_date, name, is_observed, is_one_off, source_kind")
      .eq("organisation_id", employee.organisation_id)
      .gte("holiday_date", holidayStart)
      .lte("holiday_date", holidayEnd)
      .order("holiday_date", { ascending: true }),
    supabase
      .from("statutory_leave_rules")
      .select("id, rule_code, name, calculation_method, legal_reference, effective_from")
      .eq("jurisdiction_code", "ZA")
      .is("effective_to", null)
      .order("name"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("work_schedules")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id)
      .order("name"),
    supabase
      .from("employees")
      .select("id, first_name, last_name, department_id")
      .eq("organisation_id", employee.organisation_id)
      .eq("employment_status", "active")
      .order("first_name"),
    supabase
      .from("employee_schedule_assignments")
      .select("employee_id, work_schedule_id, effective_from")
      .eq("organisation_id", employee.organisation_id)
      .is("effective_to", null)
      .order("effective_from", { ascending: false }),
    supabase
      .from("leave_types")
      .select("id, name")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("blocked_periods")
      .select("id, name, start_date, end_date, hard_block")
      .eq("organisation_id", employee.organisation_id)
      .order("start_date"),
    supabase
      .from("coverage_rules")
      .select("id, name, department_id, minimum_available, severity")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
  ]);

  let existingDays = 15;
  let hasAnnualPolicy = false;
  let existingCycleBasis: "organisation_fixed" | "employment_anniversary" =
    "organisation_fixed";
  let existingAnchorMonth = 1;
  let existingAnchorDay = 1;

  if (annualType) {
    const { data: policy } = await supabase
      .from("leave_policy_versions")
      .select("entitlement_amount, cycle_basis, cycle_anchor_month, cycle_anchor_day")
      .eq("organisation_id", employee.organisation_id)
      .eq("leave_type_id", annualType.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    hasAnnualPolicy = Boolean(policy);
    existingDays = Number(policy?.entitlement_amount ?? 15);
    existingCycleBasis =
      policy?.cycle_basis === "employment_anniversary"
        ? "employment_anniversary"
        : "organisation_fixed";
    existingAnchorMonth = Number(policy?.cycle_anchor_month ?? 1);
    existingAnchorDay = Number(policy?.cycle_anchor_day ?? 1);
  }

  const scheduleMap = new Map<string, string>();
  for (const assignment of assignments ?? []) {
    if (!scheduleMap.has(assignment.employee_id)) {
      scheduleMap.set(assignment.employee_id, assignment.work_schedule_id);
    }
  }

  const assignmentPeople = (people ?? []).map((person) => ({
    id: person.id,
    name: `${person.first_name} ${person.last_name}`,
    departmentId: person.department_id,
    scheduleId: scheduleMap.get(person.id) ?? null,
  }));

  const activePeopleCount = people?.length ?? 0;
  const assignedScheduleCount = assignmentPeople.filter((person) => person.scheduleId).length;
  const allPeopleScheduled =
    activePeopleCount > 0 && assignedScheduleCount === activePeopleCount;

  const readinessChecks = [
    {
      label: "Annual leave policy",
      detail: hasAnnualPolicy ? "Configured and versioned" : "Configure the annual leave policy",
      done: hasAnnualPolicy,
    },
    {
      label: "Work schedule coverage",
      detail: allPeopleScheduled
        ? "Every active employee has a schedule"
        : `${assignedScheduleCount} of ${activePeopleCount} active employees assigned`,
      done: allPeopleScheduled,
    },
    {
      label: "Employee records",
      detail: activePeopleCount
        ? `${activePeopleCount} active employee${activePeopleCount === 1 ? "" : "s"}`
        : "Add at least one employee",
      done: activePeopleCount > 0,
    },
    {
      label: "Public holiday calendar",
      detail: holidays?.length
        ? `${holidays.length} verified entries loaded for the current window`
        : "No public holidays loaded",
      done: Boolean(holidays?.length),
    },
  ];

  const readinessComplete = readinessChecks.filter((check) => check.done).length;

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head setup-head">
        <Link className="back-link" href="/">← Back to Home</Link>
        <div className="split">
          <div>
            <h1>Administration</h1>
            <p>
              Configure organisation structure, working patterns, leave policy and the
              statutory references LeaveCtrl uses to govern calculations.
            </p>
          </div>
          <div className="setup-head-actions">
            <a href="/setup/export" className="btn secondary">
              <Download size={16}/> Export organisation data
            </a>
            <strong>South Africa · ZA</strong>
          </div>
        </div>
      </section>

      {canAdmin ? (
        <>
          <section className="card readiness-card">
            <div className="readiness-overview">
              <div className="readiness-icon">
                {readinessComplete === readinessChecks.length
                  ? <CheckCircle2 size={22}/>
                  : <Circle size={22}/>}
              </div>
              <div>
                <span className="liability-kicker">SETUP READINESS</span>
                <h2>
                  {readinessComplete === readinessChecks.length
                    ? "Core leave controls are ready"
                    : `${readinessComplete} of ${readinessChecks.length} core checks complete`}
                </h2>
                <p>
                  LeaveCtrl only calls the workspace ready when policy, schedules,
                  people and the public-holiday calendar can support reliable calculations.
                </p>
              </div>
              <Link href="/team" className="btn secondary">
                <Users size={16}/> Manage people
              </Link>
            </div>
            <div className="readiness-checks">
              {readinessChecks.map((check) => (
                <div className={`readiness-check ${check.done ? "done" : ""}`} key={check.label}>
                  {check.done ? <CheckCircle2 size={15}/> : <Circle size={15}/>}
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="setup-grid">
            <InitialPolicyForm
              existingDays={existingDays}
              existingCycleBasis={existingCycleBasis}
              existingAnchorMonth={existingAnchorMonth}
              existingAnchorDay={existingAnchorDay}
              businessDate={businessDate}
            />

            <aside className="setup-side">
              <div className="card progress-card">
                <div className="ring"><ShieldCheck size={22}/></div>
                <div>
                  <h3>Policy-driven balances</h3>
                  <p>New employees inherit the active leave policy automatically. Opening balances remain auditable ledger adjustments.</p>
                </div>
              </div>

              <div className="card info-card">
                <CalendarDays size={19}/>
                <div>
                  <h3>Schedules drive calculations</h3>
                  <p>Working patterns and configured public holidays determine which dates consume leave.</p>
                </div>
              </div>
            </aside>
          </section>

          <OrganisationControls
            people={assignmentPeople}
            departments={departments ?? []}
            schedules={schedules ?? []}
            businessDate={businessDate}
          />

          <AvailabilityControls
            departments={departments ?? []}
            leaveTypes={leaveTypes ?? []}
            blockedPeriods={blockedPeriods ?? []}
            coverageRules={coverageRules ?? []}
          />
        </>
      ) : null}

      <section className="card statutory-card">
        <div className="availability-head">
          <div>
            <h2>South African statutory baseline registry</h2>
            <p>
              Versioned source rules are kept separately from employer policy so LeaveCtrl
              can explain what is statutory and what the organisation has chosen.
            </p>
          </div>
          <span className="verified-pill"><Scale size={14}/> Governed source</span>
        </div>

        <div className="statutory-grid">
          {(statutoryRules ?? []).map((rule) => (
            <div className="statutory-rule" key={rule.id}>
              <strong>{rule.name}</strong>
              <span>{rule.legal_reference}</span>
              <small>
                {rule.rule_code === "PARENTAL_INTERIM"
                  ? "Manual allocation review required"
                  : rule.calculation_method.replaceAll("_", " ")}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className="card holiday-admin-card">
        <div className="availability-head">
          <div>
            <h2>South African public holidays</h2>
            <p>
              Official calendar entries currently loaded for {businessYear} and {businessYear + 1},
              including observed days and one-off proclamations.
            </p>
          </div>
          <span className="verified-pill"><ShieldCheck size={14}/> Source verified</span>
        </div>

        <div className="holiday-grid">
          {(holidays ?? []).map((holiday) => (
            <div className="holiday-row" key={holiday.holiday_date}>
              <div className="holiday-date">{formatHolidayDate(holiday.holiday_date)}</div>
              <div className="holiday-name">
                <strong>{holiday.name}</strong>
                <span>
                  {holiday.is_one_off
                    ? "Presidential proclamation"
                    : holiday.is_observed
                      ? "Observed public holiday"
                      : "Public holiday"}
                </span>
              </div>
              {holiday.is_one_off ? <span className="special-pill">One-off</span> : null}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
