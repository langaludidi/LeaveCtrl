import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { loadAccessStates, isOrganisationSetupOperator } from "@/lib/access-state";

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

  return year + "-" + month + "-" + day;
}

type CurrentContextOptions = {
  requireEmployee?: boolean;
  allowOrganisationOnboardingIncomplete?: boolean;
  allowEmployeeWelcomeIncomplete?: boolean;
};

export async function getCurrentContext(options?: CurrentContextOptions) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!hasVerifiedEmailOwnership(user)) redirect("/confirm-email");

  const [states, { data: contextRow }] = await Promise.all([
    loadAccessStates(supabase),
    supabase.rpc("get_current_context_v1").maybeSingle(),
  ]);

  if (states.length === 0) {
    redirect("/access/no-membership");
  }

  if (states.length > 1) {
    redirect("/access/organisation-context");
  }

  const accessState = states[0];

  if (!accessState.employee_id && options?.requireEmployee !== false) {
    redirect(isOrganisationSetupOperator(accessState) ? "/setup" : "/access/membership-incomplete");
  }

  if (
    !accessState.organisation_onboarding_completed_at &&
    !options?.allowOrganisationOnboardingIncomplete
  ) {
    redirect(
      isOrganisationSetupOperator(accessState)
        ? "/setup"
        : "/access/organisation-setup-pending"
    );
  }

  if (
    !accessState.employee_welcome_completed_at &&
    !isOrganisationSetupOperator(accessState) &&
    !options?.allowEmployeeWelcomeIncomplete
  ) {
    redirect("/welcome");
  }

  const safeUser = {
    id: user.id,
    email: user.email ?? null,
  };

  if (
    contextRow &&
    contextRow.organisation_id !== accessState.organisation_id
  ) {
    redirect("/access/organisation-context");
  }

  const employee = contextRow?.employee_id
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
    redirect("/access/membership-incomplete");
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

  const roles = contextRow?.roles ?? accessState.roles;
  const timezone = organisation?.timezone ?? "UTC";
  const businessDate = dateInTimeZone(new Date(), timezone);

  return {
    supabase,
    user: safeUser,
    employee,
    organisation,
    accessState,
    timezone,
    businessDate,
    roles,
    displayName: employee
      ? employee.first_name + " " + employee.last_name
      : safeUser.email ?? "User",
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
