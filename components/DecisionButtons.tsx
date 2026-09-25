"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DecisionButtons({
  requestId,
  kind = "leave",
}: {
  requestId: string;
  kind?: "leave" | "cancellation";
}) {
  const router = useRouter();
  const [working, setWorking] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function decide(decision: "approve" | "decline") {
    setWorking(decision);
    setError("");

    const supabase = createClient();
    const result = kind === "cancellation"
      ? await supabase.rpc("decide_leave_cancellation", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: undefined,
        })
      : await supabase.rpc("decide_leave_request", {
          p_request_id: requestId,
          p_decision: decision,
          p_note: undefined,
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
    <div className="decision-stack">
      <div className="approval-actions">
        <button
          className="approve"
          disabled={working !== null}
          aria-label={`Approve ${noun}`}
          onClick={() => decide("approve")}
        >
          <Check size={18}/>
        </button>
        <button
          className="reject"
          disabled={working !== null}
          aria-label={`Decline ${noun}`}
          onClick={() => decide("decline")}
        >
          <X size={18}/>
        </button>
      </div>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}
