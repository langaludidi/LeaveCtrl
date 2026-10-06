import { createClient } from "@/lib/supabase/server";
import {
  verifyPayment,
  refreshSubscription,
  BillingError,
} from "@/lib/billing/server";
import {
  bodyJson,
  sameOrigin,
  billingResponse,
  billingFailure,
} from "@/lib/billing/http";
import type { SupabaseClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const client = await createClient();
    const { error } = await (client as SupabaseClient).rpc(
      "billing_operations_v1",
    );
    if (error) throw new BillingError("billing_operator_required", 403);
    const body = await bodyJson(request);
    if (
      typeof body.value !== "string" ||
      !/^[A-Za-z0-9_-]{6,100}$/.test(body.value)
    )
      throw new BillingError("invalid_payment_reference", 400);
    const orgId = body.value.startsWith("SUB_")
      ? await refreshSubscription(body.value)
      : (await verifyPayment(body.value)).applied.organisation_id;
    const { error: auditError } = await (client as SupabaseClient).rpc(
      "record_billing_operator_reconciliation_v1",
      { p_org_id: orgId, p_reference: body.value },
    );
    if (auditError)
      throw new BillingError("reconciliation_audit_unavailable", 503);
    return billingResponse({ reconciled: true });
  } catch (e) {
    return billingFailure(e);
  }
}
