import assert from "node:assert/strict";
import test from "node:test";

import {
  authCallbackOriginAllowed,
  CANONICAL_PRODUCTION_APP_URL,
  canInitiateEmailAuth,
  resolveAppBaseUrl,
} from "../lib/app-base-url.ts";

test("Vercel production always uses the canonical customer domain", () => {
  assert.equal(
    resolveAppBaseUrl({
      configuredUrl:
        "https://leave-ctrl-2eqn-example.vercel.app",
      requestOrigin:
        "https://leave-ctrl-2eqn-example.vercel.app",
      vercelEnv: "production",
      production: true,
    }),
    CANONICAL_PRODUCTION_APP_URL
  );
});

test("non-Vercel production also ignores stale configured or request origins", () => {
  assert.equal(
    resolveAppBaseUrl({
      configuredUrl: "https://other.example",
      requestOrigin: "https://other.example",
      production: true,
    }),
    CANONICAL_PRODUCTION_APP_URL
  );
});

test("preview auth email initiation is disabled by default", () => {
  assert.equal(
    canInitiateEmailAuth({
      vercelEnv: "preview",
      previewAuthEnabled: false,
    }),
    false
  );
});

test("deliberate preview auth stays on the exact preview origin", () => {
  const preview =
    "https://leave-ctrl-git-auth-test-example.vercel.app";

  assert.equal(
    resolveAppBaseUrl({
      requestOrigin: preview,
      vercelEnv: "preview",
      production: true,
      previewAuthEnabled: true,
    }),
    preview
  );

  assert.equal(
    authCallbackOriginAllowed({
      requestOrigin: preview,
      vercelEnv: "preview",
      production: true,
      previewAuthEnabled: true,
    }),
    true
  );
});

test("ordinary preview callback cannot exchange production auth code", () => {
  assert.equal(
    authCallbackOriginAllowed({
      requestOrigin:
        "https://leave-ctrl-2eqn-example.vercel.app",
      vercelEnv: "preview",
      production: true,
      previewAuthEnabled: false,
    }),
    false
  );
});

test("production callback exchanges only on the canonical origin", () => {
  assert.equal(
    authCallbackOriginAllowed({
      requestOrigin: CANONICAL_PRODUCTION_APP_URL,
      vercelEnv: "production",
      production: true,
    }),
    true
  );

  assert.equal(
    authCallbackOriginAllowed({
      requestOrigin: "https://leave-ctrl.vercel.app",
      vercelEnv: "production",
      production: true,
    }),
    false
  );
});

test("development can use localhost without inheriting production URL", () => {
  assert.equal(
    resolveAppBaseUrl({
      configuredUrl: CANONICAL_PRODUCTION_APP_URL,
      requestOrigin: "http://localhost:3000",
      production: false,
    }),
    "http://localhost:3000"
  );

  assert.equal(
    authCallbackOriginAllowed({
      configuredUrl: CANONICAL_PRODUCTION_APP_URL,
      requestOrigin: "http://localhost:3000",
      production: false,
    }),
    true
  );
});
