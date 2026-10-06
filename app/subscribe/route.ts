import { NextRequest, NextResponse } from "next/server";
import { selectedPrice } from "@/lib/billing/catalog";
export function GET(request: NextRequest) {
  const price = selectedPrice(
    request.nextUrl.searchParams.get("plan"),
    request.nextUrl.searchParams.get("interval"),
  );
  const target = new URL("https://app.leavectrl.co.za/billing");
  if (price) {
    target.searchParams.set("plan", price.code);
    target.searchParams.set("interval", price.interval);
  }
  const response = NextResponse.redirect(target);
  if (price)
    response.cookies.set("leavectrl_selected_price", price.priceId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
