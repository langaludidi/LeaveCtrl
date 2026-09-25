"use client";

import { FormEvent, useState } from "react";
import { Check, Copy, Mail, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AddEmployeeResult = {
  employee_id?: string;
  invitation_token?: string | null;
};

export function AddEmployeeForm() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setLink("");
    setCopied(false);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const supabase = createClient();

    const { data, error: rpcError } = await supabase.rpc("add_employee_record", {
      p_email: email,
      p_first_name: String(form.get("firstName") ?? "").trim(),
      p_last_name: String(form.get("lastName") ?? "").trim(),
      p_start_date: String(form.get("startDate") ?? ""),
      p_employee_number: String(form.get("employeeNumber") ?? "").trim() || undefined,
      p_department_id: undefined,
      p_manager_employee_id: undefined,
      p_work_schedule_id: undefined,
      p_grant_manager_role: form.get("managerRole") === "on",
      p_prepare_invitation: form.get("prepareAccess") === "on",
    });

    if (rpcError || !data) {
      setError(
        rpcError?.message === "employee_email_already_exists"
          ? "An employee with this email already exists."
          : "We could not add this employee. Check the details and try again."
      );
      setSaving(false);
      return;
    }

    const result = data as AddEmployeeResult;
    if (result.invitation_token) {
      setLink(`${window.location.origin}/join?token=${result.invitation_token}`);
      setInviteEmail(email);
    }

    setSaving(false);
    event.currentTarget.reset();
    router.refresh();
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  function emailInvitation() {
    if (!link || !inviteEmail) return;
    const subject = encodeURIComponent("Your LeaveCtrl access");
    const body = encodeURIComponent(
      `You have been added to LeaveCtrl. Open this secure link to activate your account:\n\n${link}\n\nThis link expires in seven days.`
    );
    window.location.href = `mailto:${encodeURIComponent(inviteEmail)}?subject=${subject}&body=${body}`;
  }

  return (
    <section className="card invite-card">
      <div className="card-title">
        <div>
          <h2>Add employee</h2>
          <p className="card-subtitle">
            Add the person to your workforce first. System access can be prepared now or later.
          </p>
        </div>
        <span className="summary-icon"><UserPlus size={19}/></span>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}

      <form onSubmit={submit} className="invite-form">
        <div className="auth-name-row">
          <label>First name<input name="firstName" required /></label>
          <label>Last name<input name="lastName" required /></label>
        </div>

        <div className="auth-name-row">
          <label>Email<input name="email" type="email" required /></label>
          <label>Start date<input name="startDate" type="date" required /></label>
        </div>

        <label>
          Employee number <span className="muted">(optional)</span>
          <input name="employeeNumber" />
        </label>

        <label className="checkbox-row">
          <input name="prepareAccess" type="checkbox" defaultChecked />
          <span>
            <strong>Prepare system access now</strong>
            <small>The employee record is created immediately, whether or not access is prepared.</small>
          </span>
        </label>

        <label className="checkbox-row">
          <input name="managerRole" type="checkbox" />
          <span>
            <strong>Grant manager role on activation</strong>
            <small>Managers can approve only for employees assigned to them.</small>
          </span>
        </label>

        <button className="btn primary" type="submit" disabled={saving}>
          <UserPlus size={17}/>{saving ? "Adding employee…" : "Add employee"}
        </button>
      </form>

      {link ? (
        <div className="invite-result invite-result-stacked">
          <div>
            <strong>Employee added. Access is ready.</strong>
            <span>The workforce record already exists; this link only activates the user's account.</span>
          </div>
          <div className="invite-result-actions">
            <button className="btn primary" onClick={emailInvitation} type="button">
              <Mail size={16}/> Email invitation
            </button>
            <button className="btn secondary" onClick={copyLink} type="button">
              {copied ? <Check size={16}/> : <Copy size={16}/>}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
