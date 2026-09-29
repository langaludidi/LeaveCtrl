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
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub ?? null;

  if (!userId) redirect("/login");

  const user = {
    id: userId,
    email: typeof claims?.email === "string" ? claims.email : null,
  };

  const { data: contextRow } = await supabase
    .rpc("get_current_context_v1")
    .maybeSingle();

  const employee = contextRow
    ? {
        id: contextRow.employee_id,
        organisation_id: contextRow.organisation_id,
        first_name: contextRow.first_name,
        last_name: contextRow.last_name,
        email: contextRow.email,
        department_id: contextRow.department_id,
        manager_employee_id: contextRow.manager_employee_id,
        start_date: contextRow.start_date,
      }
    : null;

  if (!employee && options?.requireEmployee !== false) {
    redirect("/onboarding");
  }

  const organisation = contextRow
    ? {
        id: contextRow.organisation_id,
        name: contextRow.organisation_name,
        timezone: contextRow.timezone,
        country_code: contextRow.country_code,
        currency_code: contextRow.currency_code,
      }
    : null;

  const roles = contextRow?.roles ?? [];
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
    displayName: employee
      ? `${employee.first_name} ${employee.last_name}`
      : user.email ?? "User",
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
