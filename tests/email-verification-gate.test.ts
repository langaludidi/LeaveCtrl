import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("self-service signup never treats a returned signup session as verified access", async () => {
  const actions = await readFile("app/auth/actions.ts", "utf8");

  assert.match(actions, /clearExistingBrowserSession/);
  assert.match(actions, /if \(data\.session \|\| hasVerifiedEmailOwnership\(data\.user\)\)/);
  assert.match(actions, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(actions, /\/confirm-email/);
  assert.doesNotMatch(actions, /if \(data\.session\) redirect\(next\)/);
});

test("protected routes verify the authoritative Auth user before access", async () => {
  const middleware = await readFile("lib/supabase/middleware.ts", "utf8");
  const context = await readFile("lib/current-context.ts", "utf8");

  assert.match(middleware, /auth\.getUser\(\)/);
  assert.match(middleware, /hasVerifiedEmailOwnership\(user\)/);
  assert.match(middleware, /pathname === "\/confirm-email"/);
  assert.match(context, /auth\.getUser\(\)/);
  assert.match(context, /hasVerifiedEmailOwnership\(user\)/);
  assert.match(context, /redirect\("\/confirm-email"\)/);
});

test("confirmation state provides the required recovery action", async () => {
  const page = await readFile("app/confirm-email/page.tsx", "utf8");

  assert.match(page, /Check your email/);
  assert.match(page, /Send confirmation email again/);
  assert.match(page, /Use a different email/);
  assert.match(page, /Back to sign in/);
  assert.doesNotMatch(page, />Resend confirmation</);
});

test("callback admits only a user carrying confirmation evidence", async () => {
  const callback = await readFile("app/auth/callback/route.ts", "utf8");

  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /hasVerifiedEmailOwnership\(data\.user\)/);
  assert.match(callback, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(callback, /\/confirm-email/);
});

test("database membership and employee activation require verified email evidence", async () => {
  const sql = await readFile(
    "supabase/migrations/20260930051500_email_verification_authorization_gate_v1.sql",
    "utf8"
  );

  assert.match(sql, /private\.is_verified_email_identity/);
  assert.match(sql, /u\.email_confirmed_at is not null/);
  assert.match(sql, /u\.confirmation_sent_at is not null[\s\S]*u\.invited_at is not null/);
  assert.match(sql, /raise exception 'email_verification_required'/);
  assert.match(sql, /enforce_verified_employee_identity_link/);
});
