import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

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
  let organisation: {
    id: string;
    name: string;
    timezone: string;
    country_code: string;
    currency_code: string;
  } | null = null;

  if (employee) {
    const [{ data: memberships }, { data: organisationRow }] = await Promise.all([
      supabase
        .from("organisation_memberships")
        .select("role")
        .eq("organisation_id", employee.organisation_id)
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase
        .from("organisations")
        .select("id, name, timezone, country_code, currency_code")
        .eq("id", employee.organisation_id)
        .maybeSingle(),
    ]);

    roles = memberships?.map((membership) => membership.role) ?? [];
    organisation = organisationRow ?? null;
  }

  const timezone = organisation?.timezone ?? "UTC";
  const businessDate = dateInTimeZone(new Date(), timezone);

  return {
    supabase,
    user,
    employee,
    organisation,
    timezone,
    businessDate,
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
