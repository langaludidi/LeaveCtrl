"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { updateRecoveryPassword } from "@/app/auth/actions";
import { validatePassword } from "@/lib/password-policy";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    const passwordPolicy = validatePassword(password);
    if (!passwordPolicy.valid) {
      setError(passwordPolicy.message);
      setSaving(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      setSaving(false);
      return;
    }

    try {
      const result = await updateRecoveryPassword(form);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    } catch {
      setError("We could not verify your password change. Please try again.");
      setSaving(false);
      return;
    }

    router.push("/login?message=Password%20updated.%20Sign%20in%20with%20your%20new%20password.");
    router.refresh();
  }

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel auth-panel-compact">
        <div className="auth-brand"><span>Leave</span>Ctrl</div>

        <div className="auth-copy">
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h1>Choose a new password</h1>
          <p>Use a password you do not use elsewhere. After updating it, sign in again.</p>
        </div>

        {error ? <div className="auth-alert error" role="alert">{error}</div> : null}

        <form className="auth-form" onSubmit={submit}>
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>

          <button className="btn primary auth-submit" type="submit" disabled={saving}>
            {saving ? "Updating password…" : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
