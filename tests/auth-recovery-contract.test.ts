import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login exposes password recovery and unambiguous confirmation email action", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");
  const login = await readFile("app/login/page.tsx", "utf8");

  assert.match(actions, /resetPasswordForEmail/);
  assert.match(
    actions,
    /auth\.resend\(\{[\s\S]*type:\s*"signup"/
  );
  assert.match(login, /requestPasswordReset/);
  assert.match(login, /resendConfirmation/);
  assert.match(login, /Send reset link/);
  assert.match(login, /Send confirmation email again/);
  assert.doesNotMatch(login, />Resend confirmation</);
});

test("production email redirects use the single server-side LeaveCtrl URL source", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");

  assert.match(actions, /process\.env\.LEAVECTRL_APP_URL/);
  assert.doesNotMatch(actions, /NEXT_PUBLIC_APP_URL/);
  assert.doesNotMatch(actions, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.match(actions, /LEAVECTRL_ENABLE_PREVIEW_AUTH_EMAIL/);
  assert.match(actions, /canInitiateEmailAuth/);
  assert.match(actions, /x-forwarded-host/);
  assert.match(actions, /CANONICAL_PRODUCTION_APP_URL/);
});

test("password reset landing page updates the authenticated user's password", async () => {
  const resetPage = await readFile("app/reset-password/page.tsx", "utf8");

  assert.match(resetPage, /updateRecoveryPassword\(form\)/);
  const actions = await readFile("app/auth/actions.ts", "utf8");
  assert.match(actions, /auth\.updateUser\(\{ password \}\)/);
  assert.match(actions, /auth\.signOut\(\{ scope: "global" \}\)/);
  assert.match(resetPage, /Password%20updated/);
});

test("login rendering uses the same hardened internal-path validator as auth actions", async () => {
  const login = await readFile("app/login/page.tsx", "utf8");

  assert.match(login, /safeInternalPath/);
  assert.doesNotMatch(login, /params\.next\?\.startsWith\("\/"\)/);
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

  assert.match(
    login,
    /aria-label="Email address for password reset"/
  );
  assert.match(
    login,
    /aria-label="Email address for confirmation email"/
  );
  assert.match(login, /className="auth-alert error" role="alert"/);
  assert.match(
    login,
    /className="auth-alert success" role="status" aria-live="polite"/
  );
});

test("passwords are treated as opaque secrets rather than trimmed text", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");

  assert.match(
    actions,
    /function readSecret\(formData: FormData, key: string\)/
  );
  assert.match(
    actions,
    /return String\(formData\.get\(key\) \?\? ""\);/
  );
  assert.equal(
    (actions.match(/readSecret\(formData, "password"\)/g) ?? []).length,
    3
  );
});


test("server signup and recovery reject unchecked passwords before auth mutation", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");
  for (const [start, end, mutation] of [
    ["export async function signUp", "export async function requestPasswordReset", "supabase.auth.signUp"],
    ["export async function updateRecoveryPassword", null, "supabase.auth.updateUser"],
  ]) {
    const from = actions.indexOf(start!);
    const body = actions.slice(from, end ? actions.indexOf(end, from) : undefined);
    assert.ok(body.indexOf("await checkBreachedPassword(password)") < body.indexOf(mutation!));
    assert.match(body, /if \(!breachCheck.valid\)/);
  }
  const reset = await readFile("app/reset-password/page.tsx", "utf8");
  assert.doesNotMatch(reset, /auth\.updateUser|createClient/);
});
