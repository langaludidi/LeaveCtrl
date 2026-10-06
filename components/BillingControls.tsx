"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BILLING_PLANS,
  zar,
  selectedPrice,
  type BillingSummary,
} from "@/lib/billing/catalog";

const messages: Record<string, string> = {
  billing_configuration_required:
    "Online payments are being configured. No payment has been taken. Contact director@leavectrl.co.za for help.",
  billing_record_rejected:
    "This subscription needs review before another checkout can start. Check pending payments or manage your existing subscription.",
  payment_not_verified:
    "Payment is not confirmed yet. Please check again shortly; your plan changes only after verification.",
  payment_amount_mismatch:
    "The payment does not match this subscription. Please contact LeaveCtrl with your payment reference.",
  subscription_not_yet_linked:
    "Your subscription is still being linked to Paystack. Check again shortly or contact LeaveCtrl.",
  existing_subscription_requires_management:
    "Your existing subscription is still active. Manage its renewal before starting another subscription.",
  checkout_initialising:
    "Your checkout is already being prepared. Wait a moment, then try again; this will reuse the same payment reference.",
  checkout_already_pending:
    "A checkout is already pending for another plan. Check that payment before starting another subscription.",
  plan_employee_limit_exceeded:
    "Choose a plan that includes all of your active employees.",
};
export function BillingControls({
  summary,
  initialPlan,
  initialInterval,
  configured,
}: {
  summary: BillingSummary;
  initialPlan?: string;
  initialInterval?: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(
    initialPlan ?? summary.plan_code ?? "starter",
  );
  const [interval, setInterval] = useState(
    initialInterval ?? summary.interval ?? "monthly",
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const price = selectedPrice(plan, interval);
  const canStart =
    summary.state !== "active" &&
    (!summary.has_subscription ||
      ["cancelled", "completed"].includes(summary.provider_status ?? ""));
  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/billing/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "billing_unavailable");
      if (result.url) window.location.assign(result.url);
      else {
        setMessage("Subscription updated from the verified payment record.");
        router.refresh();
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "billing_unavailable";
      setMessage(
        messages[code] ??
          "We could not complete this billing action. Your existing records are unchanged. Please try again or contact LeaveCtrl.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card billing-choice">
      <h2>Subscription administration</h2>
      {summary.has_subscription ? (
        <>
          <p>
            Use Paystack’s secure portal to update your card or stop renewal.
            Cancelling renewal preserves access through your paid period.
          </p>
          <button
            className="btn secondary"
            disabled={busy || !configured}
            onClick={() => act("manage")}
          >
            Manage card &amp; renewal
          </button>
          <p>
            For a change of plan or billing period, contact{" "}
            <a href="mailto:director@leavectrl.co.za">
              director@leavectrl.co.za
            </a>
            .
          </p>
        </>
      ) : summary.state === "active" ? (
        <p>
          Your payment is verified. We’re linking its recurring subscription to
          Paystack. You can already use your paid plan.
        </p>
      ) : null}
      {canStart ? (
        <>
          <p>
            Choose the employee capacity your organisation needs. Every paid
            plan includes leave, policy, coverage and core reporting.
          </p>
          <div className="billing-fields">
            <label>
              Employee band
              <select
                value={plan}
                onChange={(e) => {
                  setPlan(e.target.value);
                  setConsent(false);
                }}
              >
                {BILLING_PLANS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} — up to {p.maxEmployees} active employees
                  </option>
                ))}
              </select>
            </label>
            <label>
              Billing period
              <select
                value={interval}
                onChange={(e) => {
                  setInterval(e.target.value);
                  setConsent(false);
                }}
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual — two months free</option>
              </select>
            </label>
          </div>
          {price ? (
            <div className="billing-total">
              <strong>{zar(price.amount)}</strong>
              <span>
                per {price.interval === "annual" ? "year" : "month"}, paid in
                advance. VAT is not charged.
              </span>
            </div>
          ) : null}
          {price && summary.active_employees > price.maxEmployees ? (
            <p role="alert" className="auth-alert error">
              Your organisation has {summary.active_employees} active employees.
              Choose a band that includes all of them.
            </p>
          ) : null}
          <label className="billing-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I authorise a recurring{" "}
              {interval === "annual" ? "annual" : "monthly"} subscription at{" "}
              {price ? zar(price.amount) : "the selected price"}. I can stop
              renewal in the payment portal; paid access continues until the end
              of the paid period.
            </span>
          </label>
          {!configured ? (
            <p className="auth-alert" role="status">
              Online payments are being configured. Checkout is unavailable and
              no payment will be taken.
            </p>
          ) : null}
          <button
            className="btn primary"
            disabled={
              busy ||
              !configured ||
              !consent ||
              !price ||
              summary.active_employees > (price?.maxEmployees ?? 0)
            }
            onClick={() =>
              act("checkout", { priceId: price?.priceId, consent })
            }
          >
            {busy ? "Preparing secure checkout…" : "Continue to Paystack"}
          </button>
          <p className="billing-fineprint">
            Card details are entered on Paystack. LeaveCtrl activates your
            selected plan after the payment is verified.
          </p>
        </>
      ) : null}
      {message ? (
        <p className="auth-alert" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function ReconcilePayment({ reference }: { reference: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function verify() {
    setBusy(true);
    try {
      const r = await fetch("/api/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const v = await r.json();
      setMessage(
        r.ok
          ? "Payment verified. Your subscription record is up to date."
          : (messages[v.error] ??
              "Payment needs review. Please contact LeaveCtrl with this reference."),
      );
      if (r.ok) router.refresh();
    } catch {
      setMessage("Verification is unavailable. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="billing-reconcile">
      <button className="btn secondary" disabled={busy} onClick={verify}>
        {busy ? "Checking…" : "Check payment"}
      </button>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
