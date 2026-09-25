"use client";

import { FormEvent, useState } from "react";
import { Building2, Clock3, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Person = {
  id: string;
  name: string;
  departmentId: string | null;
  scheduleId: string | null;
};
type Department = { id: string; name: string };
type Schedule = { id: string; name: string };

export function OrganisationControls({
  people,
  departments,
  schedules,
}: {
  people: Person[];
  departments: Department[];
  schedules: Schedule[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState("");

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving("department");
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("create_department", {
      p_name: String(form.get("name") ?? "").trim(),
      p_code: String(form.get("code") ?? "").trim() || undefined,
    });
    setSaving("");
    if (rpcError) {
      setError("Department could not be created.");
      return;
    }
    event.currentTarget.reset();
    setNotice("Department created.");
    router.refresh();
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving("schedule");
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("create_work_schedule", {
      p_name: String(form.get("name") ?? "").trim(),
      p_monday_hours: Number(form.get("monday") ?? 0),
      p_tuesday_hours: Number(form.get("tuesday") ?? 0),
      p_wednesday_hours: Number(form.get("wednesday") ?? 0),
      p_thursday_hours: Number(form.get("thursday") ?? 0),
      p_friday_hours: Number(form.get("friday") ?? 0),
      p_saturday_hours: Number(form.get("saturday") ?? 0),
      p_sunday_hours: Number(form.get("sunday") ?? 0),
    });
    setSaving("");
    if (rpcError) {
      setError("Work schedule could not be created.");
      return;
    }
    event.currentTarget.reset();
    setNotice("Work schedule created.");
    router.refresh();
  }

  async function assign(
    personId: string,
    kind: "department" | "schedule",
    value: string
  ) {
    setError("");
    setNotice("");
    setSaving(`${kind}:${personId}`);
    const supabase = createClient();

    const result =
      kind === "department"
        ? await supabase.rpc("assign_employee_department", {
            p_employee_id: personId,
            p_department_id: value || null,
          } as never)
        : await supabase.rpc("assign_employee_schedule", {
            p_employee_id: personId,
            p_work_schedule_id: value,
            p_effective_from: new Date().toISOString().slice(0, 10),
          });

    setSaving("");
    if (result.error) {
      setError("Assignment could not be saved.");
      return;
    }
    setNotice("Employee assignment updated.");
    router.refresh();
  }

  return (
    <section className="admin-controls">
      {error ? <div className="auth-alert error">{error}</div> : null}
      {notice ? <div className="auth-alert success">{notice}</div> : null}

      <div className="admin-two-col">
        <form className="card admin-mini-card" onSubmit={createDepartment}>
          <div className="card-title">
            <div>
              <h2>Departments</h2>
              <p className="card-subtitle">Create the teams used for reporting and approvals.</p>
            </div>
            <Building2 size={19}/>
          </div>
          <label>
            Department name
            <input name="name" required />
          </label>
          <label>
            Code <span className="muted">(optional)</span>
            <input name="code" placeholder="FIN" />
          </label>
          <button className="btn primary" disabled={saving === "department"} type="submit">
            <Save size={16}/>
            {saving === "department" ? "Saving…" : "Add department"}
          </button>
        </form>

        <form className="card admin-mini-card" onSubmit={createSchedule}>
          <div className="card-title">
            <div>
              <h2>Work schedules</h2>
              <p className="card-subtitle">Scheduled hours determine which dates are chargeable.</p>
            </div>
            <Clock3 size={19}/>
          </div>
          <label>
            Schedule name
            <input name="name" placeholder="Standard Monday to Friday" required />
          </label>
          <div className="schedule-hours-grid">
            {[
              ["monday", "Mon", 8],
              ["tuesday", "Tue", 8],
              ["wednesday", "Wed", 8],
              ["thursday", "Thu", 8],
              ["friday", "Fri", 8],
              ["saturday", "Sat", 0],
              ["sunday", "Sun", 0],
            ].map(([name, label, defaultHours]) => (
              <label key={String(name)}>
                {label}
                <input
                  name={String(name)}
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  defaultValue={Number(defaultHours)}
                />
              </label>
            ))}
          </div>
          <button className="btn primary" disabled={saving === "schedule"} type="submit">
            <Save size={16}/>
            {saving === "schedule" ? "Saving…" : "Add schedule"}
          </button>
        </form>
      </div>

      <section className="card data-card">
        <div className="card-title">
          <h2>Employee assignments</h2>
          <span className="muted-count">{people.length} people</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Work schedule</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>
                    <select
                      className="inline-table-select"
                      value={person.departmentId ?? ""}
                      onChange={(event) =>
                        assign(person.id, "department", event.target.value)
                      }
                      disabled={saving === `department:${person.id}`}
                    >
                      <option value="">Not assigned</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="inline-table-select"
                      value={person.scheduleId ?? ""}
                      onChange={(event) =>
                        assign(person.id, "schedule", event.target.value)
                      }
                      disabled={saving === `schedule:${person.id}`}
                    >
                      <option value="" disabled>Select schedule</option>
                      {schedules.map((schedule) => (
                        <option key={schedule.id} value={schedule.id}>
                          {schedule.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
