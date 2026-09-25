import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const appUrl = "https://leave-ctrl-2eqn.vercel.app";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("supabase_function_configuration_missing");
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
      return Response.json({ error: "authentication_required" }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const employeeId = String(body.employeeId ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "").trim();

    if (!employeeId || !email || !token) {
      return Response.json({ error: "required_fields_missing" }, { status: 400, headers: corsHeaders });
    }

    const { data: employee, error: employeeError } = await userClient
      .from("employees")
      .select("id, organisation_id, email, user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      return Response.json({ error: "employee_not_found" }, { status: 404, headers: corsHeaders });
    }

    if (employee.user_id) {
      return Response.json({ error: "employee_already_has_access" }, { status: 409, headers: corsHeaders });
    }

    if (String(employee.email).toLowerCase() !== email) {
      return Response.json({ error: "email_mismatch" }, { status: 400, headers: corsHeaders });
    }

    const { data: membership } = await userClient
      .from("organisation_memberships")
      .select("role")
      .eq("organisation_id", employee.organisation_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("role", ["org_admin", "hr_admin"]);

    if (!membership?.length) {
      return Response.json({ error: "not_authorised" }, { status: 403, headers: corsHeaders });
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
      return Response.json(
        { error: "invite_send_failed", detail: inviteError.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json({ sent: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: "unexpected_error", detail: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
});
