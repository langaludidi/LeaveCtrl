import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getSupabasePublicConfig();

    return NextResponse.json(
      {
        status: "ok",
        service: "LeaveCtrl",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        service: "LeaveCtrl",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }
}
