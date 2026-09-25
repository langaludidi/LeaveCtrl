"use client";

import { FormEvent, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function InviteEmployeeForm() {
  const [link, setLink] = useState("");
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
    const supabase = createClient();

    const { data, error: rpcError } = await supabase.rpc("create_employee_invitation", {
      p_email: String(form.get("email") ?? "").trim().toLowerCase(),
      p_first_name: String(form.get("firstName") ?? "").trim(),
      p_last_name: String(form.get("lastName") ?? "").trim(),
      p_start_date: String(form.get("startDate") ?? ""),
      p_employee_number: String(form.get("employeeNumber") ?? "").trim() || undefined,
      p_department_id: undefined,
      p_manager_employee_id: undefined,
      p_work_schedule_id: undefined,
      p_grant_manager_role: form.get("managerRole") === "on",
    });

    if (rpcError || !data) {
      setError(
        rpcError?.message === "employee_email_already_exists"
          ? "An employee with this email already exists."
          : "We could not create the invitation. Check the details and try again."
      );
      setSaving(false);
      return;
    }

    setLink(`${window.location.origin}/join?token=${data}`);
    setSaving(false);
    event.currentTarget.reset();
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <section className="card invite-card">
      <div className="card-title">
        <div>
          <h2>Invite employee</h2>
          <p className="card-subtitle">Create a secure seven-day invitation link. Email delivery will use the communication engine later.</p>
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
        <label>Employee number <span className="muted">(optional)</span><input name="employeeNumber" /></label>
        <label className="checkbox-row">
          <input name="managerRole" type="checkbox" />
          <span>
            <strong>Grant manager role</strong>
            <small>This person can approve leave only for employees assigned to them.</small>
          </span>
        </label>

        <button className="btn primary" type="submit" disabled={saving}>
          <UserPlus size={17}/>{saving ? "Creating invitation…" : "Create invitation"}
        </button>
      </form>

      {link ? (
        <div className="invite-result">
          <div>
            <strong>Invitation ready</strong>
            <span>{link}</span>
          </div>
          <button className="btn secondary" onClick={copyLink} type="button">
            {copied ? <Check size={16}/> : <Copy size={16}/>}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
