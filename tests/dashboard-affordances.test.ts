import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard summary chevrons belong to real full-card links", async () => {
  const home = await readFile("app/page.tsx", "utf8");

  assert.ok(home.includes("summary-card summary-card-link"));
  assert.ok(home.includes('href="/my-leave"'));
  assert.ok(home.includes('href="/calendar"'));
  assert.equal((home.match(/href="\/requests"/g) ?? []).length >= 2, true);
  assert.equal(home.includes("return <div className={`summary-card"), false);
});

test("dashboard cards expose pointer and keyboard affordances", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.ok(css.includes(".summary-card-link{"));
  assert.ok(css.includes("cursor:pointer"));
  assert.ok(css.includes(".summary-card-link:focus-visible"));
});
