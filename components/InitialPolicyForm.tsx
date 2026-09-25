"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function InitialPolicyForm({
  existingDays = 15,
  existingCycleBasis = "organisation_fixed",
  existingAnchorMonth = 1,
  existingAnchorDay = 1,
}: {
  existingDays?: number;
  existingCycleBasis?: "organisation_fixed" | "employment_anniversary";
  existingAnchorMonth?: number;
  existingAnchorDay?: number;
}) {
  const router = useRouter();
  const [annualDays, setAnnualDays] = useState(String(existingDays));
  const [cycleBasis, setCycleBasis] = useState(existingCycleBasis);
  const [anchorMonth, setAnchorMonth] = useState(String(existingAnchorMonth));
  const [anchorDay, setAnchorDay] = useState(String(existingAnchorDay));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveDate = useMemo(
    () => new Date().toISOString().slice(0, 10),
    []
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "configure_annual_leave_policy_v2",
      {
        p_annual_days: Number(annualDays),
        p_cycle_basis: cycleBasis,
        p_fixed_cycle_start_month:
          cycleBasis === "organisation_fixed" ? Number(anchorMonth) : undefined,
        p_fixed_cycle_start_day:
          cycleBasis === "organisation_fixed" ? Number(anchorDay) : undefined,
        p_effective_from: effectiveDate,
      } as never
    );

    if (rpcError) {
      setError("We could not save the annual leave policy. Check the values and try again.");
      setSaving(false);
      return;
    }

    router.refresh();
    setSaving(false);
  }

  return (
    <form className="card setup-card real-setup-card" onSubmit={submit}>
      <div className="section-heading">
        <h2>Annual leave policy</h2>
        <p>
          Set the employer entitlement and the cycle model used to create employee
          entitlement periods. Policy changes are effective-dated.
        </p>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <div className="setting-row">
        <div>
          <strong>Jurisdiction</strong>
          <span>Country and statutory-rule context for this workspace.</span>
        </div>
        <div className="inline-select">South Africa <span>ZA</span></div>
      </div>

      <div className="setting-row">
        <div>
          <strong>Annual leave allocation</strong>
          <span>Employer-configured annual entitlement. Opening balances can still be reconciled per employee.</span>
        </div>
        <label className="compact-field">
          <input
            type="number"
            min="1"
            step="0.5"
            value={annualDays}
            onChange={(event) => setAnnualDays(event.target.value)}
            required
          />
          <span>days</span>
        </label>
      </div>

      <div className="setting-row policy-cycle-row">
        <div>
          <strong>Leave cycle basis</strong>
          <span>
            Choose whether entitlement cycles follow each employee&apos;s employment
            anniversary or a common organisation leave year.
          </span>
        </div>
        <select
          className="native-field policy-cycle-select"
          value={cycleBasis}
          onChange={(event) =>
            setCycleBasis(
              event.target.value as "organisation_fixed" | "employment_anniversary"
            )
          }
        >
          <option value="employment_anniversary">Employment anniversary</option>
          <option value="organisation_fixed">Organisation fixed leave year</option>
        </select>
      </div>

      {cycleBasis === "organisation_fixed" ? (
        <div className="setting-row">
          <div>
            <strong>Organisation cycle starts</strong>
            <span>
              The same month and day applies to all employees. Existing historical
              entitlements are not rewritten.
            </span>
          </div>
          <div className="cycle-anchor-fields">
            <label>
              Month
              <input
                className="native-field"
                type="number"
                min="1"
                max="12"
                value={anchorMonth}
                onChange={(event) => setAnchorMonth(event.target.value)}
                required
              />
            </label>
            <label>
              Day
              <input
                className="native-field"
                type="number"
                min="1"
                max="31"
                value={anchorDay}
                onChange={(event) => setAnchorDay(event.target.value)}
                required
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="setup-reassurance">
          <Info size={19}/>
          <div>
            <strong>Employment-anniversary cycle</strong>
            <p>
              Each employee&apos;s cycle is derived from their start date. This keeps the
              statutory cycle distinct from any employer reporting year.
            </p>
          </div>
        </div>
      )}

      <div className="setup-reassurance">
        <Info size={19}/>
        <div>
          <strong>Governed configuration</strong>
          <p>
            Policy effectivity is separate from leave-cycle dates. The ledger remains
            append-only and historical entitlement periods are preserved.
          </p>
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn secondary" type="button" onClick={() => router.push("/")}>
          Save for later
        </button>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : <><Check size={17}/> Save annual leave policy</>}
        </button>
      </div>
    </form>
  );
}
