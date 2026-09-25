"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function RequestLifecycleAction({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const withdrawable = status === "submitted" || status === "pending_approval";
  const cancellable = status === "approved";

  if (!withdrawable && !cancellable) return null;

  async function act() {
    const wording = withdrawable
      ? "Withdraw this pending leave request? The reserved balance will be restored."
      : "Request cancellation of this approved leave? Your manager will need to approve the cancellation.";

    if (!window.confirm(wording)) return;

    setWorking(true);
    setError("");

    const supabase = createClient();
    const result = withdrawable
      ? await supabase.rpc("withdraw_leave_request", {
          p_request_id: requestId,
          p_note: undefined,
        })
      : await supabase.rpc("request_leave_cancellation", {
          p_request_id: requestId,
          p_note: undefined,
        });

    if (result.error) {
      setError("Could not update this request.");
      setWorking(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="request-action-stack">
      <button
        className="request-text-action"
        type="button"
        onClick={act}
        disabled={working}
      >
        {withdrawable ? <X size={14}/> : <RotateCcw size={14}/>}
        {working ? "Updating…" : withdrawable ? "Withdraw" : "Cancel leave"}
      </button>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}
