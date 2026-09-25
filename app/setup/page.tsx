import Link from "next/link";
import { CalendarDays, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InitialPolicyForm } from "@/components/InitialPolicyForm";
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

  const [{ data: annualType }, { data: holidays }] = await Promise.all([
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

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head setup-head">
        <Link className="back-link" href="/">← Back to Home</Link>
        <div className="split">
          <div>
            <h1>Administration</h1>
            <p>
              Govern leave policy, statutory calendar inputs and the rules that drive
              balances and chargeable leave days.
            </p>
          </div>
          <strong>South Africa · ZA</strong>
        </div>
      </section>

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
              <h3>Public holidays are operational data</h3>
              <p>Configured holidays are excluded from chargeable leave when they fall on a scheduled working day.</p>
            </div>
          </div>
        </aside>
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
