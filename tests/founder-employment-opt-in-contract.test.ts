import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("organisation bootstrap does not create employee seats without explicit employment date", async () => {
  const sql = await readFile("supabase/migrations/20261009091500_optional_founder_employment.sql", "utf8");
  assert.match(sql, /if p_start_date is not null then[\s\S]*insert into public\.employees/);
  assert.match(sql, /if p_start_date is not null then[\s\S]*insert into public\.employee_schedule_assignments/);
  assert.match(sql, /if v_employee_id is not null then[\s\S]*provision_employee_entitlements_for_date/);
  assert.match(sql, /values \(v_org_id,v_user_id,'org_admin'\)/);
  assert.match(sql, /'employee_opt_in',v_employee_id is not null/);
  assert.match(sql, /private\.is_verified_email_identity\(v_user_id\)/);
  assert.match(sql, /account_already_linked_to_organisation/);
});

test("founder must explicitly opt into employee onboarding", async () => {
  const ui = await readFile("app/onboarding/page.tsx", "utf8");
  assert.match(ui, /useState\(false\)/);
  assert.match(ui, /I am also an employee of this organisation/);
  assert.match(ui, /p_start_date: alsoEmployee \?/);
  assert.match(ui, /name="startDate" type="date" required/);
  assert.doesNotMatch(ui, /Employment start date \(temporary setup requirement\)/);
});

test("zero-employee organisation can complete setup but scheduled employees remain mandatory", async () => {
  const sql = await readFile("supabase/migrations/20261009091500_optional_founder_employment.sql", "utf8");
  assert.match(sql, /if exists\([\s\S]*not exists\([\s\S]*employee_schedule_assignments/);
  const setup = await readFile("app/setup/page.tsx", "utf8");
  assert.match(setup, /assignedScheduleCount === activePeopleCount/);
  assert.match(setup, /No employees yet/);
});
