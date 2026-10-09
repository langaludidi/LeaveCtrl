"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { reportCsv, reportReference } from "@/lib/report-export";

export type LeaveHistoryRow = {
  id: string;
  employee: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  quantity: number;
  status: string;
};

const PAGE_SIZE = 25;

export function LeaveHistoryTable({ rows, organisationName, periodStart, periodEnd, exportAllowed, exportYear, leaveTypeIds = {} }: { rows: LeaveHistoryRow[]; organisationName: string; periodStart: string; periodEnd: string; exportAllowed: boolean; exportYear?: number; leaveTypeIds?: Record<string, string> }) {
  const [status, setStatus] = useState("all");
  const [leaveType, setLeaveType] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const filtered = useMemo(() => rows.filter((row) =>
    (status === "all" || row.status === status) &&
    (leaveType === "all" || row.leaveType === leaveType) &&
    (!employeeFilter || row.employee.toLocaleLowerCase().includes(employeeFilter.trim().toLocaleLowerCase())) &&
    (row.startDate >= (start || periodStart)) &&
    (row.startDate <= (end || periodEnd))
  ).sort((a, b) => b.startDate.localeCompare(a.startDate)), [rows, status, leaveType, employeeFilter, start, end]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const exportParams = new URLSearchParams({ year: String(exportYear ?? Number(periodStart.slice(0, 4))) });
  if (status !== "all") exportParams.set("status", status);
  if (leaveType !== "all" && leaveTypeIds[leaveType]) exportParams.set("leaveType", leaveTypeIds[leaveType]);
  if (employeeFilter.trim()) exportParams.set("employee", employeeFilter.trim());
  if (start !== periodStart) exportParams.set("from", start);
  if (end !== periodEnd) exportParams.set("to", end);
  const exportUrl = `/reports/history/export?${exportParams.toString()}`;
  const resetPage = () => setPage(1);
  const downloadFilteredCsv = async () => {
    if (!exportAllowed) return;
    setExporting(true);
    setExportError("");
    try {
      const audit = await fetch("/api/reports/export-audit", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!audit.ok) throw new Error("Export authorisation or audit failed");
    const generatedAt = new Date().toISOString();
    const csv = reportCsv({
      reportTitle: "Leave Request History",
      organisationName,
      periodStart: start || periodStart,
      periodEnd: end || periodEnd,
      generatedAt,
      reference: reportReference(generatedAt, crypto.randomUUID()),
      classification: "Confidential",
      filters: { Status: status === "all" ? "All" : status, "Leave type": leaveType === "all" ? "All" : leaveType, Employee: employeeFilter || "All" },
      dataCutoff: periodEnd,
    }, ["Employee", "Leave Type", "Start", "End", "Days Requested", "Status"],
      filtered.map((row) => [row.employee, row.leaveType, row.startDate, row.endDate, row.quantity, row.status]));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "leavectrl-leave-history-" + generatedAt.slice(0, 10) + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    } catch {
      setExportError("Export could not be authorised or audited. No file was generated.");
    } finally {
      setExporting(false);
    }
  };


  return (
    <section className="card data-card" aria-labelledby="leave-history-report-heading">
      <div className="card-title">
        <div>
          <h2 id="leave-history-report-heading">Leave request history</h2>
          <p className="card-subtitle">Requests starting in the selected reporting year, within your authorised reporting scope. Approved bookings may be future leave, not leave already taken.</p>
        </div>
        <div className="report-export-actions"><span className="muted-count">{filtered.length} of {rows.length} requests</span>{exportAllowed ? <button type="button" className="btn secondary" disabled={exporting} onClick={downloadFilteredCsv}>{exporting ? "Preparing export…" : "Export filtered CSV"}</button> : <Link className="btn secondary" href={exportUrl}>Export full filtered CSV</Link>}</div>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      <p className="card-subtitle">Available source data: {periodStart} to {periodEnd}. Dates outside this range are not loaded into this report.</p>
      <div className="report-history-filters">
        <label>Status
          <select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}>
            <option value="all">All statuses</option>
            {Array.from(new Set(rows.map((row) => row.status))).sort().map((value) =>
              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
            )}
          </select>
        </label>
        <label>Leave type
          <select value={leaveType} onChange={(event) => { setLeaveType(event.target.value); resetPage(); }}>
            <option value="all">All leave types</option>
            {Array.from(new Set(rows.map((row) => row.leaveType))).sort().map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Employee name
          <input type="search" value={employeeFilter} placeholder="Search employee" onChange={(event) => { setEmployeeFilter(event.target.value); resetPage(); }}/>
        </label>
        <label>From (leave start)
          <input type="date" min={periodStart} max={periodEnd} value={start} onChange={(event) => { setStart(event.target.value); resetPage(); }}/>
        </label>
        <label>To (leave start)
          <input type="date" min={start || periodStart} max={periodEnd} value={end} onChange={(event) => { setEnd(event.target.value); resetPage(); }}/>
        </label>
        <button type="button" className="btn secondary" onClick={() => { setStatus("all"); setLeaveType("all"); setEmployeeFilter(""); setStart(periodStart); setEnd(periodEnd); resetPage(); }}>Clear filters</button>
      </div>
      <div className="table-scroll">
        <table className="mobile-data-table">
          <thead><tr><th>Employee</th><th>Leave type</th><th>Start</th><th>End</th><th>Days requested</th><th>Status</th></tr></thead>
          <tbody>
            {visible.map((row) => <tr key={row.id}>
              <td data-label="Employee">{row.employee}</td>
              <td data-label="Leave type">{row.leaveType}</td>
              <td data-label="Start">{row.startDate}</td>
              <td data-label="End">{row.endDate}</td>
              <td data-label="Days requested">{row.quantity}</td>
              <td data-label="Status">{row.status.replaceAll("_", " ")}</td>
            </tr>)}
            {!visible.length && <tr><td colSpan={6}>No requests match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <nav className="report-history-pagination" aria-label="Leave history pages">
        <button type="button" className="btn secondary" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
        <span>Page {currentPage} of {totalPages}</span>
        <button type="button" className="btn secondary" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
      </nav>}
    </section>
  );
}
