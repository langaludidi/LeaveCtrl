import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vercel compute is colocated with the Ireland Supabase region", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  assert.deepEqual(config.regions, ["dub1"]);
  assert.equal(config.fluid, true);
  assert.equal(config.framework, "nextjs");
});
