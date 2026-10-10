import { assignedRoleDetails } from "@/lib/role-access";

export function RoleBadges({ roles }: { roles: readonly string[] }) {
  return <span className="role-badges">{assignedRoleDetails(roles).map((item) =>
    <span key={item.role} className="role-badge" data-role={item.role}>{item.label}</span>
  )}</span>;
}
