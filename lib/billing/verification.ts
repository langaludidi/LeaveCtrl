import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentExpectation = {
  reference: string;
  amount: number;
  currency: string;
  email?: string;
  planCode?: string;
  mode: "live" | "test";
};
export type VerifiedCharge = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  email: string;
  customerCode: string;
  planCode: string;
  paidAt: string;
  mode: "live" | "test";
  metadata: Record<string, unknown>;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function providerId(value: unknown) {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "number" && !Number.isSafeInteger(value)) ||
    !/^\d+$/.test(String(value))
  )
    throw new Error("invalid_provider_id");
  return String(value);
}

export function signatureMatches(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const actual = Buffer.from(signature, "hex");
  const expected = createHmac("sha512", secret).update(raw).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function checkedCharge(
  value: unknown,
  expected: PaymentExpectation,
): VerifiedCharge {
  const v = object(value),
    customer = object(v.customer),
    plan = object(v.plan_object);
  const planCode =
    typeof v.plan === "string"
      ? v.plan
      : String(object(v.plan).plan_code ?? plan.plan_code ?? "");
  const email = String(customer.email ?? "")
    .trim()
    .toLowerCase();
  const customerCode = String(customer.customer_code ?? "");
  const paidAt = String(v.paid_at ?? v.paidAt ?? "");
  let id: string;
  // IDs outside JS's integer range must never be rounded into an existing payment.
  try {
    id = providerId(v.id);
  } catch {
    throw new Error("invalid_transaction_id");
  }
  if (
    v.status !== "success" ||
    v.reference !== expected.reference ||
    v.domain !== expected.mode
  )
    throw new Error("payment_not_verified");
  if (
    !Number.isSafeInteger(v.amount) ||
    v.amount !== expected.amount ||
    v.currency !== expected.currency
  )
    throw new Error("payment_amount_mismatch");
  if (
    !email ||
    (expected.email && email !== expected.email.toLowerCase()) ||
    !/^CUS_[A-Za-z0-9]+$/.test(customerCode)
  )
    throw new Error("payment_customer_mismatch");
  if (
    !/^PLN_[A-Za-z0-9]+$/.test(planCode) ||
    (expected.planCode && planCode !== expected.planCode)
  )
    throw new Error("payment_plan_mismatch");
  if (
    !Number.isFinite(Date.parse(paidAt)) ||
    Date.parse(paidAt) > Date.now() + 300_000
  )
    throw new Error("invalid_payment_date");
  return {
    id,
    reference: expected.reference,
    amount: expected.amount,
    currency: expected.currency,
    email,
    customerCode,
    planCode,
    paidAt,
    mode: expected.mode,
    metadata: object(v.metadata),
  };
}

export function trustedPaystackUrl(
  value: unknown,
  kind: "checkout" | "manage",
) {
  if (typeof value !== "string") throw new Error("invalid_payment_url");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("invalid_payment_url");
  if (
    kind === "checkout"
      ? url.hostname !== "checkout.paystack.com"
      : url.hostname !== "paystack.com" ||
        !url.pathname.startsWith("/manage/subscriptions/")
  )
    throw new Error("invalid_payment_url");
  return url.href;
}
