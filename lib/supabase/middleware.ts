import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";

export async function updateSession(request: NextRequest) {
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

  // Protected-route authorization uses the Auth server's user record rather
  // than user-editable metadata or an unverified local claim.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  const emailVerified = hasVerifiedEmailOwnership(user);

  const pathname = request.nextUrl.pathname;
  const isConfirmationPage = pathname === "/confirm-email";
  const isPublic =
    pathname === "/login" ||
    isConfirmationPage ||
    pathname.startsWith("/auth/") ||
    pathname === "/join" ||
    pathname === "/api/health" ||
    pathname === "/api/social-image";

  if (!userId && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (userId && !emailVerified && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/confirm-email";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (userId && !emailVerified && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/confirm-email";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (userId && emailVerified && (pathname === "/login" || isConfirmationPage)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
