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
    /@media\(max-width:760px\)[\s\S]*?\.nav-list\{[^}]*display:none[^}]*position:absolute[^}]*flex-direction:column/i,
    "Mobile navigation should be a compact drawer rather than a full-height stacked sidebar"
  );
  assert.match(
    css,
    /\.sidebar\.mobile-nav-open \.nav-list\{display:flex\}/i
  );
  assert.match(shell, /className="mobile-nav-toggle"/);
  assert.match(shell, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(shell, /aria-controls="primary-navigation"/);
  assert.match(shell, /className="mobile-nav-backdrop"/);
  assert.match(shell, /aria-label=\{label\}/);
  assert.match(shell, /title=\{label\}/);
});

test("primary mobile controls keep practical touch targets", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.match(
    css,
    /@media\(max-width:760px\)[\s\S]*?\.mobile-nav-toggle\{[^}]*width:44px;[^}]*height:44px/i
  );
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

test("keyboard users receive a persistent visible focus treatment", async () => {
  const css = await readFile("app/globals.css", "utf8");

  for (const selector of [
    "a:focus-visible",
    "button:focus-visible",
    "input:focus-visible",
    "select:focus-visible",
    "textarea:focus-visible",
  ]) {
    assert.match(css, new RegExp(selector.replace(":", "\\:")));
  }

  assert.match(css, /outline\s*:\s*3px\s+solid/i);
  assert.match(css, /outline-offset\s*:\s*2px/i);
});

test("narrow phone header prioritises reachable actions over decorative context", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.match(
    css,
    /@media\(max-width:520px\)[\s\S]*?\.topbar-context\{display:none\}/i
  );
  assert.match(
    css,
    /@media\(max-width:520px\)[\s\S]*?\.top-actions\{[^}]*justify-content:flex-end/i
  );
});
