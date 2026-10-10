"use client";
import { roleCatalogue, type AccessRole } from "@/lib/role-access";

export function RoleOptions({ roles, onChange, privileged, disabled = false }: { roles: AccessRole[]; onChange: (roles: AccessRole[]) => void; privileged: boolean; disabled?: boolean }) {
  return <fieldset className="role-options" disabled={disabled}><legend>Access roles</legend>
    <p>Employee access is included. Add the responsibilities this person needs.</p>
    {roleCatalogue.filter((item) => privileged || ["employee", "manager"].includes(item.role)).map((item) => <label className="checkbox-row" key={item.role}>
      <input type="checkbox" name="accessRole" value={item.role} checked={roles.includes(item.role)} disabled={item.role === "employee"}
        onChange={(event) => onChange(event.target.checked ? [...roles, item.role] : roles.filter((role) => role !== item.role))} />
      <span><strong>{item.label}</strong><small>{item.description}</small></span>
    </label>)}
    {!privileged ? <p>Only an Organisation Admin can assign HR Admin, Organisation Admin, Reporter or Auditor.</p> : <p>Administrator roles give organisation-wide access. Assign them only to people who need those responsibilities.</p>}
  </fieldset>;
}
