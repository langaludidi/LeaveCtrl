import assert from "node:assert/strict";
import test from "node:test";

import { accessGateRedirect } from "../lib/access-gate.ts";
import type { LeaveCtrlAccessState } from "../lib/access-state.ts";

function state(
  overrides: Partial<LeaveCtrlAccessState> = {}
): LeaveCtrlAccessState {
  return {
    organisation_id: "org-a",
    organisation_name: "Organisation A",
    roles: ["employee"],
    employee_id: "employee-a",
    employee_welcome_completed_at: "2026-09-30T00:00:00Z",
    organisation_onboarding_completed_at: "2026-09-30T00:00:00Z",
    ...overrides,
  };
}

test("verified identity without membership cannot enter application routes", () => {
  assert.equal(accessGateRedirect("/my-leave", []), "/access/no-membership");
  assert.equal(accessGateRedirect("/", []), "/access/no-membership");
  assert.equal(accessGateRedirect("/onboarding", []), null);
  assert.equal(accessGateRedirect("/join", []), null);
});

test("ambiguous multiple organisation membership fails closed", () => {
  assert.equal(
    accessGateRedirect("/my-leave", [
      state(),
      state({ organisation_id: "org-b", organisation_name: "Organisation B" }),
    ]),
    "/access/organisation-context"
  );
});

test("membership without an active employee profile cannot enter workforce data", () => {
  assert.equal(
    accessGateRedirect("/my-leave", [state({ employee_id: null })]),
    "/access/membership-incomplete"
  );
});

test("new organisation creator stays in company onboarding until core setup is completed", () => {
  const creator = state({
    roles: ["employee", "org_admin"],
    organisation_onboarding_completed_at: null,
  });

  assert.equal(accessGateRedirect("/", [creator]), "/setup");
  assert.equal(accessGateRedirect("/my-leave", [creator]), "/setup");
  assert.equal(accessGateRedirect("/setup", [creator]), null);
  assert.equal(accessGateRedirect("/team", [creator]), null);
});

test("ordinary employee waits while organisation setup remains incomplete", () => {
  const employee = state({
    organisation_onboarding_completed_at: null,
  });

  assert.equal(
    accessGateRedirect("/my-leave", [employee]),
    "/access/organisation-setup-pending"
  );
});

test("invited employee receives one-time employee onboarding before My Leave", () => {
  const employee = state({
    employee_welcome_completed_at: null,
  });

  assert.equal(accessGateRedirect("/my-leave", [employee]), "/welcome");
  assert.equal(accessGateRedirect("/welcome", [employee]), null);
});

test("manager remains an employee identity with additive manager capability", () => {
  const manager = state({
    roles: ["employee", "manager"],
    employee_welcome_completed_at: null,
  });

  assert.equal(accessGateRedirect("/my-leave", [manager]), "/welcome");
  assert.equal(accessGateRedirect("/welcome", [manager]), null);
});

test("completed membership and onboarding permit normal application routing", () => {
  assert.equal(accessGateRedirect("/my-leave", [state()]), null);
});
