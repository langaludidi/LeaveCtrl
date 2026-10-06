"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { BillingSummary } from "@/lib/billing/catalog";
export function BillingBanner() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  useEffect(() => {
    let current = true;
    fetch("/api/billing/status", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (current) setSummary(v);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  if (!summary || (summary.state !== "read_only" && summary.state !== "trial"))
    return null;
  return (
    <aside
      className={`billing-banner ${summary.can_write ? "" : "billing-banner-expired"}`}
      aria-label="Subscription status"
    >
      <div>
        <strong>
          {summary.state === "trial"
            ? "Your 30-day trial"
            : "Your subscription needs renewal"}
        </strong>
        <p>
          {summary.can_write
            ? `Trial ends ${new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" }).format(new Date(summary.trial_until))}. ${summary.active_employees} of ${summary.employee_limit} active employees.`
            : "Records remain available. New leave transactions and administration changes require an active subscription."}
        </p>
      </div>
      {summary.can_manage ? (
        <Link className="btn secondary" href="/billing">
          Manage subscription
        </Link>
      ) : (
        <span>Contact your organisation administrator.</span>
      )}
    </aside>
  );
}
