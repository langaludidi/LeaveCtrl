import type { LeaveCtrlAccessState } from "./access-state";

function isOrganisationSetupOperator(state: LeaveCtrlAccessState) {
  return state.roles.includes("org_admin");
}

function isPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function accessGateRedirect(
  pathname: string,
  states: LeaveCtrlAccessState[]
): string | null {
  if (states.length === 0) {
    if (
      isPath(pathname, "/onboarding") ||
      isPath(pathname, "/join") ||
      isPath(pathname, "/activate") ||
      isPath(pathname, "/access/no-membership")
    ) {
      return null;
    }
    return "/access/no-membership";
  }

  // Current production identity policy still permits only one active
  // organisation. If that invariant is ever relaxed, do not select one
  // implicitly: fail closed until explicit organisation context is resolved.
  if (states.length > 1) {
    return isPath(pathname, "/access/organisation-context")
      ? null
      : "/access/organisation-context";
  }

  const state = states[0];

  if (!state.employee_id) {
    return isPath(pathname, "/access/membership-incomplete")
      ? null
      : "/access/membership-incomplete";
  }

  if (!state.organisation_onboarding_completed_at) {
    if (isOrganisationSetupOperator(state)) {
      if (
        isPath(pathname, "/setup") ||
        isPath(pathname, "/team") ||
        isPath(pathname, "/access/organisation-setup-pending")
      ) {
        return null;
      }
      return "/setup";
    }

    return isPath(pathname, "/access/organisation-setup-pending")
      ? null
      : "/access/organisation-setup-pending";
  }

  if (
    !state.employee_welcome_completed_at &&
    !isOrganisationSetupOperator(state)
  ) {
    return isPath(pathname, "/welcome") ? null : "/welcome";
  }

  if (
    isPath(pathname, "/onboarding") ||
    isPath(pathname, "/access/no-membership") ||
    isPath(pathname, "/access/membership-incomplete") ||
    isPath(pathname, "/access/organisation-setup-pending")
  ) {
    return "/";
  }

  return null;
}
