import assert from "node:assert/strict";
import test from "node:test";

import {
  signInErrorMessage,
  signUpErrorMessage,
} from "../lib/auth-messages.ts";

test("sign-in errors do not expose provider details", () => {
  assert.equal(
    signInErrorMessage("Invalid login credentials: internal provider trace"),
    "Email or password is incorrect."
  );
  assert.equal(
    signInErrorMessage("Email not confirmed"),
    "Confirm your email address before signing in."
  );
  assert.equal(
    signInErrorMessage("rate limit exceeded"),
    "Too many sign-in attempts. Please try again shortly."
  );
});

test("sign-up errors keep password guidance useful without leaking provider details", () => {
  assert.equal(
    signUpErrorMessage("Password is weak and appeared in pwned password list"),
    "Choose a stronger password that you have not used elsewhere."
  );
  assert.equal(
    signUpErrorMessage("database error saving new user: secret detail"),
    "We could not create the account. Please check the details and try again."
  );
});
