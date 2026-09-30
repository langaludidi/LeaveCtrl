import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("employee invitation callback is pinned to the canonical production app", async () => {
  const source = await readFile(
    "supabase/functions/send-employee-invite/index.ts",
    "utf8"
  );

  assert.match(source, /https:\/\/www\.leavectrl\.co\.za/);
  assert.match(source, /ignored non-canonical LEAVECTRL_APP_URL/);
  assert.doesNotMatch(source, /https:\/\/leave-ctrl\.vercel\.app/);
  assert.doesNotMatch(source, /leave-ctrl-2eqn/);
  assert.match(source, /const allowedOrigin = new URL\(appUrl\)\.origin/);
});
