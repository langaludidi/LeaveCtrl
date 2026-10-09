import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reportCatalogue } from "../lib/report-catalogue.ts";
import { reportCsv, reportReference, reportTimestamp } from "../lib/report-export.ts";

test("catalogue has exactly 18 unique, permission-labelled reports", () => {
  assert.equal(reportCatalogue.length, 18);
  assert.deepEqual(reportCatalogue.map((r) => r.id), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.ok(reportCatalogue.every((r) => r.audiences.length && r.readiness && r.note));
  assert.equal(reportCatalogue.find((r) => r.id === 8)?.audiences.join(","), "hr");
});

test("report exports include brand, period, local timestamp, reference and classification", () => {
  const iso = "2026-10-09T09:06:00.000Z";
  const reference = reportReference(iso, "A1B2");
  assert.match(reference, /^LC-RPT-20261009-A1B2$/);
  assert.match(reportTimestamp(iso), /09 Oct 2026/);
  assert.match(reportTimestamp(iso), /11:06/);
  const csv = reportCsv({
    reportTitle: "Leave Balance",
    organisationName: "Example Organisation",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    generatedAt: iso,
    reference,
    classification: "Confidential",
    filters: { Department: "Finance" },
  }, ["Employee", "Balance"], [["Example Person", 12], ["=malicious()", 0]]);
  assert.ok(csv.startsWith("\uFEFFLeaveCtrl,Leave & Workforce Availability"));
  assert.match(csv, /LC-RPT-20261009-A1B2/);
  assert.match(csv, /Confidential/);
  assert.match(csv, /Filter: Department,Finance/);
  assert.match(csv, /'=malicious\(\)/);
});

test("report source includes local timezone and CSV injection guard", () => {
  const source = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  assert.match(source, /Africa\/Johannesburg/);
  assert.match(source, /safeCsvCell/);
});

test("export audit migration enforces authenticated, unambiguous tenant membership", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261009134500_role_scoped_report_export_audit.sql", import.meta.url), "utf8");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /count\(distinct m\.organisation_id\)/i);
  assert.match(sql, /v_organisation_count <> 1/);
  assert.match(sql, /ambiguous_organisation_context/);
  assert.match(sql, /m\.user_id = v_user_id/);
  assert.match(sql, /m\.is_active/);
  assert.match(sql, /'org_admin', 'hr_admin', 'reporter', 'auditor', 'manager', 'employee'/);
  assert.match(sql, /insert into public\.audit_events/);
  assert.match(sql, /revoke all on function public\.record_organisation_data_export\(text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.record_organisation_data_export\(text\) to authenticated/);
});

test("both server and client export endpoints fail closed when audit RPC fails", () => {
  for (const path of ["../app/reports/history/export/route.ts", "../app/api/reports/export-audit/route.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /rpc\("record_organisation_data_export"/);
    assert.match(source, /if \(auditError\)|if \(error\)/);
  }
});
