import { initialiseCheckout } from "@/lib/billing/server";
import {
  bodyJson,
  sameOrigin,
  billingResponse,
  billingFailure,
} from "@/lib/billing/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await bodyJson(request);
    if (
      body.consent !== true ||
      typeof body.priceId !== "string" ||
      !/^(starter|team|business|organisation)_(monthly|annual)_v1$/.test(
        body.priceId,
      )
    )
      return billingResponse({ error: "choose_plan_and_confirm_billing" }, 400);
    return billingResponse({ url: await initialiseCheckout(body.priceId) });
  } catch (e) {
    return billingFailure(e);
  }
}
