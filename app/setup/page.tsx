import Link from "next/link";
import { CalendarDays, Scale, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InitialPolicyForm } from "@/components/InitialPolicyForm";
import { OrganisationControls } from "@/components/OrganisationControls";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

function formatHolidayDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default async function SetupPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const canAdmin = roles.includes("org_admin") || roles.includes("hr_admin");

  const [
    { data: annualType },
    { data: holidays },
    { data: statutoryRules },
    { data: departments },
    { data: schedules },
    { data: people },
    { data: assignments },
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
      .gte("holiday_date", "2026-01-01")
      .lte("holiday_date", "2027-12-31")
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
  ]);

  let existingDays = 15;
  if (annualType) {
    const { data: policy } = await supabase
      .from("leave_policy_versions")
      .select("entitlement_amount")
      .eq("organisation_id", employee.organisation_id)
      .eq("leave_type_id", annualType.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    existingDays = Number(policy?.entitlement_amount ?? 15);
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
          <strong>South Africa · ZA</strong>
        </div>
      </section>

      {canAdmin ? (
        <>
          <section className="setup-grid">
            <InitialPolicyForm existingDays={existingDays}/>

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
              Official calendar entries currently loaded for 2026 and 2027,
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
