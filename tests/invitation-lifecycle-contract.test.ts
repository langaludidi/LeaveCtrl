import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260929214827_invalidate_sibling_employee_invitations_v1.sql";

test("successful invitation claim invalidates sibling retry tokens", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /claim_employee_invitation/);
  assert.match(sql, /id<>v_invitation\.id/);
  assert.match(sql, /employee_id=v_employee_id/);
  assert.match(sql, /accepted_at is null/);
  assert.match(sql, /expires_at>now\(\)/);
  assert.match(sql, /set expires_at=least\(expires_at,now\(\)\)/);
  assert.match(sql, /sibling_invitations_invalidated/);
});

test("legacy active invites for linked employees are expired", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /Clean up retry tokens created before sibling invalidation was enforced/);
  assert.match(sql, /e\.id=i\.employee_id/);
  assert.match(sql, /e\.user_id is not null/);
});
