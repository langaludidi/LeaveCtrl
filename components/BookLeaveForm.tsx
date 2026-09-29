"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, Info, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LeaveTypeOption = {
  id: string;
  name: string;
  code: string;
  entitlementMethod: string;
};

type EvaluationOutcome = "ok" | "warning" | "blocked" | "not_applicable" | "not_evaluated";

type LeaveEvaluation = {
  ok: boolean;
  blocker_code?: string | null;
  message: string;
  request?: { leave_type?: string; unit?: string; quantity?: number; start_date?: string; end_date?: string; day_fraction?: number; };
  entitlement?: { outcome: EvaluationOutcome; available_before?: number | null; balance_after?: number | null; message: string; };
  policy?: { outcome: EvaluationOutcome; message: string; };
  coverage?: { outcome: EvaluationOutcome; warning_count?: number; warning_dates?: string[]; message: string; };
};

function EvaluationIcon({ outcome }: { outcome: EvaluationOutcome }) {
  if (outcome === "ok") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (outcome === "warning") return <AlertTriangle size={18} aria-hidden="true" />;
  if (outcome === "blocked") return <XCircle size={18} aria-hidden="true" />;
  return <Info size={18} aria-hidden="true" />;
}

function EvaluationRow({ label, outcome, message, value }: { label: string; outcome: EvaluationOutcome; message: string; value?: string; }) {
  return (
    <div className={`evaluation-row ${outcome}`}>
      <span className="evaluation-icon"><EvaluationIcon outcome={outcome} /></span>
      <div><strong>{label}</strong><span>{message}</span></div>
      {value ? <strong className="evaluation-value">{value}</strong> : null}
    </div>
  );
}

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
  balancesByType,
}: {
  leaveTypes: LeaveTypeOption[];
  balancesByType: Record<string, number>;
}) {
  const router = useRouter();
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayFraction, setDayFraction] = useState<1 | 0.5>(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<LeaveEvaluation | null>(null);

  const singleDay = Boolean(startDate && endDate && startDate === endDate);

  const estimate = useMemo(() => {
    const weekdays = estimateWeekdays(startDate, endDate || startDate);
    return singleDay && dayFraction === 0.5 ? weekdays * 0.5 : weekdays;
  }, [startDate, endDate, singleDay, dayFraction]);

  const selectedType = leaveTypes.find((type) => type.id === leaveTypeId) ?? leaveTypes[0];
  const currentBalance = balancesByType[leaveTypeId] ?? 0;
  const eventBased = selectedType?.entitlementMethod === "event_based";
  const noBalance = selectedType?.entitlementMethod === "no_balance";
  const balanceRequired = !eventBased && !noBalance;
  const manualAllocation = selectedType?.entitlementMethod === "manual_allocation";
  const projected = balanceRequired ? Math.max(currentBalance - estimate, 0) : currentBalance;

  function clearEvaluation() {
    setEvaluation(null);
    setError("");
  }

  const leaveGuidance = (() => {
    switch (selectedType?.code) {
      case "SICK":
        return "Your statutory sick balance is calculated from service length and your work schedule. A medical certificate may be required for longer or repeated absences.";
      case "FAMILY_RESPONSIBILITY":
        return "Eligibility is based on service length and working pattern. The employer may request reasonable proof of the qualifying event.";
      case "PARENTAL":
      case "ADOPTION":
      case "MATERNITY":
      case "COMMISSIONING_PARENTAL":
        return eventBased
          ? "This is an event-based entitlement. Eligibility must be confirmed for the qualifying event before an ordinary leave request is created."
          : "HR records the applicable allocation for the qualifying event before the balance can be used.";
      case "UNPAID":
        return "Unpaid leave does not consume an entitlement balance. Approval is still required and payroll may be affected.";
      case "ANNUAL":
        return "The statutory annual floor is schedule-aware. Public holidays and non-working days are excluded when the request is calculated.";
      default:
        return "This employer-defined leave follows the configured policy and approval workflow.";
    }
  })();

  async function evaluateRequest() {
    if (!leaveTypeId || !startDate || !endDate || eventBased) return;

    setEvaluating(true);
    setError("");

    const supabase = createClient();
    const { data, error: previewError } = await supabase.rpc("preview_leave_request_v1", {
      p_leave_type_id: leaveTypeId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_day_fraction: dayFraction,
    });

    if (previewError) {
      setError("We could not evaluate this request. Please try again.");
      setEvaluation(null);
      setEvaluating(false);
      return;
    }

    setEvaluation(data as LeaveEvaluation);
    setEvaluating(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leaveTypeId || !startDate || !endDate || eventBased) return;

    if (!evaluation) {
      await evaluateRequest();
      return;
    }

    if (!evaluation.ok) return;

    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("submit_leave_request_v2", {
      p_leave_type_id: leaveTypeId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_note: note || undefined,
      p_day_fraction: dayFraction,
    });

    if (rpcError) {
      const friendly: Record<string, string> = {
        insufficient_leave_balance: "You do not have enough available leave for these dates.",
        no_chargeable_working_days: "The selected dates do not contain a chargeable working day.",
        leave_policy_not_configured: "This leave type is not fully configured yet.",
        leave_entitlement_not_configured: "Your entitlement for this leave type has not been configured yet.",
        partial_day_requires_single_date: "Half-day leave can only be booked for a single date.",
        blocked_period: "Leave cannot be booked across one of your organisation's blocked periods.",
        coverage_rule_block: "This request would breach a minimum staffing rule for your team.",
        overlapping_leave_request: "You already have leave covering part of these dates.",
        overlapping_toil_request: "You already have TOIL covering part of these dates.",
        employee_profile_required: "Your active employment access could not be confirmed.",
        request_spans_leave_cycles: "This request crosses two leave cycles. Split it into separate requests at the cycle boundary.",
      };
      setError(
        friendly[rpcError.message] ??
          "We could not submit this request. Please review the dates and try again."
      );
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
          <p>
            Choose the leave type and dates. The server performs the authoritative
            calculation before submission.
          </p>
        </div>

        {error ? <div className="auth-alert error">{error}</div> : null}

        <label>
          Leave type
          <select
            className="native-field"
            value={leaveTypeId}
            onChange={(event) => {
              setLeaveTypeId(event.target.value);
              clearEvaluation();
            }}
            required
            disabled={!leaveTypes.length}
          >
            {!leaveTypes.length ? (
              <option value="">No leave types available</option>
            ) : leaveTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
          {!leaveTypes.length ? (
            <span className="field-help">Ask HR to configure at least one active leave type before booking leave.</span>
          ) : null}
        </label>

        <div className="setup-reassurance leave-guidance">
          <Info size={18}/>
          <div><strong>{selectedType?.name ?? "Leave"}</strong><p>{leaveGuidance}</p></div>
        </div>

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
                clearEvaluation();
                if (!endDate || endDate < value) {
                  setEndDate(value);
                  setDayFraction(1);
                } else if (endDate !== value) {
                  setDayFraction(1);
                }
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
              onChange={(event) => {
                const value = event.target.value;
                setEndDate(value);
                clearEvaluation();
                if (value !== startDate) setDayFraction(1);
              }}
              required
            />
          </label>
        </div>

        <label>
          Duration
          <div className="duration-choice" role="group" aria-label="Leave duration">
            <button
              className={dayFraction === 1 ? "active" : ""}
              type="button"
              onClick={() => {
                setDayFraction(1);
                clearEvaluation();
              }}
            >
              Full day
            </button>
            <button
              className={dayFraction === 0.5 ? "active" : ""}
              type="button"
              disabled={!singleDay}
              onClick={() => {
                setDayFraction(0.5);
                clearEvaluation();
              }}
            >
              Half day
            </button>
          </div>
          {!singleDay ? (
            <span className="field-help">Half day becomes available when the request is for one date.</span>
          ) : null}
        </label>

        <label>
          Estimated duration
          <div className="duration-box">
            <span className="summary-icon"><CalendarDays size={20}/></span>
            <div>
              <strong>{estimate} {estimate === 1 ? "day" : "days"}</strong>
              <span>Preview only. Your work schedule and public holidays are checked by the LeaveCtrl engine.</span>
            </div>
          </div>
        </label>

        <section className="request-evaluation" aria-labelledby="request-evaluation-heading">
          <div className="request-evaluation-head">
            <div><span>STEP 3</span><h3 id="request-evaluation-heading">System evaluation</h3></div>
            {evaluation?.ok ? <span className="evaluation-ready">Ready to submit</span> : null}
          </div>

          {eventBased ? (
            <div className="evaluation-empty event-based">
              <Info size={18} aria-hidden="true" />
              <div><strong>Eligibility check required</strong><span>This entitlement is event-based and should not be submitted as an ordinary running-balance request.</span></div>
            </div>
          ) : evaluation ? (
            <div className="evaluation-list" aria-live="polite">
              <EvaluationRow
                label="Entitlement"
                outcome={evaluation.entitlement?.outcome ?? "not_evaluated"}
                message={evaluation.entitlement?.message ?? "Not evaluated."}
                value={evaluation.entitlement?.balance_after != null ? `${evaluation.entitlement.balance_after} days after approval` : undefined}
              />
              <EvaluationRow label="Policy" outcome={evaluation.policy?.outcome ?? "not_evaluated"} message={evaluation.policy?.message ?? "Not evaluated."} />
              <EvaluationRow label="Coverage" outcome={evaluation.coverage?.outcome ?? "not_evaluated"} message={evaluation.coverage?.message ?? "Not evaluated."} />
              {evaluation.coverage?.outcome === "warning" ? (
                <div className="coverage-warning-note"><AlertTriangle size={17} aria-hidden="true" /><div><strong>Coverage warning</strong><span>{evaluation.coverage.message}</span></div></div>
              ) : null}
              {evaluation.ok && evaluation.request?.quantity != null ? (
                <div className="evaluation-summary"><span>Authoritative request quantity</span><strong>{evaluation.request.quantity} {evaluation.request.quantity === 1 ? "working day" : "working days"}</strong></div>
              ) : null}
              {!evaluation.ok ? (
                <div className="evaluation-blocker" role="alert"><XCircle size={17} aria-hidden="true" /><div><strong>Request needs attention</strong><span>{evaluation.message}</span></div></div>
              ) : null}
            </div>
          ) : (
            <div className="evaluation-empty"><Info size={18} aria-hidden="true" /><div><strong>Check before submitting</strong><span>LeaveCtrl will evaluate entitlement, policy and team coverage without creating a request.</span></div></div>
          )}
        </section>

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
          <button className="btn secondary" type="button" onClick={() => router.back()}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="submit"
            disabled={submitting || evaluating || !leaveTypes.length || eventBased || Boolean(evaluation && !evaluation.ok)}
          >
            {submitting
              ? "Submitting…"
              : evaluating
                ? "Checking…"
                : eventBased
                  ? "Eligibility check required"
                  : evaluation?.ok
                    ? "Submit request"
                    : "Check request"}
          </button>
        </div>
      </form>

      <div className="booking-side">
        <section className="card balance-card">
          <div className="card-title"><h2>Leave balance</h2></div>
          <div className="balance-highlight">
            <span className="summary-icon"><CalendarDays size={20}/></span>
            <div>
              <span>{balanceRequired ? "Available balance" : "Entitlement treatment"}</span>
              {balanceRequired ? (
                <strong>{currentBalance} <small>days</small></strong>
              ) : (
                <strong className="balance-text-value">
                  {eventBased ? "Event-based entitlement" : "No balance required"}
                </strong>
              )}
              <small>
                {balanceRequired
                  ? manualAllocation
                    ? "HR-confirmed event allocation, less pending reservations."
                    : "Current ledger balance, including pending reservations."
                  : eventBased
                    ? "Eligibility is assessed for the qualifying event rather than from a running balance."
                    : "This leave type is governed by approval and dates rather than an entitlement balance."}
              </small>
            </div>
          </div>

          <div className="balance-math">
            <div>
              <span className="math-icon amber">−</span>
              <div><span>This request</span><strong>{estimate} days</strong></div>
            </div>
            <div>
              <span className="math-icon green">=</span>
              <div>
                <span>{balanceRequired ? "Estimated after request" : "Balance after request"}</span>
                <strong>{balanceRequired ? `${projected} days` : "Not applicable"}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="card calc-card">
          <h2><Info size={19}/> Governed underneath</h2>
          <div className="calc-row"><span>Work schedule</span><strong>Evaluated</strong></div>
          <div className="calc-row"><span>Configured public holidays</span><strong>Excluded</strong></div>
          <div className="calc-row"><span>Policy rules</span><strong>Evaluated</strong></div>
          <div className="calc-row"><span>Team coverage</span><strong>Evaluated</strong></div>
          <div className="calc-row total"><span>Final quantity</span><strong>Confirmed before submission</strong></div>
        </section>
      </div>
    </section>
  );
}
