import assert from "node:assert/strict";
import test from "node:test";

import { resolveAppBaseUrl } from "../lib/app-base-url.ts";

test("configured application URL wins and is normalised", () => {
  assert.equal(
    resolveAppBaseUrl({
      configuredUrl: "https://leave.example.com/path",
      vercelProductionUrl: "other.vercel.app",
      requestOrigin: "https://attacker.example",
      production: true,
    }),
    "https://leave.example.com"
  );
});

test("production ignores obsolete Vercel hostnames and uses the canonical domain", () => {
  assert.equal(
    resolveAppBaseUrl({
      vercelProductionUrl: "leave-ctrl-2eqn.vercel.app",
      production: true,
    }),
    "https://www.leavectrl.co.za"
  );
});

test("production never trusts a request-controlled origin", () => {
  assert.equal(
    resolveAppBaseUrl({
      requestOrigin: "https://attacker.example",
      production: true,
    }),
    "https://www.leavectrl.co.za"
  );
});

test("development can use a valid request origin", () => {
  assert.equal(
    resolveAppBaseUrl({
      requestOrigin: "http://localhost:3000",
      production: false,
    }),
    "http://localhost:3000"
  );
});
