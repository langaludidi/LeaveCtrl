"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Check, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LeaveTypeOption = {
  id: string;
  name: string;
  code: string;
};

function estimateWeekdays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  let count = 0;

  while (cursor <= last) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

export function BookLeaveForm({
  leaveTypes,
  initialBalance,
}: {
  leaveTypes: LeaveTypeOption[];
  initialBalance: number;
}) {
  const router = useRouter();
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const estimate = useMemo(
    () => estimateWeekdays(startDate, endDate || startDate),
    [startDate, endDate]
  );

  const projected = Math.max(initialBalance - estimate, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leaveTypeId || !startDate || !endDate) return;

    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("submit_leave_request", {
      p_leave_type_id: leaveTypeId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_note: note || undefined,
    });

    if (rpcError) {
      const friendly: Record<string, string> = {
        insufficient_leave_balance: "You do not have enough available leave for these dates.",
        no_chargeable_working_days: "The selected dates do not contain a chargeable working day.",
        leave_policy_not_configured: "This leave type is not fully configured yet.",
        leave_entitlement_not_configured: "Your entitlement for this leave type has not been configured yet.",
      };
      setError(friendly[rpcError.message] ?? "We could not submit this request. Please review the dates and try again.");
      setSubmitting(false);
      return;
    }

    router.push("/requests?submitted=1");
    router.refresh();
  }

  return (
    <section className="booking-grid">
      <form className="card leave-form" onSubmit={submit}>
        <div className="section-heading">
          <h2>Leave details</h2>
          <p>Choose the leave type and dates. The server performs the authoritative calculation before submission.</p>
        </div>

        {error ? <div className="auth-alert error">{error}</div> : null}

        <label>
          Leave type
          <select
            className="native-field"
            value={leaveTypeId}
            onChange={(event) => setLeaveTypeId(event.target.value)}
            required
          >
            {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>

        <div className="field-row">
          <label>
            Start date
            <input
              className="native-field"
              type="date"
              value={startDate}
              onChange={(event) => {
                const value = event.target.value;
                setStartDate(value);
                if (!endDate || endDate < value) setEndDate(value);
              }}
              required
            />
          </label>
          <label>
            End date
            <input
              className="native-field"
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </label>
        </div>

        <label>
          Estimated duration
          <div className="duration-box">
            <span className="summary-icon"><CalendarDays size={20}/></span>
            <div>
              <strong>{estimate} {estimate === 1 ? "day" : "days"}</strong>
              <span>Weekday estimate; public holidays and your work schedule are checked on submission.</span>
            </div>
          </div>
        </label>

        <label>
          Note <span className="muted">(optional)</span>
          <textarea
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note for your approver..."
          />
          <span className="counter">{note.length} / 500</span>
        </label>

        <div className="form-actions">
          <button className="btn secondary" type="button" onClick={() => router.back()}>Cancel</button>
          <button className="btn primary" type="submit" disabled={submitting || !leaveTypes.length}>
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>

      <div className="booking-side">
        <section className="card balance-card">
          <div className="card-title"><h2>Leave balance</h2></div>
          <div className="balance-highlight">
            <span className="summary-icon"><CalendarDays size={20}/></span>
            <div>
              <span>Available balance</span>
              <strong>{initialBalance} <small>days</small></strong>
              <small>Current ledger balance, including pending reservations.</small>
            </div>
          </div>

          <div className="balance-math">
            <div>
              <span className="math-icon amber">−</span>
              <div><span>This request</span><strong>{estimate} days</strong></div>
            </div>
            <div>
              <span className="math-icon green">=</span>
              <div><span>Estimated after request</span><strong>{projected} days</strong></div>
            </div>
          </div>
        </section>

        <section className="card coverage-card">
          <h2>Team coverage</h2>
          <div className="coverage-alert">
            <Info size={21}/>
            <div>
              <strong>Coverage rules are being introduced progressively</strong>
              <p>Your entitlement and work-schedule checks are authoritative now. Capability and minimum-staffing rules will appear here once configured.</p>
            </div>
          </div>
        </section>

        <section className="card calc-card">
          <h2><Info size={19}/> How the calculation works</h2>
          <div className="calc-row"><span>Selected calendar period</span><strong>Checked</strong></div>
          <div className="calc-row"><span>Non-working schedule days</span><strong>Excluded</strong></div>
          <div className="calc-row"><span>Configured public holidays</span><strong>Excluded</strong></div>
          <div className="calc-row total"><span>Authoritative quantity</span><strong>Calculated on submit</strong></div>
        </section>
      </div>
    </section>
  );
}
