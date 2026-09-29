import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard summary chevrons belong to real full-card links", async () => {
  const home = await readFile("app/page.tsx", "utf8");
  assert.match(home, /summary-card summary-card-link/);
  assert.match(home, /href="\\/my-leave"/);
  assert.match(home, /href="\\/calendar"/);
  assert.equal((home.match(/href="\\/requests"/g) ?? []).length >= 2, true);
  assert.doesNotMatch(home, /return <div className=\\{`summary-card/);
});

test("dashboard cards expose pointer and keyboard affordances", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /\\.summary-card-link\\{[^}]*cursor:pointer/);
  assert.match(css, /\\.summary-card-link:focus-visible/);
});
