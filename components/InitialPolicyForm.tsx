"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function InitialPolicyForm({
  existingDays = 15,
}: {
  existingDays?: number;
}) {
  const router = useRouter();
  const [annualDays, setAnnualDays] = useState(String(existingDays));
  const [cycleStart, setCycleStart] = useState("2026-01-01");
  const [cycleEnd, setCycleEnd] = useState("2026-12-31");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("configure_initial_leave_policy", {
      p_annual_days: Number(annualDays),
      p_cycle_start: cycleStart,
      p_cycle_end: cycleEnd,
    });

    if (rpcError) {
      setError("We could not save the initial leave policy. Check the values and try again.");
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="card setup-card real-setup-card" onSubmit={submit}>
      <div className="section-heading">
        <h2>Initial annual leave policy</h2>
        <p>Set the organisation's starting entitlement and cycle. This is versioned so later changes do not rewrite history.</p>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <div className="setting-row">
        <div>
          <strong>Jurisdiction</strong>
          <span>Country and time-zone context for this workspace.</span>
        </div>
        <div className="inline-select">South Africa <span>ZA</span></div>
      </div>

      <div className="setting-row">
        <div>
          <strong>Annual leave allocation</strong>
          <span>Starting employer-configured entitlement for this leave cycle.</span>
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

      <div className="setting-row">
        <div>
          <strong>Leave cycle</strong>
          <span>The period to which this entitlement applies.</span>
        </div>
        <div className="field-row">
          <input
            className="native-field"
            type="date"
            value={cycleStart}
            onChange={(event) => setCycleStart(event.target.value)}
            required
          />
          <input
            className="native-field"
            type="date"
            min={cycleStart}
            value={cycleEnd}
            onChange={(event) => setCycleEnd(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="setup-reassurance">
        <Info size={19}/>
        <div>
          <strong>Governed configuration</strong>
          <p>The policy is stored as an effective-dated version and the opening entitlement is written to the leave ledger rather than saved as an editable balance.</p>
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn secondary" type="button" onClick={() => router.push("/")}>Save for later</button>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : <><Check size={17}/> Save policy and continue</>}
        </button>
      </div>
    </form>
  );
}
