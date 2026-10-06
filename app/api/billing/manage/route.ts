import { manageSubscription } from "@/lib/billing/server";
import {
  sameOrigin,
  billingResponse,
  billingFailure,
} from "@/lib/billing/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    return billingResponse({ url: await manageSubscription() });
  } catch (e) {
    return billingFailure(e);
  }
}
