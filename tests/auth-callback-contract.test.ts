import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth callback exchanges the existing PKCE code and never trusts arbitrary origins", async () => {
  const source = await readFile("app/auth/callback/route.ts", "utf8");

  assert.match(source, /exchangeCodeForSession\(code\)/);
  assert.match(source, /authCallbackOriginAllowed/);
  assert.match(source, /CANONICAL_PRODUCTION_APP_URL/);
  assert.match(source, /error_code/);
  assert.match(source, /error_description/);
  assert.match(source, /confirmationLinkErrorMessage/);
  assert.match(source, /hasVerifiedEmailOwnership/);
  assert.match(source, /Cache-Control", "private, no-store"/);
  assert.doesNotMatch(source, /new URL\(next, url\.origin\)/);
});

test("callback does not create a parallel confirmation implementation", async () => {
  const source = await readFile("app/auth/callback/route.ts", "utf8");

  assert.equal(
    (source.match(/exchangeCodeForSession/g) ?? []).length,
    1
  );
  assert.doesNotMatch(source, /verifyOtp|setSession|access_token|refresh_token/);
});
