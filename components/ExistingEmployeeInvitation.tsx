"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RoleOptions } from "@/components/RoleOptions";
import { type AccessRole } from "@/lib/role-access";

type Person = { id: string; name: string; email: string; firstName: string; lastName: string; startDate: string };
export function ExistingEmployeeInvitation({ people, privileged }: { people: Person[]; privileged: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [roles, setRoles] = useState<AccessRole[]>(["employee"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const person = people.find((item) => item.id === selected);
    if (!person || saving) return;
    setSaving(true); setError(""); setMessage(""); setLink("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("add_employee_with_access_roles", { p_existing_employee_id: person.id,
      p_email: person.email, p_first_name: person.firstName, p_last_name: person.lastName, p_start_date: person.startDate, p_roles: roles });
    const result = data as { invitation_token?: string } | null;
    if (error || !result?.invitation_token) { setError("Invitation could not be prepared. Refresh to check current access and pending invitations."); setSaving(false); return; }
    const invitationLink = `${window.location.origin}/join?token=${encodeURIComponent(result.invitation_token)}`;
    const { error: sendError } = await supabase.functions.invoke("send-employee-invite", { body: { employeeId: person.id, email: person.email, token: result.invitation_token } });
    setMessage(sendError ? `Invitation prepared for ${person.email}. Email delivery was unavailable; copy the secure link and send it to this person.` : `Activation invitation sent to ${person.email}.`);
    setLink(invitationLink); setSaving(false); setSelected(""); router.refresh();
  }
  return <section className="card role-access-summary" id="invite-existing"><h2>Invite an existing employee</h2>
    <p>Send access to an employee whose invitation is missing or expired. Choose their roles before sending. Use Manage roles &amp; access to edit a pending invitation.</p>
    {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
    {message ? <p className="auth-alert success" role="status">{message}</p> : null}
    {people.length ? <form className="invite-form" onSubmit={submit}><label>Employee<select className="native-field" required value={selected} disabled={saving} onChange={(event) => { setSelected(event.target.value); setRoles(["employee"]); }}>
      <option value="">Choose an employee</option>{people.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>
      {selected ? <RoleOptions roles={roles} onChange={setRoles} privileged={privileged} disabled={saving} /> : null}
      <button className="btn primary" disabled={saving || !selected} type="submit">{saving ? "Sending invitation…" : "Send activation invitation"}</button>
    </form> : <p>Every active employee already has access or a pending invitation.</p>}
    {link ? <button type="button" className="btn secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Secure invitation link copied. Share it only with the invited person."); } catch { setError("Your browser could not copy the link. Try again using a secure connection."); } }}>Copy secure invitation link</button> : null}
  </section>;
}
