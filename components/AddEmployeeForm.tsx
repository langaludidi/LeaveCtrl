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
  const [inviteDelivery, setInviteDelivery] = useState<"sent" | "fallback" | "">("");
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
    setInviteDelivery("");
    setCopied(false);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const openingBalance = String(form.get("openingAnnualBalance") ?? "").trim();
    const remuneration = String(form.get("remuneration") ?? "").trim();
    const payFrequency = String(form.get("payFrequency") ?? "monthly");
    const prepareAccess = form.get("prepareAccess") === "on";
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
      p_prepare_invitation: prepareAccess,
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
    let balanceMessage = "Current policy entitlements were provisioned automatically.";

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
          balanceMessage = `Opening annual leave balance confirmed at ${numericBalance} days.`;
        }
      }
    }

    if (remuneration && result.employee_id) {
      const numericRemuneration = Number(remuneration);
      const startDate = String(form.get("startDate") ?? "");
      if (!Number.isFinite(numericRemuneration) || numericRemuneration < 0) {
        setError("Employee added, but remuneration needs review.");
      } else {
        const { error: remunerationError } = await supabase.rpc("set_employee_remuneration", {
          p_employee_id: result.employee_id,
          p_effective_from: startDate,
          p_gross_amount: numericRemuneration,
          p_pay_frequency: payFrequency,
          p_daily_rate_override: undefined,
          p_reason: "Remuneration captured when employee was added",
        });
        if (remunerationError) {
          setError("Employee added, but remuneration needs review.");
        }
      }
    }

    if (prepareAccess && result.invitation_token && result.employee_id) {
      const invitationLink = `${window.location.origin}/join?token=${result.invitation_token}`;
      setLink(invitationLink);
      setInviteEmail(email);

      const { error: sendError } = await supabase.functions.invoke("send-employee-invite", {
        body: {
          employeeId: result.employee_id,
          email,
          token: result.invitation_token,
        },
      });

      if (sendError) {
        setInviteDelivery("fallback");
        setNotice(`Employee added. ${balanceMessage} Automatic email delivery was unavailable, so use the invitation action below.`);
      } else {
        setInviteDelivery("sent");
        setNotice(`Employee added. ${balanceMessage} The activation email was sent automatically.`);
      }
    } else {
      setNotice(`Employee added. ${balanceMessage} System access can be activated later.`);
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
            Add the person once. LeaveCtrl provisions policy and can send access automatically.
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

        <div className="auth-name-row">
          <label>
            Remuneration <span className="muted">(optional, confidential)</span>
            <input name="remuneration" type="number" min="0" step="0.01" placeholder="e.g. 35000" />
          </label>
          <label>
            Pay frequency
            <select className="native-field" name="payFrequency" defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </label>
        </div>

        <div className="confidential-note">
          Remuneration is stored separately from the employee profile and is not visible to employees or ordinary managers.
        </div>

        <label className="checkbox-row">
          <input name="prepareAccess" type="checkbox" defaultChecked />
          <span>
            <strong>Send system access now</strong>
            <small>LeaveCtrl will email an activation link. The employee record exists even before activation.</small>
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
            <strong>{inviteDelivery === "sent" ? "Activation email sent" : "Access invitation ready"}</strong>
            <span>
              {inviteDelivery === "sent"
                ? "No manual invitation step is required. Keep the link only as a recovery option."
                : "Automatic delivery did not complete. Send or copy the secure activation link below."}
            </span>
          </div>
          <div className="invite-result-actions">
            {inviteDelivery === "fallback" ? (
              <button className="btn primary" onClick={emailInvitation} type="button">
                <Mail size={16}/> Email invitation
              </button>
            ) : null}
            <button className="btn secondary" onClick={copyLink} type="button">
              {copied ? <Check size={16}/> : <Copy size={16}/>}
              {copied ? "Copied" : "Copy recovery link"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
