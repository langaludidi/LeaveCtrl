import { billingIdentity, billingSummary } from "@/lib/billing/server";
import { billingResponse, billingFailure } from "@/lib/billing/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    const { supabase, orgId } = await billingIdentity(false);
    return billingResponse(await billingSummary(supabase, orgId));
  } catch (e) {
    return billingFailure(e);
  }
}
