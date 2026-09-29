import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("administration exposes the eight-step contextual setup path", async () => {
  const source = await readFile("app/setup/page.tsx", "utf8");

  for (const label of [
    "Organisation details",
    "Leave policy",
    "Working patterns",
    "Departments & locations",
    "Employees",
    "Managers & approvals",
    "Opening leave positions",
    "Coverage rules",
  ]) {
    assert.match(source, new RegExp(label.replace(/[&]/g, "\\&")));
  }

  assert.match(source, /setupPathComplete/);
  assert.match(source, /setup-path-item/);
  assert.match(source, /href: "\/team"/);
  assert.match(source, /id="leave-policy"/);
  assert.match(source, /id="organisation-structure"/);
  assert.match(source, /id="availability-rules"/);
});

test("administrator setup provides missing location and opening balance controls", async () => {
  const organisation = await readFile("components/OrganisationControls.tsx", "utf8");
  const policy = await readFile("components/LeavePolicyControls.tsx", "utf8");

  assert.match(organisation, /rpc\("create_location"/);
  assert.match(organisation, /Locations/);
  assert.match(policy, /rpc\("set_employee_opening_balance"/);
  assert.match(policy, /Opening leave position/);
  assert.match(policy, /Reason \/ migration reference/);
});

test("setup progress is derived from real organisation state", async () => {
  const source = await readFile("app/setup/page.tsx", "utf8");

  assert.match(source, /allPeopleScheduled/);
  assert.match(source, /managerStructureReady/);
  assert.match(source, /annualBalanceCoverageCount/);
  assert.match(source, /coverageRules\?\.length/);
  assert.match(source, /departments\?\.length/);
  assert.match(source, /locations\?\.length/);
});
