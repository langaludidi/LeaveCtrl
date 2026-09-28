import assert from "node:assert/strict";
import test from "node:test";

import {
  boolValue,
  normaliseHeader,
  parseCsv,
  validIsoDate,
} from "../lib/employee-csv.ts";

test("normaliseHeader produces stable import keys", () => {
  assert.equal(normaliseHeader(" First Name "), "first_name");
  assert.equal(normaliseHeader("work-schedule"), "work_schedule");
  assert.equal(normaliseHeader("manager   email"), "manager_email");
});

test("parseCsv handles quoted commas, escaped quotes and CRLF", () => {
  const csv =
    'first_name,last_name,email\r\n' +
    '"Nomsa","Mbeki, Jr.","nomsa@example.co.za"\r\n' +
    '"Sipho ""SJ""","Ndlovu","sipho@example.co.za"\r\n';

  assert.deepEqual(parseCsv(csv), [
    ["first_name", "last_name", "email"],
    ["Nomsa", "Mbeki, Jr.", "nomsa@example.co.za"],
    ['Sipho "SJ"', "Ndlovu", "sipho@example.co.za"],
  ]);
});

test("parseCsv ignores completely blank rows", () => {
  assert.deepEqual(parseCsv("a,b\n\n1,2\n   ,   \n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("boolValue recognises supported truthy values and fallback", () => {
  for (const value of ["1", "yes", "YES", "y", "true", "send"]) {
    assert.equal(boolValue(value), true, value);
  }

  for (const value of ["0", "no", "false", "n"]) {
    assert.equal(boolValue(value), false, value);
  }

  assert.equal(boolValue("", true), true);
  assert.equal(boolValue("   ", false), false);
});

test("validIsoDate accepts real ISO calendar dates", () => {
  assert.equal(validIsoDate("2024-02-29"), true);
  assert.equal(validIsoDate("2026-09-01"), true);
  assert.equal(validIsoDate("2000-01-01"), true);
});

test("validIsoDate rejects impossible or malformed dates", () => {
  for (const value of [
    "2026-02-29",
    "2026-02-31",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "01-09-2026",
    "2026-9-01",
    "",
  ]) {
    assert.equal(validIsoDate(value), false, value);
  }
});
