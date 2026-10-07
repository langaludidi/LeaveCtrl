import assert from "node:assert/strict";
import test from "node:test";
import { retrySubscriptionLinkAfterPaymentRace } from "../lib/billing/retry.ts";

class FixtureBillingError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

test("subscription linking retries only the verified-payment race and then succeeds", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await retrySubscriptionLinkAfterPaymentRace(
    async () => {
      calls += 1;
      if (calls < 3)
        throw new FixtureBillingError(
          "subscription_requires_verified_payment",
        );
      return "linked";
    },
    async (milliseconds) => {
      waits.push(milliseconds);
    },
    [10, 20, 30],
  );

  assert.equal(result, "linked");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("subscription linking does not retry unrelated billing failures", async () => {
  let calls = 0;
  await assert.rejects(
    retrySubscriptionLinkAfterPaymentRace(
      async () => {
        calls += 1;
        throw new FixtureBillingError("subscription_identity_mismatch");
      },
      async () => {},
      [10, 20],
    ),
    /subscription_identity_mismatch/,
  );
  assert.equal(calls, 1);
});

test("subscription linking remains fail-closed after the bounded retry window", async () => {
  let calls = 0;
  await assert.rejects(
    retrySubscriptionLinkAfterPaymentRace(
      async () => {
        calls += 1;
        throw new FixtureBillingError(
          "subscription_requires_verified_payment",
        );
      },
      async () => {},
      [10, 20],
    ),
    /subscription_requires_verified_payment/,
  );
  assert.equal(calls, 3);
});
