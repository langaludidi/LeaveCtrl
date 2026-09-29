import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("health endpoint is safe, dynamic and non-cached", async () => {
  const route = await readFile("app/api/health/route.ts", "utf8");

  assert.match(route, /status: "ok"/);
  assert.match(route, /status: "unavailable"/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(route, /key\s*:/);
  assert.doesNotMatch(route, /url\s*:/);
});
