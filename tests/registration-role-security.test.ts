import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260930060958_registration_membership_state_v1.sql";

test("public organisation creation has no caller-controlled privileged role parameter", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /function public\.bootstrap_organisation\(\s*p_name text,\s*p_first_name text,\s*p_last_name text,\s*p_email text,\s*p_start_date date/i
  );
  assert.doesNotMatch(sql, /bootstrap_organisation\([\s\S]*p_role/i);
  assert.match(sql, /\(v_org_id,v_user_id,'org_admin'\)/);
  assert.match(sql, /\(v_org_id,v_user_id,'employee'\)/);
  assert.match(sql, /role_source','controlled_organisation_creation'/);
});

test("invitation claimant cannot supply organisation or role", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /function public\.claim_employee_invitation\(\s*p_token text/i);
  assert.doesNotMatch(sql, /claim_employee_invitation\([\s\S]*p_role/i);
  assert.doesNotMatch(sql, /claim_employee_invitation\([\s\S]*p_organisation_id/i);
  assert.match(sql, /v_invitation\.organisation_id/);
  assert.match(sql, /v_invitation\.grant_manager_role/);
  assert.match(sql, /role_source','trusted_invitation'/);
});

test("organisation and invitation activation require verified identity", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /private\.is_verified_email_identity\(v_user_id\)/);
  assert.match(sql, /raise exception 'email_verification_required'/);
});

test("public signup UI never asks a user to choose an organisational role", async () => {
  const login = await readFile("app/login/page.tsx", "utf8");
  const onboarding = await readFile("app/onboarding/page.tsx", "utf8");

  assert.doesNotMatch(login, /name="role"/);
  assert.doesNotMatch(onboarding, /name="role"/);
  assert.match(login, /Create your LeaveCtrl organisation/);
  assert.match(onboarding, /no privileged role is selected in this form/);
});

test("existing generic public-table role mutation remains closed", async () => {
  const sql = await readFile(
    "supabase/migrations/20260928151747_enforce_rpc_only_public_table_mutations.sql",
    "utf8"
  );

  assert.match(
    sql,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*from authenticated, anon/i
  );
});

test("employee invitation remains one-time and sibling retry tokens are invalidated", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /accepted_at is null/);
  assert.match(sql, /expires_at>now\(\)/);
  assert.match(sql, /set expires_at=least\(expires_at,now\(\)\)/);
  assert.match(sql, /sibling_invitations_invalidated/);
});

test("organisation onboarding completion is an authorised audited transition", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /function public\.complete_organisation_onboarding\(\)/);
  assert.match(sql, /m\.role='org_admin'/);
  assert.match(sql, /organisation\.onboarding\.completed/);
  assert.match(sql, /core_readiness_verified/);
});
