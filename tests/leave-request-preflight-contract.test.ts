import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("leave preview reuses the authoritative submission engine and rolls back", async () => {
  const sql = await readFile(
    "supabase/migrations/20260929212555_leave_request_preflight_v1.sql",
    "utf8"
  );

  assert.match(sql, /submit_leave_request_v2/);
  assert.match(sql, /__leave_preview_complete__/);
  assert.match(sql, /coverage_rule_block/);
  assert.match(sql, /insufficient_leave_balance/);
  assert.match(sql, /warning_dates/);
});

test("book leave requires governed evaluation before final submission", async () => {
  const source = await readFile("components/BookLeaveForm.tsx", "utf8");

  assert.match(source, /preview_leave_request_v1/);
  assert.match(source, /System evaluation/);
  assert.match(source, /label="Entitlement"/);
  assert.match(source, /label="Policy"/);
  assert.match(source, /label="Coverage"/);
  assert.match(source, /Check request/);
  assert.match(source, /evaluation\?\.ok[\s\S]*Submit request/);
  assert.match(source, /Coverage warning/);
  assert.match(source, /eventBased[\s\S]*Eligibility check required/);
});
