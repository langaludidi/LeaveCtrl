import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile navigation keeps every authorised destination reachable", async () => {
  const css = await readFile("app/globals.css", "utf8");
  const shell = await readFile("components/AppShell.tsx", "utf8");

  assert.doesNotMatch(
    css,
    /\.nav-list\s+\.nav-item:nth-child\([^)]*\)\s*\{\s*display\s*:\s*none/i,
    "Mobile CSS must not hide navigation destinations by position"
  );

  assert.match(
    css,
    /@media\(max-width:760px\)[\s\S]*?\.nav-list\{[^}]*overflow-x:auto/i,
    "Mobile navigation must remain horizontally reachable"
  );

  assert.match(shell, /aria-label=\{label\}/);
  assert.match(shell, /title=\{label\}/);
});

test("primary mobile controls keep practical touch targets", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.match(
    css,
    /@media\(max-width:760px\)[\s\S]*?\.notification-button\{[^}]*width:44px;[^}]*height:44px/i
  );
  assert.match(
    css,
    /@media\(max-width:760px\)[\s\S]*?\.approval-actions button\{[^}]*width:44px;[^}]*height:44px/i
  );
  assert.match(
    css,
    /@media\(max-width:760px\)[\s\S]*?\.request-text-action\{[^}]*min-height:44px/i
  );
});
