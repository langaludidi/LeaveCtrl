import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("employee invitation fallback targets the authoritative production app", async () => {
  const source = await readFile("supabase/functions/send-employee-invite/index.ts", "utf8");

  assert.match(source, /https:\/\/leave-ctrl\.vercel\.app/);
  assert.doesNotMatch(source, /leave-ctrl-2eqn\.vercel\.app/);
  assert.match(source, /const allowedOrigin = new URL\(appUrl\)\.origin/);
});
