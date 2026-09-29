import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("policy and employee-assignment selects expose accessible names", async () => {
  const policy = await readFile("components/InitialPolicyForm.tsx", "utf8");
  const organisation = await readFile("components/OrganisationControls.tsx", "utf8");

  assert.match(policy, /aria-label="Leave cycle basis"/);
  assert.match(organisation, /Department for/);
  assert.match(organisation, /Work schedule for/);
});
