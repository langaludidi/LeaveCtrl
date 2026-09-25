"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc("bootstrap_organisation", {
      p_name: String(form.get("organisation") ?? "").trim(),
      p_first_name: String(form.get("firstName") ?? "").trim(),
      p_last_name: String(form.get("lastName") ?? "").trim(),
      p_email: String(form.get("email") ?? "").trim().toLowerCase(),
      p_start_date: String(form.get("startDate") ?? ""),
    });

    if (rpcError) {
      setError("We could not create the organisation. Please check the details and try again.");
      setSaving(false);
      return;
    }

    router.push("/setup");
    router.refresh();
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <div className="auth-brand"><span>Leave</span>Ctrl</div>
        <div className="onboarding-progress">
          <span className="active">1</span><i /><span>2</span><i /><span>3</span>
        </div>

        <div className="onboarding-copy">
          <p className="eyebrow">ORGANISATION SETUP</p>
          <h1>Start with the basics</h1>
          <p>
            We only need enough information to establish your organisation and administrator profile.
            The rest can be configured progressively.
          </p>
        </div>

        {error && <div className="auth-alert error">{error}</div>}

        <form onSubmit={submit} className="onboarding-form">
          <label>
            Organisation name
            <input name="organisation" placeholder="e.g. Acme South Africa" required />
          </label>

          <div className="auth-name-row">
            <label>First name<input name="firstName" required /></label>
            <label>Last name<input name="lastName" required /></label>
          </div>

          <label>Work email<input name="email" type="email" required /></label>
          <label>Your employment start date<input name="startDate" type="date" required /></label>

          <div className="onboarding-defaults">
            <strong>South Africa defaults will be prepared for review</strong>
            <span>Country: South Africa · Time zone: Africa/Johannesburg · Currency: ZAR</span>
          </div>

          <button className="btn primary onboarding-submit" type="submit" disabled={saving}>
            {saving ? "Creating organisation…" : "Create organisation and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
