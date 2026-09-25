"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Person = {
  id: string;
  name: string;
  managerEmployeeId: string | null;
};

export function ManagerAssignment({ people }: { people: Person[] }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(people[0]?.id ?? "");
  const current = people.find((person) => person.id === employeeId);
  const [managerId, setManagerId] = useState(current?.managerEmployeeId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function changeEmployee(id: string) {
    setEmployeeId(id);
    setManagerId(people.find((person) => person.id === id)?.managerEmployeeId ?? "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId || !managerId) return;

    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("assign_employee_manager", {
      p_employee_id: employeeId,
      p_manager_employee_id: managerId,
    });

    if (rpcError) {
      setError(
        rpcError.message === "employee_cannot_manage_self"
          ? "An employee cannot be assigned as their own manager."
          : "We could not update this reporting line."
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  if (people.length < 2) return null;

  return (
    <section className="card manager-card">
      <div className="card-title">
        <div>
          <h2>Manager assignment</h2>
          <p className="card-subtitle">Reporting lines control who can see and approve a direct report's requests.</p>
        </div>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <form className="manager-form" onSubmit={submit}>
        <label>
          Employee
          <select className="native-field" value={employeeId} onChange={(event) => changeEmployee(event.target.value)}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label>
          Manager
          <select className="native-field" value={managerId} onChange={(event) => setManagerId(event.target.value)} required>
            <option value="">Choose manager</option>
            {people.filter((person) => person.id !== employeeId).map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={saving || !managerId} type="submit">
          {saving ? "Saving…" : "Save manager"}
        </button>
      </form>
    </section>
  );
}
