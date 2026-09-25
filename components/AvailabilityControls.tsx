"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CalendarX2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Department = { id: string; name: string };
type LeaveType = { id: string; name: string };
type BlockedPeriod = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  hard_block: boolean;
};
type CoverageRule = {
  id: string;
  name: string;
  department_id: string | null;
  minimum_available: number;
  severity: string;
};

export function AvailabilityControls({
  departments,
  leaveTypes,
  blockedPeriods,
  coverageRules,
}: {
  departments: Department[];
  leaveTypes: LeaveType[];
  blockedPeriods: BlockedPeriod[];
  coverageRules: CoverageRule[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function createBlocked(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("blocked");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const leaveTypeId = String(form.get("leaveType") ?? "");

    const { error: rpcError } = await createClient().rpc("create_blocked_period", {
      p_name: String(form.get("name") ?? "").trim(),
      p_start_date: String(form.get("startDate") ?? ""),
      p_end_date: String(form.get("endDate") ?? ""),
      p_leave_type_id: leaveTypeId || undefined,
      p_hard_block: form.get("hardBlock") === "on",
      p_reason: String(form.get("reason") ?? "").trim() || undefined,
    });

    setSaving("");
    if (rpcError) {
      setError("Blocked period could not be created.");
      return;
    }
    event.currentTarget.reset();
    setNotice("Blocked period created.");
    router.refresh();
  }

  async function createCoverage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("coverage");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const departmentId = String(form.get("department") ?? "");

    const { error: rpcError } = await createClient().rpc("create_coverage_rule", {
      p_name: String(form.get("name") ?? "").trim(),
      p_department_id: departmentId || null,
      p_minimum_available: Number(form.get("minimum") ?? 0),
      p_severity: String(form.get("severity") ?? "warning"),
    } as never);

    setSaving("");
    if (rpcError) {
      setError("Coverage rule could not be created.");
      return;
    }
    event.currentTarget.reset();
    setNotice("Coverage rule created.");
    router.refresh();
  }

  return (
    <section className="admin-controls">
      {error ? <div className="auth-alert error">{error}</div> : null}
      {notice ? <div className="auth-alert success">{notice}</div> : null}

      <div className="admin-two-col">
        <form className="card admin-mini-card" onSubmit={createBlocked}>
          <div className="card-title">
            <div>
              <h2>Blocked periods</h2>
              <p className="card-subtitle">Prevent or discourage leave during operationally sensitive dates.</p>
            </div>
            <CalendarX2 size={19}/>
          </div>

          <label>Period name<input name="name" placeholder="Year-end close" required /></label>
          <div className="auth-name-row">
            <label>Start date<input name="startDate" type="date" required /></label>
            <label>End date<input name="endDate" type="date" required /></label>
          </div>
          <label>
            Leave type
            <select className="native-field" name="leaveType" defaultValue="">
              <option value="">All leave types</option>
              {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <label>Reason <span className="muted">(optional)</span><input name="reason" /></label>
          <label className="checkbox-row">
            <input name="hardBlock" type="checkbox" defaultChecked />
            <span><strong>Hard block</strong><small>Requests overlapping this period cannot be submitted.</small></span>
          </label>
          <button className="btn primary" disabled={saving === "blocked"} type="submit">
            <ShieldAlert size={16}/>{saving === "blocked" ? "Saving…" : "Add blocked period"}
          </button>
        </form>

        <form className="card admin-mini-card" onSubmit={createCoverage}>
          <div className="card-title">
            <div>
              <h2>Coverage rules</h2>
              <p className="card-subtitle">Keep a minimum number of people available in a team or organisation.</p>
            </div>
            <AlertTriangle size={19}/>
          </div>

          <label>Rule name<input name="name" placeholder="Finance minimum cover" required /></label>
          <label>
            Scope
            <select className="native-field" name="department" defaultValue="">
              <option value="">Whole organisation</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum people available
            <input name="minimum" type="number" min="0" step="1" defaultValue="1" required />
          </label>
          <label>
            Behaviour
            <select className="native-field" name="severity" defaultValue="warning">
              <option value="warning">Warn approver</option>
              <option value="block">Block request</option>
            </select>
          </label>
          <button className="btn primary" disabled={saving === "coverage"} type="submit">
            <ShieldAlert size={16}/>{saving === "coverage" ? "Saving…" : "Add coverage rule"}
          </button>
        </form>
      </div>

      <div className="admin-two-col">
        <section className="card compact-list-card">
          <div className="card-title"><h2>Current blocked periods</h2></div>
          <div className="compact-rule-list">
            {blockedPeriods.map((period) => (
              <div className="compact-rule" key={period.id}>
                <div><strong>{period.name}</strong><span>{period.start_date} – {period.end_date}</span></div>
                <span className={period.hard_block ? "access-pill pending" : "access-pill neutral"}>
                  {period.hard_block ? "Blocked" : "Warning"}
                </span>
              </div>
            ))}
            {!blockedPeriods.length ? <p className="empty-compact">No blocked periods configured.</p> : null}
          </div>
        </section>

        <section className="card compact-list-card">
          <div className="card-title"><h2>Current coverage rules</h2></div>
          <div className="compact-rule-list">
            {coverageRules.map((rule) => (
              <div className="compact-rule" key={rule.id}>
                <div>
                  <strong>{rule.name}</strong>
                  <span>Minimum {rule.minimum_available} available</span>
                </div>
                <span className={rule.severity === "block" ? "access-pill pending" : "access-pill active"}>
                  {rule.severity === "block" ? "Block" : "Warn"}
                </span>
              </div>
            ))}
            {!coverageRules.length ? <p className="empty-compact">No coverage rules configured.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
