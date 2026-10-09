import { getCurrentContext } from "@/lib/current-context";

/** Record privileged report disclosure before allowing client-side file generation. */
export async function POST() {
  try {
    const { supabase, roles } = await getCurrentContext({ requireEmployee: false });
    if (!roles.some((role) => ["org_admin", "hr_admin", "reporter", "auditor", "manager", "employee"].includes(role))) {
      return new Response("Report access denied", { status: 403 });
    }
    // Every report disclosure must be auditable, including employee and manager exports.
    // If the database RPC does not permit the caller, fail closed rather than
    // authorising an unaudited client-side download.
    const { error } = await supabase.rpc("record_organisation_data_export", { p_format: "csv" });
    if (error) return new Response("Unable to record report export", { status: 500 });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("Authentication required", { status: 401 });
  }
}
