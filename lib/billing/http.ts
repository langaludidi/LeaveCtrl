import { NextResponse } from "next/server";
import { BillingError } from "./server";

export function sameOrigin(request: Request) {
  const expected =
    process.env.NODE_ENV === "development"
      ? new URL(request.url).origin
      : "https://app.leavectrl.co.za";
  if (request.headers.get("origin") !== expected)
    throw new BillingError("origin_not_allowed", 403);
}

export async function boundedBody(request: Request, maxBytes = 262144) {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new BillingError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new BillingError("request_too_large", 413);
    }
    parts.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

export async function bodyJson(request: Request) {
  const body = new TextDecoder().decode(await boundedBody(request, 4096));
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new BillingError("invalid_request", 400);
  }
}

export function billingResponse(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function billingFailure(error: unknown) {
  if (error instanceof BillingError)
    return billingResponse({ error: error.code }, error.status);
  console.error("billing_request_failed");
  return billingResponse({ error: "billing_unavailable" }, 503);
}
