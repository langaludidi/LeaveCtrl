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

  async function decide(decision: "approve" | "decline") {
    setWorking(decision);
    setError("");

    const supabase = createClient();
    const result = kind === "cancellation"
      ? await supabase.rpc("decide_leave_cancellation", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: note.trim() || undefined,
        })
      : await supabase.rpc("decide_leave_request", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: note.trim() || undefined,
        });

    if (result.error) {
      setError("Could not complete this decision.");
      setWorking(null);
      return;
    }

    router.refresh();
  }

  const noun = kind === "cancellation" ? "cancellation" : "request";

  return (
    <div className={showNote ? "decision-stack expanded-decision" : "decision-stack"}>
      {showNote ? (
        <label className="decision-note-field">
          Decision note <span>(optional)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add context for the employee and audit trail"
            maxLength={600}
          />
        </label>
      ) : null}
      <div className="approval-actions">
        <button
          className="approve"
          disabled={working !== null}
          aria-label={`Approve ${noun}`}
          onClick={() => decide("approve")}
        >
          <Check size={18}/>
          {showNote ? <span>Approve</span> : null}
        </button>
        <button
          className="reject"
          disabled={working !== null}
          aria-label={`Decline ${noun}`}
          onClick={() => decide("decline")}
        >
          <X size={18}/>
          {showNote ? <span>Decline</span> : null}
        </button>
      </div>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}
