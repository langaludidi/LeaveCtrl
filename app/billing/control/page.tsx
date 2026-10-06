import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { BillingOperatorControls } from "@/components/BillingOperatorControls";
export const dynamic = "force-dynamic";
export default async function BillingControl() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login?next=%2Fbilling%2Fcontrol");
  if (!hasVerifiedEmailOwnership(user)) redirect("/confirm-email");
  const { data, error } = await (client as SupabaseClient).rpc(
    "billing_operations_v1",
  );
  if (error)
    return (
      <main className="onboarding-page">
        <section className="onboarding-shell">
          <h1>Billing operator access required</h1>
          <p>
            This console is restricted to separately assigned LeaveCtrl billing
            operators. Organisation-admin permissions do not grant access to
            other customers.
          </p>
          <Link href="/billing">Return to organisation billing</Link>
        </section>
      </main>
    );
  const accounts = data.accounts as Array<Record<string, any>>,
    events = data.events as Array<Record<string, any>>;
  return (
    <main className="billing-console">
      <header className="page-head">
        <p className="eyebrow">LEAVECTRL BILLING OPERATIONS</p>
        <h1>Payments &amp; subscriptions</h1>
        <p>
          Latest 200 accounts and 100 provider events. Reconciliation verifies
          provider facts; it cannot manually grant a plan.
        </p>
        <Link href="/billing">My organisation billing</Link>
      </header>
      <BillingOperatorControls />
      <section className="card billing-history">
        <h2>Customer accounts</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Plan</th>
                <th>Paid through</th>
                <th>Provider status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.organisation_id}>
                  <td>{a.name}</td>
                  <td>{a.price_id ?? "Trial"}</td>
                  <td>{a.paid_until ?? "—"}</td>
                  <td>{a.provider_status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card billing-history">
        <h2>Provider event queue</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Event</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Review reason</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.event_key}>
                  <td>{e.received_at}</td>
                  <td>{e.event_type}</td>
                  <td>{e.status}</td>
                  <td className="billing-reference">
                    {e.reference ?? e.subscription_code ?? "—"}
                  </td>
                  <td>{e.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
