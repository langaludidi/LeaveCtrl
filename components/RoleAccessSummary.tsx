import Link from "next/link";
import { assignedRoleDetails } from "@/lib/role-access";

export function RoleAccessSummary({ roles, showActions = true }: { roles: readonly string[]; showActions?: boolean }) {
  return <section className="card role-access-summary" aria-labelledby="your-roles-heading">
    <h2 id="your-roles-heading">Your roles & access</h2>
    <p>You can hold several roles. Your access combines all assigned roles; you do not need to switch roles.</p>
    <div className="role-access-grid">
      {assignedRoleDetails(roles).map((item) => <article key={item.role} className="role-access-item">
        <h3>{item.label}</h3><p>{item.description}</p>
        {showActions ? <Link className="btn secondary" href={item.href}>{item.action}</Link> : null}
      </article>)}
    </div>
    <p className="card-subtitle">Need different access? Ask your Organisation Admin. Job titles and reporting lines do not automatically grant every access role.</p>
  </section>;
}
