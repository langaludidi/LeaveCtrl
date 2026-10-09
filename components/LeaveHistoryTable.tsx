"use client";

import { useMemo, useState } from "react";
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

export function LeaveHistoryTable({ rows, organisationName, periodStart, periodEnd }: { rows: LeaveHistoryRow[]; organisationName: string; periodStart: string; periodEnd: string }) {
  const [status, setStatus] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => rows.filter((row) =>
    (status === "all" || row.status === status) &&
    (!start || row.startDate >= start) &&
    (!end || row.startDate <= end)
  ).sort((a, b) => b.startDate.localeCompare(a.startDate)), [rows, status, start, end]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = () => setPage(1);
  const downloadFilteredCsv = () => {
    const generatedAt = new Date().toISOString();
    const csv = reportCsv({
      reportTitle: "Leave Request History",
      organisationName,
      periodStart: start || periodStart,
      periodEnd: end || periodEnd,
      generatedAt,
      reference: reportReference(generatedAt, crypto.randomUUID()),
      classification: "Confidential",
      filters: { Status: status === "all" ? "All" : status },
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
  };


  return (
    <section className="card data-card" aria-labelledby="leave-history-report-heading">
      <div className="card-title">
        <div>
          <h2 id="leave-history-report-heading">Leave request history</h2>
          <p className="card-subtitle">Requests starting in the current calendar year, within your authorised reporting scope. Approved bookings may be future leave, not leave already taken.</p>
        </div>
        <div className="report-export-actions"><span className="muted-count">{filtered.length} of {rows.length} requests</span><button type="button" className="btn secondary" onClick={downloadFilteredCsv}>Export filtered CSV</button></div>
      </div>
      <div className="report-history-filters">
        <label>Status
          <select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}>
            <option value="all">All statuses</option>
            {Array.from(new Set(rows.map((row) => row.status))).sort().map((value) =>
              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
            )}
          </select>
        </label>
        <label>From (leave start)
          <input type="date" value={start} onChange={(event) => { setStart(event.target.value); resetPage(); }}/>
        </label>
        <label>To (leave start)
          <input type="date" min={start || undefined} value={end} onChange={(event) => { setEnd(event.target.value); resetPage(); }}/>
        </label>
        <button type="button" className="btn secondary" onClick={() => { setStatus("all"); setStart(""); setEnd(""); resetPage(); }}>Clear filters</button>
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
