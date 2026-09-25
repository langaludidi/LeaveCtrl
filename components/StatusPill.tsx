function label(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    pending_approval: "Pending",
    approved: "Approved",
    declined: "Declined",
    withdrawn: "Withdrawn",
    cancellation_requested: "Cancellation requested",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function tone(status: string) {
  if (status === "approved") return "approved";
  if (status === "declined" || status === "cancelled") return "declined";
  return "pending";
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${tone(status)}`}><span className="dot"/>{label(status)}</span>;
}
