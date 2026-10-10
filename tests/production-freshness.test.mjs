import assert from "node:assert/strict";
import test from "node:test";
import { assessFreshness, checkProductionFreshness } from "../scripts/check-production-freshness.mjs";
const now = Date.parse("2026-10-10T00:00:00Z");
const run = { id: 1, event: "schedule", status: "completed", conclusion: "success", updated_at: new Date(now - 60_000).toISOString() };
const artifact = { name: "leavectrl-db-backup-1", expired: false, size_in_bytes: 100, digest: `sha256:${"a".repeat(64)}`, expires_at: new Date(now + 60_000).toISOString() };
const assess = (changes = {}) => assessFreshness({ monitor: run, backup: run, artifacts: [artifact], now, ...changes });
test("only recent successful execution with a retained matching backup passes", () => {
  assert.equal(assess().healthy, true);
  // Freshness failures must recover on the next timely execution, not latch forever.
  assert.equal(assess({ monitor: { ...run, conclusion: "failure" } }).scheduled_monitor_execution_recent, true);
  for (const monitor of [undefined, { ...run, event: "workflow_dispatch" }, { ...run, updated_at: new Date(now - 31 * 60_000).toISOString() }, { ...run, updated_at: new Date(now + 1).toISOString() }]) assert.equal(assess({ monitor }).healthy, false);
  assert.equal(assess({ backup: { ...run, updated_at: new Date(now - 31 * 60 * 60_000).toISOString() } }).healthy, false);
  for (const invalid of [{ expired: true }, { size_in_bytes: 0 }, { digest: null }, { name: "other" }, { expires_at: new Date(now).toISOString() }]) assert.equal(assess({ artifacts: [{ ...artifact, ...invalid }] }).healthy, false);
});
test("provider verification failure cannot return healthy", async () => {
  await assert.rejects(checkProductionFreshness(async () => new Response("", { status: 503 })), /verification unavailable/);
});
