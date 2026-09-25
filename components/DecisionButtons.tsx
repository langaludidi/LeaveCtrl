"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function decide(decision: "approve" | "decline") {
    setWorking(decision);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("decide_leave_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_note: undefined,
    });

    if (rpcError) {
      setError("Could not complete this decision.");
      setWorking(null);
      return;
    }

    router.refresh();
  }

  return (
    <div className="decision-stack">
      <div className="approval-actions">
        <button
          className="approve"
          disabled={working !== null}
          aria-label="Approve request"
          onClick={() => decide("approve")}
        >
          <Check size={18}/>
        </button>
        <button
          className="reject"
          disabled={working !== null}
          aria-label="Decline request"
          onClick={() => decide("decline")}
        >
          <X size={18}/>
        </button>
      </div>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}
