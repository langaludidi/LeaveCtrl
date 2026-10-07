import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getSupabasePublicConfig();
    const response = await fetch(`${config.url}/auth/v1/health`, {
      cache: "no-store",
      headers: {
        apikey: config.key,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error("supabase_auth_unavailable");

    return NextResponse.json(
      {
        status: "ok",
        service: "LeaveCtrl",
        dependencies: {
          supabase_auth: "ok",
        },
        release_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
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
