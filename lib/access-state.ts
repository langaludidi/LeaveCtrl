import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type LeaveCtrlAccessState = {
  organisation_id: string;
  organisation_name: string;
  roles: Database["public"]["Enums"]["member_role"][];
  employee_id: string | null;
  employee_welcome_completed_at: string | null;
  organisation_onboarding_completed_at: string | null;
};

export async function loadAccessStates(
  supabase: SupabaseClient<Database>
): Promise<LeaveCtrlAccessState[]> {
  const { data, error } = await supabase.rpc("get_access_state_v1");

  if (error) {
    throw new Error("access_state_resolution_failed");
  }

  return (data ?? []) as LeaveCtrlAccessState[];
}

export function hasRole(
  state: LeaveCtrlAccessState,
  role: Database["public"]["Enums"]["member_role"]
) {
  return state.roles.includes(role);
}

export function isOrganisationSetupOperator(state: LeaveCtrlAccessState) {
  return hasRole(state, "org_admin");
}
