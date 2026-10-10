"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RoleBadges } from "@/components/RoleBadges";
import { RoleOptions } from "@/components/RoleOptions";
import { roleLabels, type AccessRole } from "@/lib/role-access";

type Person = { id: string; name: string; roles: AccessRole[]; pending: boolean };
export function EmployeeRoleManagement({ people }: { people: Person[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [roles, setRoles] = useState<AccessRole[]>(["employee"]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const person = people.find((item) => item.id === selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!person || saving) return;
    setSaving(true); setError(""); setMessage("");
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    const { error } = await createClient().rpc("set_employee_access_roles", {
      p_employee_id: person.id, p_roles: roles, p_expected_roles: person.roles, p_reason: reason,
    });
    if (error) {
      const messages: Record<string, string> = {
        roles_changed_refresh_required: "Access changed since this page loaded. Refresh and review the current roles before saving.",
        self_role_change_not_allowed: "Ask another Organisation Admin to change your own roles.",
        last_organisation_admin_required: "Keep at least one active Organisation Admin.",
        reassign_direct_reports_before_removing_manager: "Reassign this person's direct reports before removing Manager access.",
        active_invitation_required: "The invitation has expired. Prepare a new invitation before assigning roles.",
      };
      setError(messages[error.message] ?? "Access could not be updated. Refresh and check your administrator permissions.");
    } else {
      setMessage(`${person.name}: ${roleLabels(roles)} ${person.pending ? "will apply when the invitation is accepted" : "is now assigned"}.`);
      setSelected(""); router.refresh();
    }
    setSaving(false);
  }
  return <section className="card role-access-summary" id="manage-access"><h2>Manage roles & access</h2>
    <p>Organisation Admins can update an activated employee or a pending invitation. Changes are recorded in the audit log. Your own roles must be changed by another Organisation Admin.</p>
    {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
    {message ? <p className="auth-alert success" role="status">{message}</p> : null}
    <form className="invite-form" onSubmit={submit}>
      <label>Person<select className="native-field" value={selected} disabled={saving} required onChange={(event) => {
        const next = people.find((item) => item.id === event.target.value);
        setSelected(event.target.value); setRoles(next?.roles ?? ["employee"]); setError(""); setMessage("");
      }}><option value="">Choose a person</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.pending ? "Invitation pending" : "Active access"}</option>)}</select></label>
      {person ? <><p>Current roles: <RoleBadges roles={person.roles} /></p>
        <RoleOptions roles={roles} onChange={setRoles} privileged disabled={saving} />
        <label>Reason for this change<input name="reason" required maxLength={500} disabled={saving} /></label>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "Saving access…" : "Save access roles"}</button></> : null}
    </form>
    {!people.length ? <p>Add and invite an employee to manage their roles here.</p> : null}
  </section>;
}
