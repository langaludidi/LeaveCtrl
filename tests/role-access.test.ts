import assert from "node:assert/strict";
import test from "node:test";
import { assignedRoleDetails, roleCapabilities, roleLabels, roleLanding } from "../lib/role-access.ts";

test("every assigned role remains discoverable and contributes navigation", () => {
  const roles = ["employee", "manager", "auditor"];
  assert.equal(roleLabels(roles), "Employee · Manager · Auditor");
  assert.deepEqual(assignedRoleDetails(roles).map((item) => item.role), roles);
  assert.equal(roleCapabilities(roles).team, true);
  assert.equal(roleCapabilities(roles).audit, true);
  assert.equal(roleCapabilities(roles).administration, false);
  assert.equal(roleCapabilities(["employee", "reporter", "auditor"]).audit, true);
});
test("role combinations preserve every capability granted by individual roles", () => {
  const all = ["employee", "manager", "hr_admin", "org_admin", "reporter", "auditor"];
  for (let mask = 0; mask < 64; mask++) {
    const roles = all.filter((_, index) => mask & (1 << index));
    const combined = roleCapabilities(roles);
    for (const role of roles) for (const [key, allowed] of Object.entries(roleCapabilities([role]))) {
      if (allowed) assert.equal(combined[key as keyof typeof combined], true, `${roles}: ${key}`);
    }
  }
});
test("administrator-only users do not receive personal employee actions", () => {
  assert.equal(roleCapabilities(["org_admin"], false).personal, false);
  assert.equal(roleCapabilities(["org_admin"], false).team, true);
  assert.equal(roleLanding(["org_admin"], false).href, "/setup");
});
test("first actions match the role's responsibilities", () => {
  assert.equal(roleLanding(["employee"]).href, "/my-leave");
  assert.equal(roleLanding(["employee", "manager"]).href, "/requests");
  assert.equal(roleLanding(["employee", "hr_admin"]).href, "/team");
  assert.equal(roleLanding(["employee", "org_admin"]).href, "/setup");
  assert.equal(roleLanding(["employee", "reporter"]).href, "/reports");
  assert.equal(roleLanding(["employee", "auditor"]).href, "/audit");
});
