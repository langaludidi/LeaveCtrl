import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile account recovery is compact and intentionally styled", async () => {
  const login = await readFile("app/login/page.tsx", "utf8");
  const css = await readFile("app/globals.css", "utf8");

  assert.match(login, /Need help signing in\?/);
  assert.match(login, /Reset password/);
  assert.match(login, /Send confirmation email again/);
  assert.doesNotMatch(login, />Resend confirmation</);
  assert.match(css, /\.auth-recovery\{/);
  assert.match(
    css,
    /\.auth-recovery-form\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/i
  );
  assert.match(
    css,
    /@media\(max-width:520px\)[\s\S]*?\.auth-recovery-form\{grid-template-columns:1fr/i
  );
});

test("server auth verification prefers getClaims over a per-request Auth user lookup", async () => {
  const middleware = await readFile("lib/supabase/middleware.ts", "utf8");
  const context = await readFile("lib/current-context.ts", "utf8");

  assert.match(middleware, /auth\.getClaims\(\)/);
  assert.doesNotMatch(middleware, /auth\.getUser\(\)/);
  assert.match(context, /auth\.getClaims\(\)/);
  assert.doesNotMatch(context, /auth\.getUser\(\)/);
});

test("client shell avoids repeated Auth user lookups on navigation", async () => {
  const shell = await readFile("components/AppShell.tsx", "utf8");

  assert.match(shell, /auth\.getClaims\(\)/);
  assert.doesNotMatch(shell, /auth\.getUser\(\)/);
  assert.match(
    shell,
    /window\.addEventListener\("leavectrl-notifications-changed", loadUnread\)[\s\S]*?\}, \[\]\);/
  );
});
