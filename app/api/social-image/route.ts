import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SOCIAL_IMAGES = {
  dark: "/social/leavectrl-social-dark.jpg",
  light: "/social/leavectrl-social-light.jpg",
} as const;

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("variant");

  const variant =
    requested === "dark" || requested === "light"
      ? requested
      : ((Math.floor(Date.now() / 86_400_000) +
          stableHash(request.headers.get("user-agent") ?? "")) %
          2 ===
        0
          ? "dark"
          : "light");

  const destination = new URL(SOCIAL_IMAGES[variant], request.url);

  return NextResponse.redirect(destination, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=7200",
      "X-Content-Type-Options": "nosniff",
      "X-LeaveCtrl-Social-Variant": variant,
    },
  });
}
