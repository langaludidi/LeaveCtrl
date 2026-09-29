import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260929183209_security_definer_rpc_contract.sql";

const expectedRpcNames = [
  "add_employee_record",
  "adjust_manual_leave_allocation",
  "adjust_toil_balance",
  "apply_employee_condition_change",
  "assign_employee_department",
  "assign_employee_manager",
  "assign_employee_schedule",
  "bootstrap_organisation",
  "claim_employee_invitation",
  "configure_employer_leave_type",
  "configure_initial_leave_policy",
  "create_blocked_period",
  "create_coverage_rule",
  "create_department",
  "create_employee_invitation",
  "create_location",
  "create_rotating_shift_schedule",
  "create_work_schedule",
  "decide_leave_cancellation",
  "decide_leave_request",
  "decide_toil_cancellation",
  "decide_toil_request",
  "exit_employee",
  "get_workforce_calendar",
  "get_workforce_directory",
  "prepare_employee_access_invitation",
  "record_organisation_data_export",
  "record_overtime_event",
  "record_variable_earning",
  "request_leave_cancellation",
  "request_toil_cancellation",
  "set_employee_opening_balance",
  "set_employee_remuneration",
  "submit_leave_request_v2",
  "submit_toil_request",
  "update_overtime_settings",
  "withdraw_leave_request",
  "withdraw_toil_request",
] as const;

test("privileged RPC exposure is governed by an explicit allowlist", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /alter\s+default\s+privileges[\s\S]*revoke\s+execute\s+on\s+functions\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    "New public functions must not inherit browser EXECUTE privileges"
  );

  assert.match(
    sql,
    /where\s+n\.nspname\s*=\s*'public'[\s\S]*and\s+p\.prosecdef/i,
    "The contract must inspect the complete public SECURITY DEFINER surface"
  );

  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+%s\s+from\s+authenticated/i,
    "Non-allowlisted privileged functions must be revoked from signed-in users"
  );

  assert.match(
    sql,
    /position\('auth\.uid'[\s\S]*pg_get_functiondef/i,
    "Every allowlisted privileged RPC must prove an explicit auth.uid() guard"
  );

  assert.match(
    sql,
    /position\('search_path'[\s\S]*config_text/i,
    "Every allowlisted privileged RPC must pin search_path"
  );

  for (const name of expectedRpcNames) {
    assert.match(
      sql,
      new RegExp(`['"]${name}['"]`),
      `Missing intentional privileged RPC from the release contract: ${name}`
    );
  }

  const allowlistBlock =
    sql.match(/allowed_names\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/i)?.[1] ??
    "";
  const declaredNames = [...allowlistBlock.matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(
    declaredNames,
    [...expectedRpcNames].sort(),
    "The SQL allowlist and the release-test allowlist must remain identical"
  );
});


test("leave preflight extends the privileged RPC contract explicitly", async () => {
  const sql = await readFile(
    "supabase/migrations/20260929212555_leave_request_preflight_v1.sql",
    "utf8"
  );

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.preview_leave_request_v1/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s+to\s+'public'\s*,\s*'private'/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*,\s*anon/i);
  assert.match(sql, /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated/i);
});
