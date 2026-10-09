import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
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

function confirmationRecoveryUrl(
  baseUrl: string,
  message: string,
  next: string
) {
  const target = new URL("/confirm-email", baseUrl);
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
      confirmationRecoveryUrl(
        CANONICAL_PRODUCTION_APP_URL,
        "This confirmation link opened on a non-production LeaveCtrl address. Start again at app.leavectrl.co.za and send the confirmation email again.",
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
      confirmationRecoveryUrl(
        baseUrl,
        confirmationLinkErrorMessage(providerError),
        next
      )
    );
  }

  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && hasVerifiedEmailOwnership(data.user)) {
      return redirectNoStore(new URL(next, baseUrl));
    }

    // A mail client may reopen a one-time confirmation URL after the first
    // successful exchange. Never treat an unverified session as confirmed.
    if (error) {
      const { data: existing } = await supabase.auth.getUser();
      if (hasVerifiedEmailOwnership(existing.user)) {
        return redirectNoStore(new URL(next, baseUrl));
      }
    }

    if (!error) {
      await supabase.auth.signOut({ scope: "local" });
    }

    return redirectNoStore(
      confirmationRecoveryUrl(
        baseUrl,
        confirmationLinkErrorMessage(
          error?.message ?? "email verification evidence missing"
        ),
        next
      )
    );
  }

  return redirectNoStore(
    confirmationRecoveryUrl(
      baseUrl,
      confirmationLinkErrorMessage("confirmation code missing"),
      next
    )
  );
}
