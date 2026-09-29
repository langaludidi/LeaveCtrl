import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root metadata exposes dynamic and explicit social cards", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");

  assert.match(layout, /metadataBase: new URL\(siteUrl\)/);
  assert.match(layout, /siteName: "LeaveCtrl"/);
  assert.match(layout, /url: "\/api\/social-image"/);
  assert.match(layout, /url: "\/social\/leavectrl-social-dark\.jpg"/);
  assert.match(layout, /url: "\/social\/leavectrl-social-light\.jpg"/);
  assert.match(layout, /width: 1200/);
  assert.match(layout, /height: 630/);
  assert.match(layout, /card: "summary_large_image"/);
  assert.match(layout, /canonical: "\/"/);
});

test("social image endpoint supports explicit variants and deterministic rotation", async () => {
  const route = await readFile("app/api/social-image/route.ts", "utf8");

  assert.match(route, /variant/);
  assert.match(route, /SOCIAL_IMAGES/);
  assert.match(route, /Date\.now\(\) \/ 86_400_000/);
  assert.match(route, /stableHash/);
  assert.match(route, /leavectrl-social-dark\.jpg/);
  assert.match(route, /leavectrl-social-light\.jpg/);
  assert.match(route, /X-LeaveCtrl-Social-Variant/);
  assert.match(route, /status: 307/);
});
