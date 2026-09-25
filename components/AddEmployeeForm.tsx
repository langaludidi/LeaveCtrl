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
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setLink("");
    setCopied(false);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const openingBalance = String(form.get("openingAnnualBalance") ?? "").trim();
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

    if (openingBalance && result.employee_id) {
      const numericBalance = Number(openingBalance);
      if (!Number.isFinite(numericBalance) || numericBalance < 0) {
        setError("Employee added, but the opening annual leave balance was invalid.");
      } else {
        const { error: balanceError } = await supabase.rpc("set_employee_opening_balance", {
          p_employee_id: result.employee_id,
          p_leave_type_code: "ANNUAL",
          p_balance: numericBalance,
          p_reason: "Opening annual leave balance confirmed when employee was added",
        });

        if (balanceError) {
          setError("Employee added, but the opening annual leave balance needs review.");
        } else {
          setNotice(`Employee added with an opening annual leave balance of ${numericBalance} days.`);
        }
      }
    } else {
      setNotice("Employee added and current policy entitlements were provisioned automatically.");
    }

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
            Add the person once. LeaveCtrl provisions the current leave policy automatically.
          </p>
        </div>
        <span className="summary-icon"><UserPlus size={19}/></span>
      </div>

      {error ? <div className="auth-alert error">{error}</div> : null}
      {notice ? <div className="auth-alert success">{notice}</div> : null}

      <form onSubmit={submit} className="invite-form">
        <div className="auth-name-row">
          <label>First name<input name="firstName" required /></label>
          <label>Last name<input name="lastName" required /></label>
        </div>

        <div className="auth-name-row">
          <label>Email<input name="email" type="email" required /></label>
          <label>Start date<input name="startDate" type="date" required /></label>
        </div>

        <div className="auth-name-row">
          <label>
            Employee number <span className="muted">(optional)</span>
            <input name="employeeNumber" />
          </label>
          <label>
            Opening annual balance <span className="muted">(optional)</span>
            <input
              name="openingAnnualBalance"
              type="number"
              min="0"
              step="0.5"
              placeholder="Uses policy default"
            />
          </label>
        </div>

        <label className="checkbox-row">
          <input name="prepareAccess" type="checkbox" defaultChecked />
          <span>
            <strong>Prepare system access now</strong>
            <small>The employee record and leave position exist even before access is activated.</small>
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
            <strong>Access invitation ready</strong>
            <span>The employee is already part of the workforce; this only activates login access.</span>
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
