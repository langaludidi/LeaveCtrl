"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ToilDecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function decide(decision: "approve" | "decline") {
    setWorking(decision);
    setError("");
    const { error: rpcError } = await createClient().rpc("decide_toil_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_note: undefined,
    });

    if (rpcError) {
      setError("Could not complete this TOIL decision.");
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
          aria-label="Approve TOIL request"
          onClick={() => decide("approve")}
        >
          <Check size={18}/>
        </button>
        <button
          className="reject"
          disabled={working !== null}
          aria-label="Decline TOIL request"
          onClick={() => decide("decline")}
        >
          <X size={18}/>
        </button>
      </div>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}

export function ToilWithdrawButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function withdraw() {
    if (!window.confirm("Withdraw this pending TOIL request? Reserved hours will be restored.")) return;
    setWorking(true);
    setError("");

    const { error: rpcError } = await createClient().rpc("withdraw_toil_request", {
      p_request_id: requestId,
    });

    if (rpcError) {
      setError("Could not withdraw this TOIL request.");
      setWorking(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="request-action-stack">
      <button className="request-text-action" onClick={withdraw} disabled={working} type="button">
        <X size={14}/>{working ? "Updating…" : "Withdraw"}
      </button>
      {error ? <small className="inline-error">{error}</small> : null}
    </div>
  );
}
