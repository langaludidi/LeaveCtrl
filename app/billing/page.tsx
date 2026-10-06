import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { loadAccessStates } from "@/lib/access-state";
import { billingSummary, billingConfiguration } from "@/lib/billing/server";
import { selectedPrice, zar } from "@/lib/billing/catalog";
import { AppShell } from "@/components/AppShell";
import {
  BillingControls,
  ReconcilePayment,
} from "@/components/BillingControls";
import { roleLabel } from "@/lib/current-context";
import type { SupabaseClient } from "@supabase/supabase-js";
export const dynamic = "force-dynamic";
export const metadata = { title: "Billing & subscription" };
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeZone: "Africa/Johannesburg",
      }).format(new Date(value))
    : "—";
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login?next=%2Fbilling");
  if (!hasVerifiedEmailOwnership(user))
    redirect("/confirm-email?next=%2Fbilling");
  const states = await loadAccessStates(client);
  if (states.length === 0)
    return (
      <main className="onboarding-page">
        <section className="onboarding-shell">
          <p className="eyebrow">SUBSCRIPTION SETUP</p>
          <h1>Connect your organisation first</h1>
          <p>
            Your subscription belongs to your organisation. Create its workspace
            before paying so we can allocate the correct features and employee
            capacity.
          </p>
          <Link className="btn primary" href="/onboarding?next=%2Fbilling">
            Create organisation
          </Link>
          <Link className="btn secondary" href="/join">
            Join by invitation
          </Link>
          <p>No payment has been taken.</p>
        </section>
      </main>
    );
  if (states.length !== 1) redirect("/access/organisation-context");
  const state = states[0];
  const supabase = client as SupabaseClient;
  let summary;
  try {
    summary = await billingSummary(supabase, state.organisation_id);
  } catch {
    return (
      <AppShell
        displayName={user.email ?? "LeaveCtrl User"}
        role={roleLabel(state.roles)}
      >
        <section className="card billing-choice">
          <h1>Billing setup in progress</h1>
          <p>
            Subscription records are not available yet. No payment will be
            taken. Contact{" "}
            <a href="mailto:director@leavectrl.co.za">
              director@leavectrl.co.za
            </a>{" "}
            for help.
          </p>
        </section>
      </AppShell>
    );
  }
  let configured = true;
  try {
    configured =
      billingConfiguration().mode === "live" &&
      process.env.LEAVECTRL_BILLING_ENABLED === "true";
  } catch {
    configured = false;
  }
  const chosen = selectedPrice(params.plan, params.interval);
  const saved = (await cookies())
    .get("leavectrl_selected_price")
    ?.value?.match(
      /^(starter|team|business|organisation)_(monthly|annual)_v1$/,
    );
  const initial = chosen ?? (saved ? selectedPrice(saved[1], saved[2]) : null);
  const { data: payments, error: paymentError } = summary.can_manage
    ? await supabase
        .from("billing_payments")
        .select(
          "reference,amount,currency,price_id,paid_at,period_end,refunded_amount,disputed",
        )
        .eq("organisation_id", state.organisation_id)
        .order("paid_at", { ascending: false })
        .limit(50)
    : { data: null, error: null };
  const { data: pending, error: pendingError } = summary.can_manage
    ? await supabase
        .from("billing_checkouts")
        .select("reference,amount,price_id,status,created_at")
        .eq("organisation_id", state.organisation_id)
        .in("status", ["pending", "ready"])
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: null, error: null };
  return (
    <AppShell
      displayName={user.email ?? "LeaveCtrl User"}
      role={roleLabel(state.roles)}
    >
      <header className="page-head">
        <p className="eyebrow">ORGANISATION SUBSCRIPTION</p>
        <h1>Billing &amp; subscription</h1>
        <p>
          Verified payments determine your organisation’s plan, employee
          capacity and period of access.
        </p>
      </header>
      <section className="card billing-summary">
        <div>
          <span>Current plan</span>
          <h2>{summary.plan_name}</h2>
          <p>
            {summary.state === "read_only"
              ? "Read only — renew to make changes"
              : summary.state === "trial"
                ? "30-day trial"
                : "Paid subscription"}
          </p>
        </div>
        <dl>
          <div>
            <dt>Active employees</dt>
            <dd>
              {summary.active_employees} / {summary.employee_limit}
            </dd>
          </div>
          <div>
            <dt>
              {summary.state === "trial" ? "Trial ends" : "Access through"}
            </dt>
            <dd>{date(summary.access_until)}</dd>
          </div>
          <div>
            <dt>Renewal</dt>
            <dd>
              {summary.provider_status ??
                (summary.state === "trial"
                  ? "No card required"
                  : "Linking payment")}
            </dd>
          </div>
        </dl>
      </section>
      {!summary.can_write ? (
        <p className="auth-alert" role="status">
          Existing leave balances and records remain available. New leave
          transactions and administration changes require an active
          subscription.
        </p>
      ) : null}
      {summary.can_manage ? (
        <BillingControls
          summary={summary}
          initialPlan={initial?.code}
          initialInterval={initial?.interval}
          configured={configured}
        />
      ) : (
        <section className="card billing-choice">
          <h2>Contact your organisation administrator</h2>
          <p>
            Your administrator manages payments, employee capacity and
            subscription renewal. Paying never changes an employee’s role or
            access to other organisations.
          </p>
        </section>
      )}
      {summary.can_manage ? (
        <section className="card billing-history">
          <div className="card-title">
            <h2>Payment history</h2>
            <Link href="/billing/export" className="btn secondary">
              Download CSV
            </Link>
          </div>
          <p>
            Amounts received and periods allocated from verified Paystack
            transactions. These records are payment receipts, not VAT invoices.
          </p>
          {paymentError ? (
            <p role="alert">Payment history could not be loaded.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Verified payments for this organisation
                </caption>
                <thead>
                  <tr>
                    <th>Paid</th>
                    <th>Reference</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Access through</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments?.map((p) => (
                    <tr key={p.reference}>
                      <td>{date(p.paid_at)}</td>
                      <td className="billing-reference">{p.reference}</td>
                      <td>
                        {p.price_id.replace(/_v1$/, " ").replaceAll("_", " ")}
                      </td>
                      <td>{zar(p.amount)}</td>
                      <td>{date(p.period_end)}</td>
                      <td>
                        {p.disputed
                          ? "Dispute under review"
                          : p.refunded_amount >= p.amount
                            ? "Refunded"
                            : p.refunded_amount > 0
                              ? "Partial refund"
                              : "Verified"}
                      </td>
                    </tr>
                  ))}
                  {!payments?.length ? (
                    <tr>
                      <td colSpan={6}>No verified payments yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {summary.can_manage ? (
        <section className="card billing-history">
          <h2>Unsettled checkouts</h2>
          <p>
            A pending checkout does not allocate paid functionality. Use “Check
            payment” if you paid but the return page was interrupted.
          </p>
          {pendingError ? (
            <p role="alert">Pending checkouts could not be loaded.</p>
          ) : pending?.length ? (
            pending.map((p) => (
              <div className="billing-pending" key={p.reference}>
                <div>
                  <strong>{zar(p.amount)}</strong>
                  <p className="billing-reference">{p.reference}</p>
                  <small>
                    Started {date(p.created_at)} · {p.status}
                  </small>
                </div>
                <ReconcilePayment reference={p.reference} />
              </div>
            ))
          ) : (
            <p>No unsettled checkouts.</p>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
