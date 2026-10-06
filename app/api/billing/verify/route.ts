import {
  billingIdentity,
  verifyPayment,
  billingService,
  BillingError,
  refreshSubscription,
} from "@/lib/billing/server";
import {
  bodyJson,
  sameOrigin,
  billingResponse,
  billingFailure,
} from "@/lib/billing/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await bodyJson(request);
    const { orgId } = await billingIdentity();
    if (typeof body.reference !== "string")
      throw new BillingError("invalid_payment_reference", 400);
    const service = billingService();
    const { data: order } = await service
      .from("billing_checkouts")
      .select("reference")
      .eq("reference", body.reference)
      .eq("organisation_id", orgId)
      .maybeSingle();
    const { data: payment } = await service
      .from("billing_payments")
      .select("reference")
      .eq("reference", body.reference)
      .eq("organisation_id", orgId)
      .maybeSingle();
    if (!order && !payment) throw new BillingError("payment_not_found", 404);
    const result = await verifyPayment(body.reference);
    const { data: account } = await service
      .from("billing_accounts")
      .select("subscription_code")
      .eq("organisation_id", orgId)
      .single();
    if (account?.subscription_code)
      await refreshSubscription(account.subscription_code);
    return billingResponse({
      verified: true,
      reference: result.charge.reference,
    });
  } catch (e) {
    return billingFailure(e);
  }
}
