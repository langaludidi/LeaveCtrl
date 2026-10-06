"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function BillingOperatorControls() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <section className="card billing-choice">
      <h2>Reconcile a payment or subscription</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await fetch("/api/billing/operations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ value }),
            });
            const v = await r.json();
            setMessage(
              r.ok
                ? "Provider record reconciled successfully."
                : `Reconciliation needs review: ${v.error ?? "unavailable"}`,
            );
            if (r.ok) router.refresh();
          } catch {
            setMessage(
              "Provider unavailable. No access was manually allocated.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Transaction reference or subscription code
          <input
            value={value}
            maxLength={100}
            required
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "Checking provider…" : "Verify & reconcile"}
        </button>
      </form>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
