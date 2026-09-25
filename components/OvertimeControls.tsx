"use client";

import { FormEvent, useState } from "react";
import { Clock3, Coins, Save, TimerReset } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Person = { id: string; name: string };
type Settings = {
  default_treatment: string;
  default_multiplier: number;
  toil_expiry_days: number | null;
  liability_averaging_weeks: number;
  include_paid_overtime_in_liability: boolean;
};
type OvertimeEvent = {
  id: string;
  employee_id: string;
  work_date: string;
  hours: number;
  treatment: string;
  multiplier: number;
  paid_amount: number | null;
};
type ToilBalance = {
  employee_id: string;
  available_hours: number;
};

export function OvertimeControls({
  people,
  settings,
  recentEvents,
  toilBalances,
}: {
  people: Person[];
  settings: Settings;
  recentEvents: OvertimeEvent[];
  toilBalances: ToilBalance[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const peopleMap = new Map(people.map((person) => [person.id, person.name]));
  const toilMap = new Map(toilBalances.map((row) => [row.employee_id, Number(row.available_hours)]));

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("settings");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const { error: rpcError } = await createClient().rpc("update_overtime_settings", {
      p_default_treatment: String(form.get("defaultTreatment") ?? "paid"),
      p_default_multiplier: Number(form.get("defaultMultiplier") ?? 1.5),
      p_toil_expiry_days: null,
      p_liability_averaging_weeks: Number(form.get("averagingWeeks") ?? 13),
      p_include_paid_overtime_in_liability:
        form.get("includePaidOvertime") === "on",
    } as never);

    setSaving("");
    if (rpcError) {
      setError("Overtime settings could not be saved.");
      return;
    }
    setNotice("Overtime and liability settings updated.");
    router.refresh();
  }

  async function recordOvertime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("overtime");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const treatment = String(form.get("treatment") ?? "paid");
    const paidAmountText = String(form.get("paidAmount") ?? "").trim();

    const { error: rpcError } = await createClient().rpc("record_overtime_event", {
      p_employee_id: String(form.get("employee")),
      p_work_date: String(form.get("workDate")),
      p_hours: Number(form.get("hours") ?? 0),
      p_treatment: treatment,
      p_multiplier: Number(form.get("multiplier") ?? settings.default_multiplier),
      p_paid_amount:
        treatment === "paid" && paidAmountText ? Number(paidAmountText) : undefined,
      p_include_in_leave_liability:
        form.get("includeInLiability") === "on",
      p_note: String(form.get("note") ?? "").trim() || undefined,
    } as never);

    setSaving("");
    if (rpcError) {
      setError(
        rpcError.message === "paid_overtime_amount_required"
          ? "Enter the overtime amount paid for a paid-overtime entry."
          : "Overtime could not be recorded."
      );
      return;
    }

    event.currentTarget.reset();
    setNotice(
      treatment === "toil"
        ? "Overtime recorded and the TOIL credit was posted to the employee ledger."
        : "Paid overtime recorded and the variable earning was linked to liability history."
    );
    router.refresh();
  }

  async function recordVariableEarning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("earning");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const { error: rpcError } = await createClient().rpc("record_variable_earning", {
      p_employee_id: String(form.get("employee")),
      p_earning_date: String(form.get("earningDate")),
      p_category: String(form.get("category")),
      p_amount: Number(form.get("amount") ?? 0),
      p_include_in_leave_liability:
        form.get("includeInLiability") === "on",
      p_note: String(form.get("note") ?? "").trim() || undefined,
    } as never);

    setSaving("");
    if (rpcError) {
      setError("Variable earning could not be recorded.");
      return;
    }

    event.currentTarget.reset();
    setNotice("Variable earning recorded.");
    router.refresh();
  }

  async function adjustToil(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("toil");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const { error: rpcError } = await createClient().rpc("adjust_toil_balance", {
      p_employee_id: String(form.get("employee")),
      p_hours: Number(form.get("hours") ?? 0),
      p_reason: String(form.get("reason") ?? "").trim(),
    });

    setSaving("");
    if (rpcError) {
      setError("TOIL adjustment could not be recorded.");
      return;
    }

    event.currentTarget.reset();
    setNotice("TOIL ledger adjusted.");
    router.refresh();
  }

  return (
    <section className="overtime-section">
      {error ? <div className="auth-alert error">{error}</div> : null}
      {notice ? <div className="auth-alert success">{notice}</div> : null}

      <div className="admin-two-col">
        <form className="card admin-mini-card" onSubmit={saveSettings}>
          <div className="card-title">
            <div>
              <h2>Overtime & TOIL policy</h2>
              <p className="card-subtitle">
                Keep overtime separate from the employee&apos;s ordinary work schedule.
              </p>
            </div>
            <Clock3 size={19}/>
          </div>

          <label>
            Default treatment
            <select className="native-field" name="defaultTreatment" defaultValue={settings.default_treatment}>
              <option value="paid">Paid overtime</option>
              <option value="toil">Time off in lieu</option>
              <option value="choice">Choose per event</option>
            </select>
          </label>

          <label>
            Default multiplier
            <input name="defaultMultiplier" type="number" min="0.1" step="0.1" defaultValue={settings.default_multiplier} />
          </label>

          <div className="confidential-note">
            TOIL expiry is intentionally not enabled in V1. Credits remain available until used or adjusted, avoiding unverified expiry calculations.
          </div>

          <label>
            Liability averaging period
            <div className="compact-inline-field">
              <input name="averagingWeeks" type="number" min="1" max="52" defaultValue={settings.liability_averaging_weeks} />
              <span>weeks</span>
            </div>
          </label>

          <label className="checkbox-row">
            <input
              name="includePaidOvertime"
              type="checkbox"
              defaultChecked={settings.include_paid_overtime_in_liability}
            />
            <span>
              <strong>Include qualifying paid overtime in leave liability</strong>
              <small>Only overtime events individually marked as includable are averaged.</small>
            </span>
          </label>

          <button className="btn primary" disabled={saving === "settings"} type="submit">
            <Save size={16}/>{saving === "settings" ? "Saving…" : "Save overtime policy"}
          </button>
        </form>

        <form className="card admin-mini-card" onSubmit={recordOvertime}>
          <div className="card-title">
            <div>
              <h2>Record overtime</h2>
              <p className="card-subtitle">
                Paid overtime creates a variable earning; TOIL posts hours to a separate ledger.
              </p>
            </div>
            <TimerReset size={19}/>
          </div>

          <label>
            Employee
            <select className="native-field" name="employee" required>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>

          <div className="auth-name-row">
            <label>Work date<input name="workDate" type="date" required /></label>
            <label>Overtime hours<input name="hours" type="number" min="0.25" max="24" step="0.25" required /></label>
          </div>

          <div className="auth-name-row">
            <label>
              Treatment
              <select className="native-field" name="treatment" defaultValue={settings.default_treatment === "toil" ? "toil" : "paid"}>
                <option value="paid">Paid</option>
                <option value="toil">TOIL</option>
              </select>
            </label>
            <label>
              Multiplier
              <input name="multiplier" type="number" min="0.1" step="0.1" defaultValue={settings.default_multiplier} required />
            </label>
          </div>

          <label>
            Amount paid <span className="muted">(for paid overtime)</span>
            <input name="paidAmount" type="number" min="0" step="0.01" />
          </label>

          <label>Note <span className="muted">(optional)</span><input name="note" /></label>

          <label className="checkbox-row">
            <input name="includeInLiability" type="checkbox" defaultChecked />
            <span>
              <strong>Include in leave-pay liability averaging</strong>
              <small>Can be unticked for an earning category that should not form part of the configured liability basis.</small>
            </span>
          </label>

          <button className="btn primary" disabled={saving === "overtime"} type="submit">
            <TimerReset size={16}/>{saving === "overtime" ? "Recording…" : "Record overtime"}
          </button>
        </form>
      </div>

      <div className="admin-two-col">
        <form className="card admin-mini-card" onSubmit={recordVariableEarning}>
          <div className="card-title">
            <div>
              <h2>Other variable earnings</h2>
              <p className="card-subtitle">Capture allowances, commission, bonuses or shift allowances separately from base remuneration.</p>
            </div>
            <Coins size={19}/>
          </div>

          <label>
            Employee
            <select className="native-field" name="employee" required>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>

          <div className="auth-name-row">
            <label>Earning date<input name="earningDate" type="date" required /></label>
            <label>Amount<input name="amount" type="number" min="0" step="0.01" required /></label>
          </div>

          <label>
            Category
            <select className="native-field" name="category" defaultValue="allowance">
              <option value="allowance">Allowance</option>
              <option value="shift_allowance">Shift allowance</option>
              <option value="commission">Commission</option>
              <option value="bonus">Bonus</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>Note <span className="muted">(optional)</span><input name="note" /></label>

          <label className="checkbox-row">
            <input name="includeInLiability" type="checkbox" defaultChecked />
            <span>
              <strong>Include in leave-pay liability averaging</strong>
              <small>The liability report will show the resulting variable daily component.</small>
            </span>
          </label>

          <button className="btn primary" disabled={saving === "earning"} type="submit">
            <Coins size={16}/>{saving === "earning" ? "Saving…" : "Record earning"}
          </button>
        </form>

        <form className="card admin-mini-card" onSubmit={adjustToil}>
          <div className="card-title">
            <div>
              <h2>TOIL adjustment</h2>
              <p className="card-subtitle">Use only for corrections or opening TOIL balances; normal credits come from overtime events.</p>
            </div>
            <TimerReset size={19}/>
          </div>

          <label>
            Employee
            <select className="native-field" name="employee" required>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>

          <label>
            Hours adjustment
            <input name="hours" type="number" step="0.25" placeholder="Use a negative number to reduce" required />
          </label>

          <label>
            Reason
            <input name="reason" required />
          </label>

          <button className="btn secondary" disabled={saving === "toil"} type="submit">
            <TimerReset size={16}/>{saving === "toil" ? "Saving…" : "Adjust TOIL"}
          </button>

          <div className="toil-balance-list">
            {people.map((person) => (
              <div key={person.id}>
                <span>{person.name}</span>
                <strong>{(toilMap.get(person.id) ?? 0).toFixed(2)} h</strong>
              </div>
            ))}
          </div>
        </form>
      </div>

      <section className="card data-card overtime-history-card">
        <div className="card-title">
          <h2>Recent overtime</h2>
          <span className="muted-count">{recentEvents.length} recent entries</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Hours</th>
                <th>Treatment</th>
                <th>Multiplier</th>
                <th>Paid amount</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((entry) => (
                <tr key={entry.id}>
                  <td>{peopleMap.get(entry.employee_id) ?? "Employee"}</td>
                  <td>{entry.work_date}</td>
                  <td>{Number(entry.hours).toFixed(2)}</td>
                  <td className="capitalize-cell">{entry.treatment}</td>
                  <td>{Number(entry.multiplier).toFixed(2)}×</td>
                  <td>{entry.paid_amount === null ? "—" : Number(entry.paid_amount).toFixed(2)}</td>
                </tr>
              ))}
              {!recentEvents.length ? (
                <tr><td colSpan={6} className="empty-table-cell">No overtime recorded yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
