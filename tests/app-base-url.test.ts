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
      configuredUrl: "https://leave-ctrl-2eqn-example.vercel.app",
      requestOrigin: "https://leave-ctrl-2eqn-example.vercel.app",
      vercelEnv: "production",
      production: true,
    }),
    CANONICAL_PRODUCTION_APP_URL
  );
});

test("production email auth can start only on the canonical origin", () => {
  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: CANONICAL_PRODUCTION_APP_URL,
      vercelEnv: "production",
      production: true,
    }),
    true
  );

  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: "https://leave-ctrl.vercel.app",
      vercelEnv: "production",
      production: true,
    }),
    false
  );

  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: "https://leave-ctrl-2eqn-example.vercel.app",
      vercelEnv: "production",
      production: true,
    }),
    false
  );
});

test("non-Vercel production also requires the canonical origin", () => {
  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: CANONICAL_PRODUCTION_APP_URL,
      production: true,
    }),
    true
  );

  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: "https://other.example",
      production: true,
    }),
    false
  );

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
      requestOrigin: "https://leave-ctrl-git-test-example.vercel.app",
      vercelEnv: "preview",
      production: true,
      previewAuthEnabled: false,
    }),
    false
  );
});

test("deliberate preview auth stays on the exact preview origin", () => {
  const preview =
    "https://leave-ctrl-git-auth-test-example.vercel.app";

  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: preview,
      vercelEnv: "preview",
      production: true,
      previewAuthEnabled: true,
    }),
    true
  );

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

test("development email auth is local-only", () => {
  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: "http://localhost:3000",
      production: false,
    }),
    true
  );

  assert.equal(
    canInitiateEmailAuth({
      requestOrigin: "https://unexpected.example",
      production: false,
    }),
    false
  );

  assert.equal(
    resolveAppBaseUrl({
      configuredUrl: CANONICAL_PRODUCTION_APP_URL,
      requestOrigin: "http://localhost:3000",
      production: false,
    }),
    "http://localhost:3000"
  );
});

test("marketing origins cannot initiate or exchange production email auth", () => {
  assert.equal(CANONICAL_PRODUCTION_APP_URL, "https://app.leavectrl.co.za");
  for (const requestOrigin of ["https://leavectrl.co.za", "https://www.leavectrl.co.za"]) {
    assert.equal(canInitiateEmailAuth({ requestOrigin, vercelEnv: "production", production: true }), false);
    assert.equal(authCallbackOriginAllowed({ requestOrigin, vercelEnv: "production", production: true }), false);
  }
});
