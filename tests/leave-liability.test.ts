import assert from "node:assert/strict";
import test from "node:test";
import { annualLeaveLiabilityByEmployee, readAllReportRows } from "../lib/leave-liability.ts";

const balance = { employee_id: "employee", entitlement_id: "current-cycle", available_balance: 10 };
const request = (id: string, status: string, leave_type_id = "annual") =>
  ({ id, employee_id: "employee", leave_type_id, status });
const entry = (request_id: string, quantity: number, entitlement_id = "current-cycle") =>
  ({ request_id, quantity, entitlement_id });
const day = (request_id: string, leave_date: string, chargeable_quantity = 1) =>
  ({ request_id, leave_date, chargeable_quantity });
const calculate = (requests: ReturnType<typeof request>[], ledger: ReturnType<typeof entry>[], days: ReturnType<typeof day>[] = []) =>
  annualLeaveLiabilityByEmployee({ balances: [balance], requests, ledger, days,
    annualLeaveTypeId: "annual", businessDate: "2027-01-02" }).get("employee");

test("sick and parental reservations do not inflate annual liability", () => {
  assert.equal(calculate([request("sick", "pending_approval", "sick"), request("parental", "approved", "parental")],
    [entry("sick", -2), entry("parental", -5)], [day("parental", "2027-01-03", 5)]), 10);
});

test("pending annual reservations survive reporting-year boundaries", () => {
  assert.equal(calculate([request("pending", "pending_approval")], [entry("pending", -2)]), 12);
  assert.equal(calculate([request("pending", "submitted")], [entry("pending", -0.5)]), 10.5);
});

test("approved annual leave adds only untaken chargeable days, including a New Year crossing", () => {
  const days = [day("approved", "2026-12-31"), day("approved", "2027-01-02"),
    day("approved", "2027-01-03", 0.5), day("approved", "2027-01-04")];
  assert.equal(calculate([request("approved", "approved")],
    [entry("approved", -3.5), entry("approved", 3.5), entry("approved", -3.5)], days), 11.5);
});

test("cancellation awaiting a decision still counts but reversed and declined reservations do not", () => {
  assert.equal(calculate([request("r", "cancellation_requested")], [entry("r", -2)], [day("r", "2027-01-03", 2)]), 12);
  for (const status of ["cancelled", "declined", "withdrawn"]) {
    assert.equal(calculate([request("r", status)], [entry("r", -2), entry("r", 2)]), 10);
  }
});

test("reservations belonging to another employee or entitlement never affect the current balance", () => {
  const other = { ...request("other", "pending_approval"), employee_id: "other-employee" };
  assert.equal(calculate([request("past", "pending_approval"), request("future", "approved"), other],
    [entry("past", -2, "old-cycle"), entry("future", -5, "future-cycle"), entry("other", -8)],
    [day("future", "2027-05-01", 5)]), 10);
});

test("add-backs cannot exceed the actual net debit or count unlinked records", () => {
  assert.equal(calculate([request("r", "approved")],
    [entry("r", -2), entry("r", 1), entry("missing", -5)], [day("r", "2027-01-03", 5)]), 11);
  assert.equal(annualLeaveLiabilityByEmployee({ balances: [{ ...balance, available_balance: -2 }],
    ledger: [], requests: [], days: [], annualLeaveTypeId: "annual", businessDate: "2027-01-02" }).get("employee"), 0);
});

test("financial source reads include every API page and fail rather than return a partial total", async () => {
  const source = Array.from({ length: 1201 }, (_, i) => i);
  const rows = await readAllReportRows(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
  assert.deepEqual(rows, source);
  await assert.rejects(readAllReportRows(async (from) => from === 0
    ? { data: source.slice(0, 500), error: null }
    : { data: null, error: new Error("provider unavailable") }), /source unavailable/);
});
