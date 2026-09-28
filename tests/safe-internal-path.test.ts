import assert from "node:assert/strict";
import test from "node:test";

import { safeInternalPath } from "../lib/safe-internal-path.ts";

test("safeInternalPath preserves normal internal destinations", () => {
  assert.equal(safeInternalPath("/"), "/");
  assert.equal(safeInternalPath("/requests/leave/123?from=home#decision"), "/requests/leave/123?from=home#decision");
  assert.equal(safeInternalPath("/onboarding"), "/onboarding");
});

test("safeInternalPath blocks external and protocol-relative redirects", () => {
  for (const value of [
    "//evil.example",
    "https://evil.example/path",
    "javascript:alert(1)",
    "/\\evil.example",
    "/\n/evil.example",
    "",
  ]) {
    assert.equal(safeInternalPath(value, "/safe"), "/safe", value);
  }
});
