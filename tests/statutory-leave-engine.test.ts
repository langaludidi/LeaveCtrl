import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260929172833_za_statutory_leave_engines_v1.sql";

test("South African statutory leave engines are preserved in migration history", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /statutory_annual_schedule_floor/);
  assert.match(sql, /statutory_sick/);
  assert.match(sql, /statutory_family_responsibility/);
  assert.match(sql, /manual_allocation/);
  assert.match(sql, /no_balance/);
  assert.match(sql, /PARENTAL_INTERIM/);
  assert.match(sql, /FAMILY_RESPONSIBILITY/);
  assert.match(sql, /UNPAID/);
  assert.match(sql, /ensure_za_leave_baseline/);
  assert.match(sql, /statutory_leave_baseline_seeded/);
});

test("built-in leave codes cannot be shadowed by employer-defined leave", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /ANNUAL','SICK','FAMILY_RESPONSIBILITY','PARENTAL_INTERIM','UNPAID','TOIL/
  );
  assert.match(sql, /reserved_leave_type_code/);
});

test("unpaid leave uses approval workflow without synthetic balance entries", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /v_entitlement_method<>'no_balance'/);
  assert.match(sql, /entitlement_method','no_balance'|entitlement_method='no_balance'|no_balance/);
});

test("Administration exposes employer leave and parental allocation controls", async () => {
  const controls = await readFile("components/LeavePolicyControls.tsx", "utf8");
  const setup = await readFile("app/setup/page.tsx", "utf8");

  assert.match(controls, /Employer-defined leave/);
  assert.match(controls, /Parental leave allocation/);
  assert.match(controls, /adjust_manual_leave_allocation/);
  assert.match(controls, /configure_employer_leave_type/);
  assert.match(setup, /<LeavePolicyControls/);
});

test("leave booking explains statutory, manual-allocation and no-balance modes", async () => {
  const form = await readFile("components/BookLeaveForm.tsx", "utf8");

  assert.match(form, /case "SICK"/);
  assert.match(form, /case "FAMILY_RESPONSIBILITY"/);
  assert.match(form, /case "PARENTAL_INTERIM"/);
  assert.match(form, /case "UNPAID"/);
  assert.match(form, /No balance required/);
});
