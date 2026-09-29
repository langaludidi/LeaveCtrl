import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event-based leave fails closed before ordinary balance processing", async () => {
  const sql = await readFile(
    "supabase/migrations/20260929225910_event_based_leave_self_service_guard_v1.sql",
    "utf8"
  );

  assert.match(sql, /v_entitlement_method='event_based'/);
  assert.match(sql, /event_based_eligibility_required/);
  const guard = sql.indexOf("v_entitlement_method='event_based'");
  const provision = sql.indexOf("provision_employee_entitlements_for_date");
  assert.ok(guard > -1 && provision > guard);
});

test("preflight explains event-based eligibility rather than insufficient balance", async () => {
  const sql = await readFile(
    "supabase/migrations/20260929225910_event_based_leave_self_service_guard_v1.sql",
    "utf8"
  );

  assert.match(
    sql,
    /This leave type requires an event-based eligibility check before a leave request can be created\./
  );
});
