import { createHash } from "node:crypto";
import {
  billingConfiguration,
  billingService,
  verifyPayment,
  refreshSubscription,
  paystack,
  BillingError,
} from "@/lib/billing/server";
import {
  boundedBody,
  billingResponse,
  billingFailure,
} from "@/lib/billing/http";
import { signatureMatches, providerId } from "@/lib/billing/verification";
export const runtime = "nodejs";
export const maxDuration = 60;

async function adjustment(event: string, data: Record<string, any>) {
  const id = providerId(data.id);
  const refund = event.startsWith("refund.");
  const actual = await paystack<Record<string, any>>(
    `/${refund ? "refund" : "dispute"}/${id}`,
  );
  if (providerId(actual.id) !== id)
    throw new BillingError("adjustment_identity_mismatch");
  const tx = actual.transaction;
  const transactionId = providerId(typeof tx === "object" ? tx?.id : tx);
  const service = billingService();
  const { data: payment } = await service
    .from("billing_payments")
    .select("reference,amount,currency")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!payment) throw new BillingError("payment_not_recorded");
  // Read provider details; signed webhook fields alone do not change access.
  if (
    refund &&
    (actual.status !== "processed" ||
      actual.currency !== payment.currency ||
      !Number.isSafeInteger(actual.amount))
  )
    throw new BillingError("refund_not_verified");
  if (
    !refund &&
    ![
      "awaiting-merchant-feedback",
      "awaiting-bank-feedback",
      "pending",
      "resolved",
    ].includes(actual.status)
  )
    throw new BillingError("dispute_review_required");
  if (actual.domain !== billingConfiguration().mode)
    throw new BillingError("adjustment_mode_mismatch");
  const active =
    refund || actual.status !== "resolved" || actual.resolution !== "declined";
  const { error } = await service.rpc("adjust_billing_payment_v1", {
    p_adjustment_key: `${refund ? "refund" : "dispute"}:${id}`,
    p_transaction_id: transactionId,
    p_kind: refund ? "refund" : "dispute",
    p_amount: refund ? actual.amount : 0,
    p_active: active,
  });
  if (error) throw new BillingError("payment_adjustment_rejected");
}

async function processEvent(event: string, data: Record<string, any>) {
  if (event === "charge.success") {
    await verifyPayment(String(data.reference ?? ""));
    return true;
  }
  if (
    [
      "subscription.create",
      "subscription.not_renew",
      "subscription.disable",
      "invoice.payment_failed",
      "invoice.create",
    ].includes(event)
  ) {
    const code = String(
      data.subscription_code ?? data.subscription?.subscription_code ?? "",
    );
    await refreshSubscription(code);
    return true;
  }
  if (event === "invoice.update") {
    const code = String(
      data.subscription?.subscription_code ?? data.subscription_code ?? "",
    );
    if (data.transaction?.reference)
      await verifyPayment(
        String(data.transaction.reference),
        code || undefined,
      );
    if (code) await refreshSubscription(code);
    return true;
  }
  if (
    event === "refund.processed" ||
    [
      "charge.dispute.create",
      "charge.dispute.remind",
      "charge.dispute.resolve",
    ].includes(event)
  ) {
    await adjustment(event, data);
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  let key: string | undefined;
  try {
    const config = billingConfiguration();
    const raw = await boundedBody(request);
    if (
      !signatureMatches(
        raw,
        request.headers.get("x-paystack-signature"),
        config.secret,
      )
    )
      return billingResponse({ error: "invalid_webhook_signature" }, 401);
    if (config.mode !== "live")
      return billingResponse(
        { error: "test_webhook_cannot_change_live_billing" },
        403,
      );
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return billingResponse({ error: "invalid_webhook_json" }, 400);
    }
    if (
      typeof payload.event !== "string" ||
      !payload.data ||
      typeof payload.data !== "object" ||
      Array.isArray(payload.data)
    )
      return billingResponse({ error: "invalid_webhook_event" }, 400);
    key = createHash("sha256").update(raw).digest("hex");
    const service = billingService();
    const { data: status, error: recordError } = await service.rpc(
      "record_billing_event_v1",
      {
        p_event_key: key,
        p_event_type: payload.event.slice(0, 100),
        p_reference:
          typeof payload.data.reference === "string"
            ? payload.data.reference.slice(0, 100)
            : null,
        p_subscription_code:
          typeof payload.data.subscription_code === "string"
            ? payload.data.subscription_code.slice(0, 100)
            : null,
      },
    );
    if (recordError) throw new BillingError("webhook_record_unavailable", 503);
    if (status === "processed" || status === "ignored")
      return billingResponse({ received: true });
    const handled = await processEvent(payload.event, payload.data);
    const { error: finishError } = await service.rpc(
      "finish_billing_event_v1",
      {
        p_event_key: key,
        p_status: handled ? "processed" : "ignored",
        p_note: null,
      },
    );
    if (finishError) throw new BillingError("webhook_record_unavailable", 503);
    return billingResponse({ received: true });
  } catch (e) {
    if (key) {
      try {
        await billingService().rpc("finish_billing_event_v1", {
          p_event_key: key,
          p_status: "review",
          p_note: e instanceof BillingError ? e.code : "processing_failed",
        });
      } catch {}
    }
    // A non-200 preserves Paystack retry behavior; no event is acknowledged
    // as successful until its database changes have committed.
    return billingFailure(
      e instanceof BillingError ? new BillingError(e.code, 503) : e,
    );
  }
}
