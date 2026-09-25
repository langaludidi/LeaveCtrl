"use client";

import { FormEvent, useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Person = { id: string; name: string };

type ExitResult = {
  leave_requests_closed?: number;
  toil_requests_closed?: number;
  access_deactivated?: boolean;
};

export function EmployeeExitControl({ people }: { people: Person[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!people.length) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employee") ?? "");
    const endDate = String(form.get("endDate") ?? "");
    const reason = String(form.get("reason") ?? "").trim();

    const person = people.find((item) => item.id === employeeId);
    if (!window.confirm(
      `Exit ${person?.name ?? "this employee"} from LeaveCtrl? Their organisation access will be disabled and future leave/TOIL will be closed. Historical records will be preserved.`
    )) {
      return;
    }

    setSaving(true);

    const { data, error: rpcError } = await createClient().rpc("exit_employee", {
      p_employee_id: employeeId,
      p_end_date: endDate,
      p_reason: reason,
    });

    setSaving(false);

    if (rpcError) {
      const messages: Record<string, string> = {
        future_exit_not_supported_v1:
          "V1 offboarding is immediate or historical. Complete the exit on or after the employee's final working day.",
        active_absence_crosses_exit_date:
          "A leave request crosses the proposed exit date. Resolve that request before completing the exit.",
        cannot_exit_own_profile:
          "You cannot exit your own LeaveCtrl profile.",
        last_org_admin_cannot_exit:
          "This employee is the last active organisation administrator. Assign another organisation administrator first.",
        employee_not_active:
          "This employee is no longer active.",
        exit_before_start_date:
          "The exit date cannot be earlier than the employment start date.",
      };
      setError(messages[rpcError.message] ?? "The employee exit could not be completed.");
      return;
    }

    const result = (data ?? {}) as ExitResult;
    setNotice(
      `Employee exited. Access ${result.access_deactivated ? "was disabled" : "was not yet activated"}; ${result.leave_requests_closed ?? 0} future leave request(s) and ${result.toil_requests_closed ?? 0} future TOIL request(s) were closed.`
    );
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <section className="card employee-exit-card">
      <div className="card-title">
        <div>
          <h2>Employee exit</h2>
          <p className="card-subtitle">
            Close employment access without deleting balances, requests, approvals or audit history.
          </p>
        </div>
        <ShieldAlert size={19}/>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}
      {notice ? <div className="auth-alert success">{notice}</div> : null}

      <form className="employee-exit-form" onSubmit={submit}>
        <label>
          Employee
          <select className="native-field" name="employee" required>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </label>

        <label>
          Final working day
          <input className="native-field" name="endDate" type="date" required />
        </label>

        <label className="wide-field">
          Exit reason
          <input
            className="native-field"
            name="reason"
            placeholder="Resignation, contract ended, retirement…"
            required
          />
        </label>

        <button className="btn danger-btn" type="submit" disabled={saving}>
          <LogOut size={16}/>{saving ? "Completing exit…" : "Exit employee"}
        </button>
      </form>

      <p className="employee-exit-note">
        Future-dated exits are not automated in V1. Complete this action on or after the final working day.
        A leave request that crosses the final working day must be resolved first.
      </p>
    </section>
  );
}
