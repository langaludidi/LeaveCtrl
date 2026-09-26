import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const appUrl = Deno.env.get("LEAVECTRL_APP_URL") ?? "https://leave-ctrl-2eqn.vercel.app";
const allowedOrigin = new URL(appUrl).origin;

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  return {
    ...(origin === allowedOrigin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(req),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  const origin = req.headers.get("Origin");

  if (origin && origin !== allowedOrigin) {
    return json(req, { error: "origin_not_allowed" }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(req, { error: "authentication_required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("send-employee-invite: required Supabase configuration is missing");
      return json(req, { error: "service_unavailable" }, 503);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json(req, { error: "authentication_required" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const employeeId = String(body.employeeId ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "").trim();

    if (!employeeId || !email || !token) {
      return json(req, { error: "required_fields_missing" }, 400);
    }

    if (employeeId.length > 64 || email.length > 320 || token.length > 256) {
      return json(req, { error: "invalid_request" }, 400);
    }

    const { data: employee, error: employeeError } = await userClient
      .from("employees")
      .select("id, organisation_id, email, user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      return json(req, { error: "employee_not_found" }, 404);
    }

    if (employee.user_id) {
      return json(req, { error: "employee_already_has_access" }, 409);
    }

    if (String(employee.email).toLowerCase() !== email) {
      return json(req, { error: "email_mismatch" }, 400);
    }

    const { data: membership, error: membershipError } = await userClient
      .from("organisation_memberships")
      .select("role")
      .eq("organisation_id", employee.organisation_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("role", ["org_admin", "hr_admin"]);

    if (membershipError || !membership?.length) {
      return json(req, { error: "not_authorised" }, 403);
    }

    const { data: tokenValid, error: tokenError } = await userClient.rpc(
      "validate_employee_invitation_for_delivery",
      {
        p_employee_id: employeeId,
        p_token: token,
      }
    );

    if (tokenError || tokenValid !== true) {
      return json(req, { error: "invitation_token_invalid_or_expired" }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const next = `/activate?token=${encodeURIComponent(token)}`;
    const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        employee_id: employeeId,
        organisation_id: employee.organisation_id,
      },
    });

    if (inviteError) {
      console.error("send-employee-invite: Supabase Auth invite failed", {
        employeeId,
        organisationId: employee.organisation_id,
        code: inviteError.code,
      });
      return json(req, { error: "invite_send_failed" }, 400);
    }

    return json(req, { sent: true });
  } catch (error) {
    console.error("send-employee-invite: unexpected failure", error);
    return json(req, { error: "unexpected_error" }, 500);
  }
});
