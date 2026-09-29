import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("My Leave has a genuine route loading state that mirrors the first viewport", async () => {
  const source = await readFile("app/my-leave/loading.tsx", "utf8");

  assert.match(source, /aria-busy="true"/);
  assert.match(source, /Loading My Leave/);
  assert.match(source, /BrandLogo/);
  assert.match(source, /loading-balance-row/);
  assert.match(source, /loading-action-grid/);
  assert.doesNotMatch(source, /setTimeout|sleep|delay/i);
});

test("loading skeleton respects reduced motion", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.loading-skeleton-line/);
  assert.match(css, /animation:none/);
});
