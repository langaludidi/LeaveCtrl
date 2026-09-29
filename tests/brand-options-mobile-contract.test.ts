import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("approved Availability Matrix brand is rendered in shell and auth", async () => {
  const shell = await readFile("components/AppShell.tsx", "utf8");
  const login = await readFile("app/login/page.tsx", "utf8");
  const brand = await readFile("components/BrandLogo.tsx", "utf8");

  assert.match(shell, /<BrandLogo className="shell-brand-logo" \/>/);
  assert.match(login, /<BrandLogo className="auth-brand-logo" \/>/);
  assert.match(brand, /brand-mark/);
  assert.match(brand, /Leave/);
  assert.match(brand, /Ctrl/);
});

test("data-backed selects never render as unexplained empty controls", async () => {
  const book = await readFile("components/BookLeaveForm.tsx", "utf8");
  const org = await readFile("components/OrganisationControls.tsx", "utf8");
  const overtime = await readFile("components/OvertimeControls.tsx", "utf8");
  const workforce = await readFile("components/WorkforceChangeControls.tsx", "utf8");

  assert.match(book, /No leave types available/);
  assert.match(org, /Create a schedule above first/);
  assert.match(overtime, /No active employees available/);
  assert.match(workforce, /Create a work schedule first/);
  assert.match(workforce, /No active employees available/);
});

test("mobile controls use iOS-safe input sizing and compact schedules", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.match(
    css,
    /@media\(max-width:760px\)[\s\S]*?input,select,textarea\{font-size:16px\}/
  );
  assert.match(
    css,
    /@media\(max-width:520px\)[\s\S]*?\.schedule-hours-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/
  );
});
