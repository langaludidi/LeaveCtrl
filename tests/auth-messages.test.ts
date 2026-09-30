import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmationLinkErrorMessage,
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

test("expired and reused confirmation credentials receive a recovery path", () => {
  assert.equal(
    confirmationLinkErrorMessage("One-time token not found"),
    "Your confirmation link is invalid or has expired. Send yourself a new confirmation email to continue."
  );

  assert.equal(
    confirmationLinkErrorMessage("confirmation already used"),
    "This confirmation link can no longer be used. Sign in if your account is already confirmed, or send yourself a new confirmation email."
  );
});
