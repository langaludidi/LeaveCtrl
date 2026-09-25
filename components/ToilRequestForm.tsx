"use client";

import { FormEvent, useState } from "react";
import { Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ToilRequestForm({ availableHours }: { availableHours: number }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (availableHours <= 0) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const { error: rpcError } = await createClient().rpc("submit_toil_request", {
      p_leave_date: String(form.get("leaveDate") ?? ""),
      p_hours: Number(form.get("hours") ?? 0),
      p_note: String(form.get("note") ?? "").trim() || undefined,
    });

    setSaving(false);

    if (rpcError) {
      const messages: Record<string, string> = {
        insufficient_toil_balance: "You do not have enough TOIL hours for this request.",
        not_scheduled_working_day: "TOIL can only be used on a scheduled working day.",
        toil_exceeds_scheduled_hours: "Requested TOIL exceeds your scheduled hours for that day.",
        public_holiday_not_chargeable: "TOIL is not required on this configured public holiday.",
        overlapping_leave_request: "You already have a leave request covering this date.",
        overlapping_toil_request: "You already have a TOIL request for this date.",
        blocked_period: "TOIL cannot be booked during this organisation-wide blocked period.",
        coverage_rule_block: "This TOIL request would breach a minimum staffing rule for your team.",
        employee_profile_required: "Your active employment access could not be confirmed.",
      };
      setError(messages[rpcError.message] ?? "We could not submit this TOIL request.");
      return;
    }

    router.push("/requests?toilSubmitted=1");
    router.refresh();
  }

  return (
    <section className="card toil-request-card">
      <div className="card-title">
        <div>
          <h2>Use TOIL</h2>
          <p className="card-subtitle">
            Request time off against overtime already converted to time off in lieu.
          </p>
        </div>
        <span className="summary-icon"><Clock3 size={19}/></span>
      </div>

      <div className="toil-balance-highlight">
        <span>Available TOIL</span>
        <strong>{availableHours.toFixed(2)} hours</strong>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <form className="toil-request-form" onSubmit={submit}>
        <label>
          Date
          <input className="native-field" name="leaveDate" type="date" required />
        </label>
        <label>
          Hours
          <input
            className="native-field"
            name="hours"
            type="number"
            min="0.25"
            max={availableHours}
            step="0.25"
            required
          />
        </label>
        <label className="wide-field">
          Note <span className="muted">(optional)</span>
          <input className="native-field" name="note" />
        </label>
        <button className="btn primary" type="submit" disabled={saving}>
          <Clock3 size={16}/>{saving ? "Submitting…" : "Request TOIL"}
        </button>
      </form>
    </section>
  );
}
