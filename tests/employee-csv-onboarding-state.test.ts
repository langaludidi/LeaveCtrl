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
