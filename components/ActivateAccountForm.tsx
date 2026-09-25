"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ActivateAccountForm({ token }: { token: string }) {
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

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      setSaving(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      setSaving(false);
      return;
    }

    const supabase = createClient();

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setError("We could not set your password. Please try again.");
      setSaving(false);
      return;
    }

    const { error: claimError } = await supabase.rpc("claim_employee_invitation", {
      p_token: token,
    });

    if (claimError) {
      setError(
        claimError.message === "invitation_email_mismatch"
          ? "This invitation belongs to a different email address."
          : claimError.message === "invitation_invalid_or_expired"
            ? "This invitation is invalid or has expired."
            : claimError.message === "account_already_linked_to_organisation"
              ? "This login is already linked to another active LeaveCtrl organisation."
              : "We could not activate this LeaveCtrl profile."
      );
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="activation-form" onSubmit={submit}>
      {error ? <div className="auth-alert error">{error}</div> : null}

      <label>
        Create password
        <input
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
        />
      </label>

      <label>
        Confirm password
        <input
          name="confirmPassword"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
        />
      </label>

      <button className="btn primary join-submit" type="submit" disabled={saving}>
        {saving ? "Activating…" : <><CheckCircle2 size={17}/> Activate LeaveCtrl</>}
      </button>
    </form>
  );
}
