"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DecisionButtons({
  requestId,
  kind = "leave",
  showNote = false,
}: {
  requestId: string;
  kind?: "leave" | "cancellation";
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

    const supabase = createClient();
    const result = kind === "cancellation"
      ? await supabase.rpc("decide_leave_cancellation", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: trimmedNote || undefined,
        })
      : await supabase.rpc("decide_leave_request", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: trimmedNote || undefined,
        });

    if (result.error) {
      setError("Could not complete this decision.");
      setWorking(null);
      return;
    }

    router.refresh();
  }

  const noun = kind === "cancellation" ? "cancellation" : "request";
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
          aria-label={`Approve ${noun}`}
          onClick={() => decide("approve")}
          type="button"
        >
          <Check size={18}/>
          {expanded ? <span>Approve</span> : null}
        </button>
        <button
          className="reject"
          disabled={working !== null}
          aria-label={`Decline ${noun}`}
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
