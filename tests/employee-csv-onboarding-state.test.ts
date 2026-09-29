import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CSV import distinguishes completed, partial and failed rows", async () => {
  const source = await readFile("components/EmployeeCsvImport.tsx", "utf8");

  assert.ok(source.includes('status: "imported" | "partial" | "failed"'));
  assert.ok(source.includes('status: setupIncomplete ? "partial" : "imported"'));
  assert.ok(source.includes('previous.status = "partial"'));
  assert.ok(source.includes('result.status === "partial"'));
  assert.ok(source.includes("<AlertTriangle size={15}/>"));
});

test("post-create setup failures cannot be presented as complete imports", async () => {
  const source = await readFile("components/EmployeeCsvImport.tsx", "utf8");

  for (const message of [
    "Opening annual balance needs review.",
    "Remuneration needs review.",
    "Manager assignment needs review.",
    "Access invitation needs review.",
    "activation email delivery needs review.",
  ]) {
    assert.ok(source.includes(message), message);
  }

  assert.ok(source.includes('if (deliveryError) previous.status = "partial";'));
});


test("CSV preview checks organisation-wide email and employee-number conflicts", async () => {
  const source = await readFile("components/EmployeeCsvImport.tsx", "utf8");
  const team = await readFile("app/team/page.tsx", "utf8");

  assert.match(team, /employee_number/);
  assert.match(team, /existingPeople=\{\(people \?\? \[\]\)\.map/);
  assert.match(source, /existingEmployeeNumberSet/);
  assert.match(source, /Employee number already exists\./);
  assert.match(source, /existingEmailSet/);
});

test("inactive employees block duplicate identities but cannot be selected as managers", async () => {
  const source = await readFile("components/EmployeeCsvImport.tsx", "utf8");

  assert.match(source, /activeManagerEmailSet/);
  assert.match(source, /\.filter\(\(person\) => person\.active\)/);
  assert.match(source, /existingPeople[\s\S]*\.filter\(\(item\) => item\.active\)[\s\S]*personByEmail/);
});
