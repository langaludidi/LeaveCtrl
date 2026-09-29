import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root metadata exposes canonical Open Graph and large Twitter cards", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");

  assert.match(layout, /metadataBase: new URL\(siteUrl\)/);
  assert.match(layout, /siteName: "LeaveCtrl"/);
  assert.match(layout, /url: "\/opengraph-image"/);
  assert.match(layout, /width: 1200/);
  assert.match(layout, /height: 630/);
  assert.match(layout, /card: "summary_large_image"/);
  assert.match(layout, /canonical: "\/"/);
});

test("Open Graph card uses the Availability Matrix brand and production dimensions", async () => {
  const og = await readFile("app/opengraph-image.tsx", "utf8");

  assert.match(og, /width: 1200/);
  assert.match(og, /height: 630/);
  assert.match(og, /MatrixMark/);
  assert.match(og, /Leave & workforce availability/i);
  assert.match(og, /leavectrl\.co\.za/);
});
