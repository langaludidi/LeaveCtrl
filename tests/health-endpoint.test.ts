import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("health endpoint is safe, dynamic and non-cached", async () => {
  const route = await readFile("app/api/health/route.ts", "utf8");

  assert.match(route, /status: "ok"/);
  assert.match(route, /status: "unavailable"/);
  assert.match(route, /\/auth\/v1\/health/);
  assert.match(route, /AbortSignal\.timeout\(5000\)/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(route, /key\s*:/);
  assert.doesNotMatch(route, /supabase_url\s*:/i);
});

test("auth middleware allows only the dedicated health route as a public API path", async () => {
  const middleware = await readFile("lib/supabase/middleware.ts", "utf8");

  assert.match(middleware, /pathname === "\/api\/health"/);
  assert.doesNotMatch(middleware, /pathname\.startsWith\("\/api\/"\)/);
});
