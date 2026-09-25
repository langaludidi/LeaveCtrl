import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentContext(options?: { requireEmployee?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, organisation_id, first_name, last_name, email, department_id, manager_employee_id, start_date")
    .eq("user_id", user.id)
    .eq("employment_status", "active")
    .maybeSingle();

  if (!employee && options?.requireEmployee !== false) {
    redirect("/onboarding");
  }

  let roles: string[] = [];
  if (employee) {
    const { data: memberships } = await supabase
      .from("organisation_memberships")
      .select("role")
      .eq("organisation_id", employee.organisation_id)
      .eq("user_id", user.id)
      .eq("is_active", true);

    roles = memberships?.map((membership) => membership.role) ?? [];
  }

  return {
    supabase,
    user,
    employee,
    roles,
    displayName: employee ? `${employee.first_name} ${employee.last_name}` : user.email ?? "User",
  };
}

export function roleLabel(roles: string[]) {
  if (roles.includes("org_admin")) return "Organisation Admin";
  if (roles.includes("hr_admin")) return "HR Admin";
  if (roles.includes("manager")) return "Manager";
  if (roles.includes("reporter")) return "Reporter";
  if (roles.includes("auditor")) return "Auditor";
  return "Employee";
}
