import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("private application surfaces are not search-indexed", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");

  assert.match(layout, /robots:\s*\{/);
  assert.match(layout, /index:\s*false/);
  assert.match(layout, /follow:\s*false/);
  assert.match(layout, /nocache:\s*true/);
});
