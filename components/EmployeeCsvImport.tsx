"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string };
type ExistingPerson = { id: string; name: string; email: string };

type ImportRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  startDate: string;
  employeeNumber: string;
  department: string;
  managerEmail: string;
  workSchedule: string;
  openingAnnualBalance: string;
  remuneration: string;
  payFrequency: string;
  sendAccess: boolean;
  managerRole: boolean;
  errors: string[];
};

type RowResult = {
  rowNumber: number;
  email: string;
  name: string;
  status: "imported" | "failed";
  detail: string;
};

function normaliseHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function boolValue(value: string, fallback = false) {
  const normalised = value.trim().toLowerCase();
  if (!normalised) return fallback;
  return ["1", "yes", "y", "true", "send"].includes(normalised);
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime());
}

export function EmployeeCsvImport({
  departments,
  schedules,
  existingPeople,
}: {
  departments: Option[];
  schedules: Option[];
  existingPeople: ExistingPerson[];
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const readyCount = useMemo(
    () => rows.filter((row) => row.errors.length === 0).length,
    [rows]
  );

  function template() {
    const headers = [
      "first_name",
      "last_name",
      "email",
      "start_date",
      "employee_number",
      "department",
      "manager_email",
      "work_schedule",
      "opening_annual_balance",
      "remuneration",
      "pay_frequency",
      "send_access",
      "manager_role",
    ];
    const example = [
      "Nomsa",
      "Mbeki",
      "nomsa@example.co.za",
      "2026-09-01",
      "EMP-001",
      departments[0]?.name ?? "Operations",
      existingPeople[0]?.email ?? "",
      schedules[0]?.name ?? "Standard Monday to Friday",
      "15",
      "35000",
      "monthly",
      "yes",
      "no",
    ];

    const csv = [headers, example]
      .map((line) =>
        line
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "leavectrl-employee-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setResults([]);
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.length < 2) {
      setRows([]);
      setError("The CSV must contain a header row and at least one employee.");
      return;
    }

    const headers = parsed[0].map(normaliseHeader);
    const index = new Map(headers.map((header, position) => [header, position]));
    const required = ["first_name", "last_name", "email", "start_date"];
    const missing = required.filter((header) => !index.has(header));

    if (missing.length) {
      setRows([]);
      setError(`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
      return;
    }

    if (parsed.length - 1 > 300) {
      setRows([]);
      setError("V1 CSV imports are limited to 300 employees per batch.");
      return;
    }

    function value(line: string[], header: string) {
      const position = index.get(header);
      return position === undefined ? "" : String(line[position] ?? "").trim();
    }

    const seenEmails = new Set<string>();
    const importedRows: ImportRow[] = parsed.slice(1).map((line, offset) => {
      const email = value(line, "email").toLowerCase();
      const startDate = value(line, "start_date");
      const openingAnnualBalance = value(line, "opening_annual_balance");
      const remuneration = value(line, "remuneration");
      const payFrequency = value(line, "pay_frequency") || "monthly";
      const errors: string[] = [];

      if (!value(line, "first_name")) errors.push("First name is required.");
      if (!value(line, "last_name")) errors.push("Last name is required.");
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push("Valid email is required.");
      if (!validIsoDate(startDate)) errors.push("Start date must be YYYY-MM-DD.");
      if (seenEmails.has(email)) errors.push("Duplicate email in this file.");
      if (email) seenEmails.add(email);

      if (
        openingAnnualBalance &&
        (!Number.isFinite(Number(openingAnnualBalance)) || Number(openingAnnualBalance) < 0)
      ) {
        errors.push("Opening annual balance must be zero or greater.");
      }

      if (
        remuneration &&
        (!Number.isFinite(Number(remuneration)) || Number(remuneration) < 0)
      ) {
        errors.push("Remuneration must be zero or greater.");
      }

      if (!["monthly", "annual", "weekly", "daily", "hourly"].includes(payFrequency)) {
        errors.push("Pay frequency is not supported.");
      }

      const department = value(line, "department");
      if (
        department &&
        !departments.some(
          (item) => item.name.toLowerCase() === department.toLowerCase()
        )
      ) {
        errors.push(`Unknown department: ${department}.`);
      }

      const schedule = value(line, "work_schedule");
      if (
        schedule &&
        !schedules.some(
          (item) => item.name.toLowerCase() === schedule.toLowerCase()
        )
      ) {
        errors.push(`Unknown work schedule: ${schedule}.`);
      }

      return {
        rowNumber: offset + 2,
        firstName: value(line, "first_name"),
        lastName: value(line, "last_name"),
        email,
        startDate,
        employeeNumber: value(line, "employee_number"),
        department,
        managerEmail: value(line, "manager_email").toLowerCase(),
        workSchedule: schedule,
        openingAnnualBalance,
        remuneration,
        payFrequency,
        sendAccess: boolValue(value(line, "send_access"), true),
        managerRole: boolValue(value(line, "manager_role"), false),
        errors,
      };
    });

    setRows(importedRows);
  }

  async function runImport() {
    if (!readyCount || importing) return;

    setImporting(true);
    setProgress(0);
    setError("");
    setResults([]);

    const supabase = createClient();
    const departmentMap = new Map(
      departments.map((item) => [item.name.toLowerCase(), item.id])
    );
    const scheduleMap = new Map(
      schedules.map((item) => [item.name.toLowerCase(), item.id])
    );
    const personByEmail = new Map(
      existingPeople.map((item) => [item.email.toLowerCase(), item.id])
    );
    const created = new Map<string, { id: string; row: ImportRow }>();
    const rowResults = new Map<number, RowResult>();

    const validRows = rows.filter((row) => row.errors.length === 0);

    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index];
      const departmentId = row.department
        ? departmentMap.get(row.department.toLowerCase())
        : undefined;
      const scheduleId = row.workSchedule
        ? scheduleMap.get(row.workSchedule.toLowerCase())
        : undefined;

      const { data, error: createError } = await supabase.rpc("add_employee_record", {
        p_email: row.email,
        p_first_name: row.firstName,
        p_last_name: row.lastName,
        p_start_date: row.startDate,
        p_employee_number: row.employeeNumber || undefined,
        p_department_id: departmentId,
        p_manager_employee_id: undefined,
        p_work_schedule_id: scheduleId,
        p_grant_manager_role: false,
        p_prepare_invitation: false,
      });

      if (createError || !data) {
        rowResults.set(row.rowNumber, {
          rowNumber: row.rowNumber,
          email: row.email,
          name: `${row.firstName} ${row.lastName}`,
          status: "failed",
          detail:
            createError?.message === "employee_email_already_exists"
              ? "Employee email already exists."
              : createError?.message ?? "Employee could not be created.",
        });
        setProgress(index + 1);
        continue;
      }

      const employeeId = String((data as { employee_id?: string }).employee_id ?? "");
      if (!employeeId) {
        rowResults.set(row.rowNumber, {
          rowNumber: row.rowNumber,
          email: row.email,
          name: `${row.firstName} ${row.lastName}`,
          status: "failed",
          detail: "Employee was created without a usable identifier.",
        });
        setProgress(index + 1);
        continue;
      }

      created.set(row.email, { id: employeeId, row });
      personByEmail.set(row.email, employeeId);

      let detail = "Employee created.";

      if (row.openingAnnualBalance) {
        const balance = await supabase.rpc("set_employee_opening_balance", {
          p_employee_id: employeeId,
          p_leave_type_code: "ANNUAL",
          p_balance: Number(row.openingAnnualBalance),
          p_reason: "Opening annual leave balance confirmed by CSV import",
        });
        if (balance.error) detail += " Opening annual balance needs review.";
      }

      if (row.remuneration) {
        const remuneration = await supabase.rpc("set_employee_remuneration", {
          p_employee_id: employeeId,
          p_effective_from: row.startDate,
          p_gross_amount: Number(row.remuneration),
          p_pay_frequency: row.payFrequency,
          p_daily_rate_override: undefined,
          p_reason: "Remuneration captured by CSV import",
        } as never);
        if (remuneration.error) detail += " Remuneration needs review.";
      }

      rowResults.set(row.rowNumber, {
        rowNumber: row.rowNumber,
        email: row.email,
        name: `${row.firstName} ${row.lastName}`,
        status: "imported",
        detail,
      });
      setProgress(index + 1);
    }

    for (const { id, row } of created.values()) {
      if (!row.managerEmail) continue;
      const managerId = personByEmail.get(row.managerEmail);
      if (!managerId) {
        const previous = rowResults.get(row.rowNumber);
        if (previous) previous.detail += " Manager email was not found.";
        continue;
      }

      const managerResult = await supabase.rpc("assign_employee_manager", {
        p_employee_id: id,
        p_manager_employee_id: managerId,
      });

      if (managerResult.error) {
        const previous = rowResults.get(row.rowNumber);
        if (previous) previous.detail += " Manager assignment needs review.";
      }
    }

    for (const { id, row } of created.values()) {
      if (!row.sendAccess) continue;

      const { data: token, error: inviteError } = await supabase.rpc(
        "prepare_employee_access_invitation",
        {
          p_employee_id: id,
          p_grant_manager_role: row.managerRole,
        }
      );

      const previous = rowResults.get(row.rowNumber);
      if (inviteError || !token) {
        if (previous) previous.detail += " Access invitation needs review.";
        continue;
      }

      const { error: deliveryError } = await supabase.functions.invoke(
        "send-employee-invite",
        {
          body: {
            employeeId: id,
            email: row.email,
            token,
          },
        }
      );

      if (previous) {
        previous.detail += deliveryError
          ? " Employee created; activation email delivery needs review."
          : " Activation email sent.";
      }
    }

    const invalidResults: RowResult[] = rows
      .filter((row) => row.errors.length)
      .map((row) => ({
        rowNumber: row.rowNumber,
        email: row.email,
        name: `${row.firstName} ${row.lastName}`.trim() || "Invalid row",
        status: "failed",
        detail: row.errors.join(" "),
      }));

    const finalResults = [
      ...Array.from(rowResults.values()),
      ...invalidResults,
    ].sort((a, b) => a.rowNumber - b.rowNumber);

    setResults(finalResults);
    setImporting(false);
    router.refresh();
  }

  return (
    <section className="card csv-import-card">
      <div className="card-title">
        <div>
          <h2>Bulk employee import</h2>
          <p className="card-subtitle">
            Preview and validate up to 300 employees before any record is created.
            Valid rows continue even when another row needs review.
          </p>
        </div>
        <FileSpreadsheet size={19}/>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <div className="csv-import-actions">
        <button type="button" className="btn secondary" onClick={template}>
          <FileSpreadsheet size={16}/> CSV template
        </button>
        <label className="btn secondary csv-file-button">
          <Upload size={16}/> Choose CSV
          <input type="file" accept=".csv,text/csv" onChange={chooseFile}/>
        </label>
        {fileName ? <span className="csv-file-name">{fileName}</span> : null}
      </div>

      {rows.length ? (
        <>
          <div className="csv-import-summary">
            <span><strong>{rows.length}</strong> rows</span>
            <span><strong>{readyCount}</strong> ready</span>
            <span className={rows.length - readyCount ? "has-errors" : ""}>
              <strong>{rows.length - readyCount}</strong> need review
            </span>
          </div>

          <div className="table-scroll csv-preview">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Employee</th>
                  <th>Start</th>
                  <th>Department</th>
                  <th>Schedule</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>
                      <strong>{row.firstName} {row.lastName}</strong>
                      <span className="table-secondary">{row.email}</span>
                    </td>
                    <td>{row.startDate || "—"}</td>
                    <td>{row.department || "Assign later"}</td>
                    <td>{row.workSchedule || "Assign later"}</td>
                    <td>
                      {row.errors.length ? (
                        <span className="csv-row-status error">
                          <XCircle size={13}/> {row.errors[0]}
                        </span>
                      ) : (
                        <span className="csv-row-status ready">
                          <CheckCircle2 size={13}/> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 12 ? (
            <p className="csv-more-rows">
              Preview shows the first 12 rows. All {rows.length} rows are validated before import.
            </p>
          ) : null}

          <div className="csv-import-footer">
            <span>
              {importing
                ? `Creating employee ${Math.min(progress + 1, readyCount)} of ${readyCount}…`
                : "No records are created until you start the import."}
            </span>
            <button
              type="button"
              className="btn primary"
              disabled={!readyCount || importing}
              onClick={runImport}
            >
              <Upload size={16}/>
              {importing ? "Importing…" : `Import ${readyCount} employee${readyCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      ) : null}

      {results.length ? (
        <div className="csv-results">
          <div className="card-title">
            <h3>Import results</h3>
            <span className="muted-count">
              {results.filter((result) => result.status === "imported").length} imported ·{" "}
              {results.filter((result) => result.status === "failed").length} need review
            </span>
          </div>
          <div className="compact-rule-list">
            {results.map((result) => (
              <div className="csv-result-row" key={result.rowNumber}>
                {result.status === "imported"
                  ? <CheckCircle2 size={15}/>
                  : <XCircle size={15}/>}
                <div>
                  <strong>Row {result.rowNumber} · {result.name}</strong>
                  <span>{result.email || "No valid email"} · {result.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
