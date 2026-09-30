import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/safe-internal-path";
import {
  authCallbackOriginAllowed,
  CANONICAL_PRODUCTION_APP_URL,
  isPreviewEmailAuthEnabled,
  resolveAppBaseUrl,
} from "@/lib/app-base-url";
import { confirmationLinkErrorMessage } from "@/lib/auth-messages";

export const dynamic = "force-dynamic";

function redirectNoStore(target: URL) {
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function loginErrorUrl(baseUrl: string, message: string, next: string) {
  const target = new URL("/login", baseUrl);
  target.searchParams.set("mode", "signup");
  target.searchParams.set("error", message);
  target.searchParams.set("next", next);
  return target;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get("next"));
  const vercelEnv = process.env.VERCEL_ENV;
  const previewAuthEnabled = isPreviewEmailAuthEnabled(
    process.env.LEAVECTRL_ENABLE_PREVIEW_AUTH_EMAIL
  );
  const production = process.env.NODE_ENV === "production";

  if (
    !authCallbackOriginAllowed({
      configuredUrl: process.env.LEAVECTRL_APP_URL,
      requestOrigin: url.origin,
      vercelEnv,
      production,
      previewAuthEnabled,
    })
  ) {
    return redirectNoStore(
      loginErrorUrl(
        CANONICAL_PRODUCTION_APP_URL,
        "This confirmation link opened on a non-production LeaveCtrl address. Start again at www.leavectrl.co.za and send the confirmation email again.",
        next
      )
    );
  }

  const baseUrl =
    resolveAppBaseUrl({
      configuredUrl: process.env.LEAVECTRL_APP_URL,
      requestOrigin: url.origin,
      vercelEnv,
      production,
      previewAuthEnabled,
    }) ?? CANONICAL_PRODUCTION_APP_URL;

  const providerError = [
    url.searchParams.get("error_code"),
    url.searchParams.get("error"),
    url.searchParams.get("error_description"),
  ]
    .filter(Boolean)
    .join(" ");

  if (providerError) {
    return redirectNoStore(
      loginErrorUrl(baseUrl, confirmationLinkErrorMessage(providerError), next)
    );
  }

  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return redirectNoStore(new URL(next, baseUrl));
    }

    return redirectNoStore(
      loginErrorUrl(baseUrl, confirmationLinkErrorMessage(error.message), next)
    );
  }

  return redirectNoStore(
    loginErrorUrl(
      baseUrl,
      confirmationLinkErrorMessage("confirmation code missing"),
      next
    )
  );
}
