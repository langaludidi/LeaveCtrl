"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function claimInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/join?error=Invitation%20token%20missing.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_employee_invitation", { p_token: token });

  if (error) {
    const message =
      error.message === "invitation_email_mismatch"
        ? "This invitation belongs to a different email address."
        : error.message === "invitation_invalid_or_expired"
          ? "This invitation is invalid or has expired."
          : "We could not accept this invitation.";
    redirect(`/join?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}
