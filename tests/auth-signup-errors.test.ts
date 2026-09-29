import assert from "node:assert/strict";
import test from "node:test";
import { signUpErrorMessage } from "../lib/auth-messages.ts";

test("signup reports confirmation-email delivery failures clearly", () => {
  assert.equal(
    signUpErrorMessage("dial tcp: lookup smtp-reply.brevo.com: no such host"),
    "We could not send the confirmation email, so the account was not created. Please try again shortly or contact your LeaveCtrl administrator."
  );
});

test("signup keeps password failures separate from email delivery failures", () => {
  assert.equal(
    signUpErrorMessage("Password is compromised"),
    "Choose a stronger password that you have not used elsewhere."
  );
});
