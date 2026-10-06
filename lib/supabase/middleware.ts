import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { loadAccessStates } from "@/lib/access-state";
import { accessGateRedirect } from "@/lib/access-gate";
import { safeInternalPath } from "@/lib/safe-internal-path";

export async function updateSession(request: NextRequest) {
  // Only this exact machine endpoint is anonymous; its route verifies the raw
  // Paystack signature. Other billing APIs still require a verified user.
  if(request.nextUrl.pathname==="/api/billing/webhook" || request.nextUrl.pathname==="/subscribe") return NextResponse.next({request});
  const { url, key } = getSupabasePublicConfig();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const userId = user?.id ?? null;
  const emailVerified = hasVerifiedEmailOwnership(user);

  const isAuthCallback = pathname.startsWith("/auth/");
  const isAnonymousUtility =
    pathname === "/api/health" || pathname === "/api/social-image";
  const isAuthSurface =
    pathname === "/login" ||
    pathname === "/confirm-email" ||
    pathname === "/reset-password" ||
    isAuthCallback;
  const isInvitationEntry = pathname === "/join";

  if (!userId) {
    if (isAuthSurface || isInvitationEntry || isAnonymousUtility) {
      return response;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "next",
      pathname + request.nextUrl.search
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (!emailVerified) {
    if (
      pathname === "/confirm-email" ||
      isAuthCallback ||
      isAnonymousUtility
    ) {
      return response;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/confirm-email";
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      pathname + request.nextUrl.search
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (
    isAuthCallback ||
    isAnonymousUtility ||
    pathname === "/reset-password" ||
    pathname === "/access/unavailable"
  ) {
    return response;
  }

  // Billing is also the recovery surface for incomplete or expired workspaces.
  // Its server handlers independently enforce membership and billing authority.
  if(pathname==="/billing" || pathname.startsWith("/billing/") || pathname.startsWith("/api/billing/")) return response;

  let states;
  try {
    states = await loadAccessStates(supabase);
  } catch {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/access/unavailable";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/login" || pathname === "/confirm-email") {
    const redirectUrl = request.nextUrl.clone();
    const next=safeInternalPath(request.nextUrl.searchParams.get("next"),"/");
    if(next==="/billing" || next.startsWith("/billing?") || next.startsWith("/billing/")) return NextResponse.redirect(new URL(next,request.nextUrl.origin));
    redirectUrl.pathname = accessGateRedirect("/", states) ?? "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  const gatedPath = accessGateRedirect(pathname, states);
  if (gatedPath && gatedPath !== pathname) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = gatedPath;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
