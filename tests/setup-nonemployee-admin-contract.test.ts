import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("organisation setup is accessible to authorised administrators without employee profiles", async () => {
  const setup = await readFile("app/setup/page.tsx", "utf8");
  assert.match(setup, /getCurrentContext\(\{\s*requireEmployee:\s*false/);
  assert.match(setup, /roles\.includes\("org_admin"\)/);
  assert.match(setup, /if \(!canAdmin\) redirect\("\/"\)/);
  assert.match(setup, /const organisationId = accessState\.organisation_id/);
  assert.doesNotMatch(setup, /if \(!employee\) return null/);
  assert.doesNotMatch(setup, /employee\.organisation_id/);
});
