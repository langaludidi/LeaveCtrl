"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function OrganisationOnboardingCompleteButton({
  ready,
}: {
  ready: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function complete() {
    if (!ready) return;

    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "complete_organisation_onboarding"
    );

    if (rpcError) {
      setError(
        "LeaveCtrl could not complete organisation setup. Confirm the core readiness checks and try again."
      );
      setSaving(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="welcome-complete-action">
      {error ? <div className="auth-alert error" role="alert">{error}</div> : null}
      <button
        type="button"
        className="btn primary"
        onClick={complete}
        disabled={!ready || saving}
      >
        {saving
          ? "Completing setup…"
          : <><CheckCircle2 size={17} aria-hidden="true" /> Complete initial setup</>}
      </button>
    </div>
  );
}
