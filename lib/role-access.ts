export const roleCatalogue = [
  { role: "employee", label: "Employee", description: "Book your own leave and view your balances and requests.", href: "/my-leave", action: "View my leave" },
  { role: "manager", label: "Manager", description: "Review requests and availability for employees assigned to you. A reporting line must be assigned separately.", href: "/requests", action: "Review requests" },
  { role: "hr_admin", label: "HR Admin", description: "Manage employee records, leave policies and workforce administration across the organisation.", href: "/team", action: "Manage people" },
  { role: "org_admin", label: "Organisation Admin", description: "Complete organisation setup, manage access roles and billing, and oversee workforce administration.", href: "/setup", action: "Open administration" },
  { role: "reporter", label: "Reporter", description: "View and export organisation reports. This role does not grant request approval or administration.", href: "/reports", action: "Open reports" },
  { role: "auditor", label: "Auditor", description: "Review the organisation audit trail and reports. This role does not grant request approval or administration.", href: "/audit", action: "Review audit log" },
] as const;
export type AccessRole = typeof roleCatalogue[number]["role"];

export function assignedRoleDetails(roles: readonly string[]) {
  return roleCatalogue.filter((item) => roles.includes(item.role));
}
export function roleLabels(roles: readonly string[]) {
  return assignedRoleDetails(roles).map((item) => item.label).join(" · ");
}
export function roleCapabilities(roles: readonly string[], hasEmployee = true) {
  const admin = roles.includes("org_admin") || roles.includes("hr_admin");
  return {
    home: hasEmployee && roles.some((role) => role !== "employee"),
    personal: hasEmployee,
    team: admin || (hasEmployee && roles.includes("manager")),
    reports: admin || (hasEmployee && roles.some((role) => ["manager", "reporter", "auditor"].includes(role))),
    audit: admin || roles.includes("auditor"),
    administration: admin,
    billing: roles.includes("org_admin"),
  };
}
export function roleLanding(roles: readonly string[], hasEmployee = true) {
  for (const role of ["org_admin", "hr_admin", "manager", "auditor", "reporter"]) {
    const item = assignedRoleDetails(roles).find((item) => item.role === role);
    if (item && (hasEmployee || role === "org_admin")) return { href: item.href, label: item.action };
  }
  return hasEmployee ? { href: "/my-leave", label: "View my leave" } : { href: "/access/roles", label: "View my roles" };
}
