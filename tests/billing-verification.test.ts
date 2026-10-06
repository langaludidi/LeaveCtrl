import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  checkedCharge,
  signatureMatches,
  trustedPaystackUrl,
} from "../lib/billing/verification.ts";
import { selectedPrice, BILLING_PLANS } from "../lib/billing/catalog.ts";
const expectation = {
  reference: "lctrl_example",
  amount: 24900,
  currency: "ZAR",
  email: "owner@example.test",
  planCode: "PLN_starter",
  mode: "live" as const,
};
const charge = () => ({
  id: 123,
  status: "success",
  domain: "live",
  reference: "lctrl_example",
  amount: 24900,
  currency: "ZAR",
  customer: { email: "owner@example.test", customer_code: "CUS_owner" },
  plan_object: { plan_code: "PLN_starter" },
  paid_at: new Date().toISOString(),
});

test("only an exact successful provider charge passes payment verification", () => {
  assert.equal(checkedCharge(charge(), expectation).id, "123");
  for (const change of [
    { status: "failed" },
    { domain: "test" },
    { reference: "someone_else" },
    { amount: 1 },
    { currency: "NGN" },
    { customer: { email: "other@example.test", customer_code: "CUS_owner" } },
    { plan_object: { plan_code: "PLN_other" } },
    { id: 9007199254740992 },
    { paid_at: "invalid" },
  ])
    assert.throws(() => checkedCharge({ ...charge(), ...change }, expectation));
});
test("raw-body signatures reject mutations, a wrong key and malformed headers", () => {
  const raw = Buffer.from(
    '{"event":"charge.success","data":{"reference":"r"}}',
  );
  const key = "sk_live_fixture";
  const signature = createHmac("sha512", key).update(raw).digest("hex");
  assert.equal(signatureMatches(raw, signature, key), true);
  assert.equal(
    signatureMatches(Buffer.from(raw.toString() + " "), signature, key),
    false,
  );
  assert.equal(signatureMatches(raw, signature, "sk_live_other"), false);
  assert.equal(signatureMatches(raw, "00", key), false);
  assert.equal(signatureMatches(raw, null, key), false);
});
test("checkout and management redirects are limited to exact Paystack HTTPS hosts", () => {
  assert.equal(
    trustedPaystackUrl("https://checkout.paystack.com/reference", "checkout"),
    "https://checkout.paystack.com/reference",
  );
  assert.match(
    trustedPaystackUrl(
      "https://paystack.com/manage/subscriptions/SUB_fixture?token=example",
      "manage",
    ),
    /^https:/,
  );
  for (const value of [
    "http://checkout.paystack.com/x",
    "https://checkout.paystack.com.evil.test/x",
    "https://user@checkout.paystack.com/x",
    "javascript:alert(1)",
    "https://evil.test/x",
  ])
    assert.throws(() => trustedPaystackUrl(value, "checkout"));
  assert.throws(() =>
    trustedPaystackUrl("https://paystack.com/unrelated", "manage"),
  );
});
test("published plans select fixed ZAR subunit amounts and capacity", () => {
  assert.deepEqual(
    BILLING_PLANS.map((p) => p.maxEmployees),
    [15, 50, 150, 300],
  );
  for (const plan of BILLING_PLANS) {
    assert.equal(selectedPrice(plan.code, "monthly")?.amount, plan.monthly);
    assert.equal(selectedPrice(plan.code, "annual")?.amount, plan.monthly * 10);
  }
  assert.equal(selectedPrice("enterprise", "monthly"), null);
  assert.equal(selectedPrice("starter", "arbitrary"), null);
});
