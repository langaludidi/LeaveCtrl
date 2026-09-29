import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("authenticated page context is fetched in a single database RPC", async () => {
  const context = await readFile("lib/current-context.ts", "utf8");

  assert.match(context, /rpc\("get_current_context_v1"\)/);
  assert.doesNotMatch(context, /from\("employees"\)/);
  assert.doesNotMatch(context, /from\("organisation_memberships"\)/);
  assert.doesNotMatch(context, /from\("organisations"\)/);
});
