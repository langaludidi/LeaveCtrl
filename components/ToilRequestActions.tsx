"use client";

import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ToilDecisionButtons({
  requestId,
  kind = "request",
  showNote = false,
}: {
  requestId: string;
  kind?: "request" | "cancellation";
  showNote?: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [declineMode, setDeclineMode] = useState(false);

  async function decide(decision: "approve" | "decline") {
    const trimmedNote = note.trim();
    if (decision === "decline" && !trimmedNote) {
      setDeclineMode(true);
      setError("Add a short reason before declining so the employee and audit trail have context.");
      return;
    }

    setWorking(decision);
    setError("");

    const result = kind === "cancellation"
      ? await createClient().rpc("decide_toil_cancellation", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: trimmedNote || undefined,
        })
      : await createClient().rpc("decide_toil_request", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: trimmedNote || undefined,
        });

    if (result.error) {
      setError(
        kind === "cancellation"
          ? "Could not complete this TOIL cancellation decision."
          : "Could not complete this TOIL decision."
      );
      setWorking(null);
      return;
    }

    router.refresh();
  }

  const expanded = showNote || declineMode;

  return (
    <div className={expanded ? "decision-stack expanded-decision" : "decision-stack"}>
      {expanded ? (
        <label className="decision-note-field">
          Decision note <span>(required when declining)</span>
          <textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (error.startsWith("Add a short reason")) setError("");
            }}
            placeholder="Add context for the employee and audit trail"
            maxLength={600}
            autoFocus={declineMode && !showNote}
          />
        </label>
      ) : null}
      <div className="approval-actions">
        <button
          className="approve"
          disabled={working !== null}
          aria-label={kind === "cancellation" ? "Approve TOIL cancellation" : "Approve TOIL request"}
          onClick={() => decide("approve")}
          type="button"
        >
          <Check size={18}/>
          {expanded ? <span>Approve</span> : null}
        </button>
        <button
          className="reject"
          disabled={working !== null}
          aria-label={kind === "cancellation" ? "Decline TOIL cancellation" : "Decline TOIL request"}
          onClick={() => decide("decline")}
          type="button"
        >
          <X size={18}/>
          {expanded ? <span>Decline</span> : null}
        </button>
      </div>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}

export function ToilLifecycleButton({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const withdrawable = status === "pending_approval";
  const cancellable = status === "approved";

  if (!withdrawable && !cancellable) return null;

  async function act() {
    const message = withdrawable
      ? "Withdraw this pending TOIL request? Reserved hours will be restored."
      : "Request cancellation of this approved TOIL? Your manager will need to approve the cancellation.";

    if (!window.confirm(message)) return;

    setWorking(true);
    setError("");

    const result = withdrawable
      ? await createClient().rpc("withdraw_toil_request", {
          p_request_id: requestId,
        })
      : await createClient().rpc("request_toil_cancellation", {
          p_request_id: requestId,
          p_note: undefined,
        });

    if (result.error) {
      setError(
        withdrawable
          ? "Could not withdraw this TOIL request."
          : "Could not request TOIL cancellation."
      );
      setWorking(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="request-action-stack">
      <button className="request-text-action" onClick={act} disabled={working} type="button">
        {withdrawable ? <X size={14}/> : <RotateCcw size={14}/>}
        {working ? "Updating…" : withdrawable ? "Withdraw" : "Cancel TOIL"}
      </button>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}
