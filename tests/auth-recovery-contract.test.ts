import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login exposes password recovery and confirmation resend", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");
  const login = await readFile("app/login/page.tsx", "utf8");

  assert.match(actions, /resetPasswordForEmail/);
  assert.match(actions, /auth\.resend\(\{[\s\S]*type:\s*"signup"/);
  assert.match(login, /requestPasswordReset/);
  assert.match(login, /resendConfirmation/);
  assert.match(login, /Send reset link/);
  assert.match(login, /Resend confirmation/);
});

test("password reset landing page updates the authenticated user's password", async () => {
  const resetPage = await readFile("app/reset-password/page.tsx", "utf8");

  assert.match(resetPage, /auth\.updateUser\(\{ password \}\)/);
  assert.match(resetPage, /auth\.signOut\(\{ scope: "global" \}\)/);
  assert.match(resetPage, /Password%20updated/);
});

test("login rendering uses the same hardened internal-path validator as auth actions", async () => {
  const login = await readFile("app/login/page.tsx", "utf8");

  assert.match(login, /safeInternalPath/);
  assert.doesNotMatch(
    login,
    /params\.next\?\.startsWith\("\/"\)/
  );
});

test("signup and reset flows share the strong password policy", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");
  const resetPage = await readFile("app/reset-password/page.tsx", "utf8");

  assert.match(actions, /validatePassword\(password\)/);
  assert.match(resetPage, /validatePassword\(password\)/);
  assert.match(resetPage, /minLength=\{12\}/);
});

test("strong password minimum applies to account creation but does not block legacy sign-in", async () => {
  const login = await readFile("app/login/page.tsx", "utf8");

  assert.match(login, /minLength=\{signingUp \? 12 : undefined\}/);
});

test("account recovery fields and messages are accessible", async () => {
  const login = await readFile("app/login/page.tsx", "utf8");

  assert.match(login, /aria-label="Email address for password reset"/);
  assert.match(login, /aria-label="Email address for confirmation resend"/);
  assert.match(login, /className="auth-alert error" role="alert"/);
  assert.match(login, /className="auth-alert success" role="status" aria-live="polite"/);
});

test("passwords are treated as opaque secrets rather than trimmed text", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");

  assert.match(actions, /function readSecret\(formData: FormData, key: string\)/);
  assert.match(actions, /return String\(formData\.get\(key\) \?\? ""\);/);
  assert.equal((actions.match(/readSecret\(formData, "password"\)/g) ?? []).length, 2);
});
