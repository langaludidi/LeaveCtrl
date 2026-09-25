export function StatusPill({status}:{status:"Approved"|"Pending"|"Declined"}) {
  return <span className={`status-pill ${status.toLowerCase()}`}><span className="dot"/>{status}</span>
}
