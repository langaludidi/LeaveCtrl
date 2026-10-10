import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedEmailOwnership } from "../lib/auth-verification.ts";

test("absent and unconfirmed identities cannot enter the application", () => {
  for (const user of [null, undefined, {}, { id: "user", confirmation_sent_at: "sent" }, { invited_at: "invited" }]) {
    assert.equal(hasVerifiedEmailOwnership(user), false);
  }
});

test("native confirmation and invitation require completed email confirmation", () => {
  assert.equal(hasVerifiedEmailOwnership({ id: "user", email_confirmed_at: "confirmed", confirmation_sent_at: "sent" }), true);
  assert.equal(hasVerifiedEmailOwnership({ id: "user", email_confirmed_at: "confirmed", invited_at: "invited" }), true);
  assert.equal(hasVerifiedEmailOwnership({ email_confirmed_at: "", invited_at: "invited" }), false);
});

test("accidental auto-confirm without a native challenge fails closed", () => {
  assert.equal(hasVerifiedEmailOwnership({ id: "user", email_confirmed_at: "confirmed" }), false);
  assert.equal(hasVerifiedEmailOwnership({ email_confirmed_at: "confirmed", confirmation_sent_at: "", invited_at: "" }), false);
});
