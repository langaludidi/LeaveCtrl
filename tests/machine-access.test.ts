import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { bypassesSessionAuthentication, cronAuthorizationMatches } from "../lib/machine-access.ts";

test("only exact public and machine entry paths bypass browser-session authentication", () => {
  for (const path of ["/api/cron/database-backup", "/api/billing/webhook", "/subscribe"]) assert.equal(bypassesSessionAuthentication(path), true);
  for (const path of ["/api/cron", "/api/cron/database-backup/other", "/api/cron/database-backup/", "/api/billing/checkout", "/api/billing/webhook/other", "/reports"]) assert.equal(bypassesSessionAuthentication(path), false);
});

test("cron authorization requires a configured secret and its exact bearer token", () => {
  assert.equal(cronAuthorizationMatches("Bearer secret", "secret"), true);
  assert.equal(cronAuthorizationMatches("Bearer secret", " secret "), true);
  for (const header of [null, "", "Bearer wrong", "Basic secret", "Bearer secret-extra"]) assert.equal(cronAuthorizationMatches(header, "secret"), false);
  for (const secret of [undefined, "", "   "]) assert.equal(cronAuthorizationMatches("Bearer undefined", secret), false);
});

test("machine routing happens before session lookup and backup still enforces its own authorization", async () => {
  const middleware = await readFile("lib/supabase/middleware.ts", "utf8");
  assert.ok(middleware.indexOf("bypassesSessionAuthentication(request.nextUrl.pathname)") < middleware.indexOf("await supabase.auth.getUser()"));
  const route = await readFile("app/api/cron/database-backup/route.ts", "utf8");
  assert.match(route, /cronAuthorizationMatches\(request.headers.get\("authorization"\), process.env.CRON_SECRET\)/);
  assert.match(route, /if \(!requireCron\(request\)\)/);
});
