import assert from "node:assert/strict";
import test from "node:test";

import { validatePassword } from "../lib/password-policy.ts";

test("password policy requires length and character variety", () => {
  assert.equal(validatePassword("Short1!").valid, false);
  assert.equal(validatePassword("alllowercase1!").valid, false);
  assert.equal(validatePassword("ALLUPPERCASE1!").valid, false);
  assert.equal(validatePassword("NoNumberHere!").valid, false);
  assert.equal(validatePassword("NoSymbolHere1").valid, false);
  assert.equal(validatePassword("StrongPass1!").valid, true);
});

test("password policy returns usable guidance", () => {
  assert.match(validatePassword("short").message, /12 characters/i);
  assert.match(validatePassword("alllowercase1!").message, /uppercase/i);
});
