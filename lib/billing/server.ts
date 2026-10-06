import "server-only";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { loadAccessStates } from "@/lib/access-state";
import {
  checkedCharge,
  trustedPaystackUrl,
  type VerifiedCharge,
} from "./verification";
import type { BillingSummary } from "./catalog";

export class BillingError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}

export function billingConfiguration() {
  const live = process.env.VERCEL_ENV === "production";
  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    (live ? process.env.Live_secret_key : process.env.PAYSTACK_TEST_SECRET_KEY);
  const databaseSecret =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const mode = live ? "live" : "test";
  if (!secret || !secret.startsWith(`sk_${mode}_`) || !databaseSecret)
    throw new BillingError("billing_configuration_required", 503);
  return { secret, databaseSecret, mode } as const;
}

export function billingService() {
  const { databaseSecret, mode } = billingConfiguration();
  if (mode !== "live") throw new BillingError("preview_billing_disabled", 503);
  return createSupabaseClient(getSupabasePublicConfig().url, databaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function billingIdentity(admin = true) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new BillingError("authentication_required", 401);
  if (!hasVerifiedEmailOwnership(user))
    throw new BillingError("email_verification_required", 403);
  const states = await loadAccessStates(supabase);
  if (states.length !== 1)
    throw new BillingError("organisation_setup_required", 403);
  const state = states[0];
  if (admin && !state.roles.includes("org_admin"))
    throw new BillingError("billing_admin_required", 403);
  return {
    supabase: supabase as SupabaseClient,
    user,
    state,
    orgId: state.organisation_id,
  };
}

export async function billingSummary(client: SupabaseClient, orgId: string) {
  const { data, error } = await client.rpc("get_billing_summary_v1", {
    p_org_id: orgId,
  });
  if (error || !data) throw new BillingError("billing_record_unavailable", 503);
  return data as BillingSummary;
}

export async function paystack<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!/^\/[a-z]/.test(path) || path.includes(".."))
    throw new BillingError("invalid_provider_path", 400);
  const { secret } = billingConfiguration();
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new BillingError("payment_provider_unavailable", 503);
  }
  const result = await response.json();
  if (!response.ok || result.status !== true || !result.data)
    throw new BillingError("payment_provider_unavailable", 503);
  return result.data as T;
}

async function rpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, args);
  const publicCodes = new Set([
    "unmapped_or_ambiguous_renewal",
    "subscription_requires_verified_payment",
    "checkout_initialising",
    "checkout_already_pending",
    "existing_subscription_requires_management",
    "plan_employee_limit_exceeded",
  ]);
  if (error)
    throw new BillingError(
      publicCodes.has(error.message)
        ? error.message
        : "billing_record_rejected",
    );
  return data;
}

export async function providerPlan(price: {
  id: string;
  name: string;
  interval: string;
  amount: number;
  currency: string;
}) {
  const interval = price.interval === "annual" ? "annually" : "monthly";
  const name = `LeaveCtrl ${price.name} ${price.interval} v1`;
  // The catalog is versioned. Existing provider prices are never overwritten.
  for (let page = 1; page <= 10; page++) {
    const plans = await paystack<
      Array<{
        name: string;
        amount: number;
        currency: string;
        interval: string;
        plan_code: string;
      }>
    >(`/plan?perPage=100&page=${page}`);
    const found = plans.find(
      (p) =>
        p.name === name &&
        p.amount === price.amount &&
        p.currency === price.currency &&
        p.interval === interval,
    );
    if (found) return found.plan_code;
    if (plans.length < 100) break;
    if (page === 10) throw new BillingError("provider_plan_review_required");
  }
  const created = await paystack<{
    plan_code: string;
    amount: number;
    currency: string;
    interval: string;
  }>("/plan", {
    name,
    amount: price.amount,
    currency: price.currency,
    interval,
  });
  if (
    created.amount !== price.amount ||
    created.currency !== price.currency ||
    created.interval !== interval
  )
    throw new BillingError("provider_plan_mismatch");
  return created.plan_code;
}

export async function initialiseCheckout(priceId: string) {
  if (billingConfiguration().mode !== "live")
    throw new BillingError("preview_billing_disabled", 503);
  // Check database credentials before taking any payment.
  const { supabase, orgId } = await billingIdentity();
  const service = billingService();
  const order = await rpc(supabase, "start_billing_checkout_v1", {
    p_org_id: orgId,
    p_price_id: priceId,
  });
  if (order.status === "ready" && order.checkout_url)
    return trustedPaystackUrl(order.checkout_url, "checkout");
  const { data: price, error } = await service
    .from("billing_prices")
    .select("id,name,interval,amount,currency")
    .eq("id", order.price_id)
    .single();
  if (error || !price) throw new BillingError("billing_price_unavailable", 503);
  const proposedPlan = order.plan_code ?? (await providerPlan(price));
  // Persist the expected plan before initialise: a fast webhook can otherwise
  // arrive before the checkout URL has been recorded.
  const claimed = await rpc(service, "claim_billing_checkout_v1", {
    p_reference: order.reference,
    p_plan_code: proposedPlan,
  });
  if (claimed.status === "ready" && claimed.checkout_url)
    return trustedPaystackUrl(claimed.checkout_url, "checkout");
  if (claimed.status === "paid") return "https://app.leavectrl.co.za/billing";
  const plan = claimed.plan_code;
  const created = await paystack<{
    authorization_url: string;
    reference: string;
  }>("/transaction/initialize", {
    reference: order.reference,
    email: order.email,
    amount: order.amount,
    currency: order.currency,
    plan,
    channels: ["card"],
    callback_url: "https://app.leavectrl.co.za/billing/return",
    metadata: {
      billing_checkout_reference: order.reference,
      organisation_id: orgId,
      price_id: order.price_id,
    },
  });
  if (created.reference !== order.reference)
    throw new BillingError("payment_reference_mismatch");
  const url = trustedPaystackUrl(created.authorization_url, "checkout");
  await rpc(service, "complete_billing_checkout_v1", {
    p_reference: order.reference,
    p_plan_code: plan,
    p_checkout_url: url,
  });
  return url;
}

export async function verifyPayment(
  reference: string,
  subscriptionCode?: string,
) {
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(reference))
    throw new BillingError("invalid_payment_reference", 400);
  const service = billingService();
  const raw = await paystack<Record<string, any>>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  const { data: order } = await service
    .from("billing_checkouts")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();
  let expected;
  if (order)
    expected = {
      reference,
      amount: order.amount,
      currency: order.currency,
      email: order.email,
      planCode: order.plan_code,
      mode: billingConfiguration().mode,
    };
  else {
    const planCode =
      typeof raw.plan === "string"
        ? raw.plan
        : raw.plan?.plan_code || raw.plan_object?.plan_code;
    let query = service
      .from("billing_subscriptions")
      .select("*,billing_prices(amount,currency)")
      .eq("customer_code", raw.customer?.customer_code ?? "")
      .eq("plan_code", planCode ?? "");
    if (subscriptionCode)
      query = query.eq("subscription_code", subscriptionCode);
    const { data: bindings } = await query;
    if (bindings?.length !== 1)
      throw new BillingError("unmapped_or_ambiguous_renewal");
    expected = {
      reference,
      amount: bindings[0].billing_prices.amount,
      currency: bindings[0].billing_prices.currency,
      planCode,
      mode: billingConfiguration().mode,
    };
  }
  let charge: VerifiedCharge;
  try {
    charge = checkedCharge(raw, expected);
  } catch (e) {
    throw new BillingError(
      e instanceof Error ? e.message : "payment_not_verified",
    );
  }
  const applied = await rpc(service, "record_billing_payment_v1", {
    p_reference: charge.reference,
    p_transaction_id: charge.id,
    p_amount: charge.amount,
    p_currency: charge.currency,
    p_paid_at: charge.paidAt,
    p_customer_code: charge.customerCode,
    p_email: charge.email,
    p_plan_code: charge.planCode,
    p_mode: charge.mode,
    p_subscription_code: subscriptionCode ?? null,
  });
  return { charge, applied };
}

export async function refreshSubscription(code: string) {
  if (!/^SUB_[A-Za-z0-9]+$/.test(code))
    throw new BillingError("invalid_subscription", 400);
  const data = await paystack<Record<string, any>>(
    `/subscription/${encodeURIComponent(code)}`,
  );
  if (data.subscription_code !== code)
    throw new BillingError("subscription_identity_mismatch");
  // Fetch current provider state rather than replaying stale webhook state.
  return rpc(billingService(), "record_billing_subscription_v1", {
    p_subscription_code: code,
    p_customer_code: data.customer?.customer_code,
    p_plan_code: data.plan?.plan_code,
    p_status: data.status,
    p_event_at: new Date().toISOString(),
  });
}

export async function manageSubscription() {
  const { orgId } = await billingIdentity();
  const { data: account } = await billingService()
    .from("billing_accounts")
    .select("subscription_code")
    .eq("organisation_id", orgId)
    .single();
  if (!account?.subscription_code)
    throw new BillingError("subscription_not_yet_linked");
  const result = await paystack<{ link: string }>(
    `/subscription/${encodeURIComponent(account.subscription_code)}/manage/link`,
  );
  return trustedPaystackUrl(result.link, "manage");
}
