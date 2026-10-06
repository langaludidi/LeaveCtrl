import Link from "next/link";
import { ReconcilePayment } from "@/components/BillingControls";
export const dynamic = "force-dynamic";
export default async function PaymentReturn({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref;
  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <p className="eyebrow">SECURE PAYMENT VERIFICATION</p>
        <h1>Check your subscription payment</h1>
        <p>
          We verify the transaction with Paystack before allocating your plan.
          Returning from checkout alone does not confirm payment.
        </p>
        {reference && /^[A-Za-z0-9_-]{6,100}$/.test(reference) ? (
          <>
            <p className="billing-reference">Reference: {reference}</p>
            <ReconcilePayment reference={reference} />
          </>
        ) : (
          <p role="alert">
            No valid payment reference was provided. Check your pending payments
            in Billing.
          </p>
        )}
        <Link className="btn secondary" href="/billing">
          Open billing &amp; subscription
        </Link>
      </section>
    </main>
  );
}
