import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { safeCsvCell } from "../lib/csv-export.ts";

test("CSV export neutralises spreadsheet formula injection", () => {
  assert.equal(safeCsvCell("=HYPERLINK(\"https://evil.example\")"), "'=HYPERLINK(\"https://evil.example\")");
  assert.equal(safeCsvCell("+1+1"), "'+1+1");
  assert.equal(safeCsvCell("-1+2"), "'-1+2");
  assert.equal(safeCsvCell("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(safeCsvCell(" Normal employee"), " Normal employee");
});

test("CSV escaping still protects commas, quotes and line breaks", () => {
  assert.equal(safeCsvCell('Doe, Jane'), '"Doe, Jane"');
  assert.equal(safeCsvCell('Jane "JJ" Doe'), '"Jane ""JJ"" Doe"');
});

test("organisation export does not expose raw database error messages", async () => {
  const route = await readFile("app/setup/export/route.ts", "utf8");

  assert.doesNotMatch(route, /result\.error\?\.message/);
  assert.match(route, /sections:\s*failed\.map\(\(\[name\]\) => name\)/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
});
