"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function WelcomeCompleteButton({ destination = { href: "/my-leave", label: "View my leave" } }: { destination?: { href: string; label: string } }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function continueToMyLeave() {
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: completeError } = await supabase.rpc("complete_employee_welcome");

    if (completeError) {
      setError("We could not complete your welcome setup. Please try again.");
      setSaving(false);
      return;
    }

    router.replace(destination.href);
    router.refresh();
  }

  return (
    <div className="welcome-complete-action">
      {error ? <div className="auth-alert error" role="alert">{error}</div> : null}
      <button
        type="button"
        className="btn primary welcome-continue"
        onClick={continueToMyLeave}
        disabled={saving}
      >
        {saving ? "Opening your workspace…" : <><CheckCircle2 size={17} aria-hidden="true" /> {destination.label}</>}
      </button>
    </div>
  );
}
