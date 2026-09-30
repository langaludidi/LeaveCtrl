"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInErrorMessage, signUpErrorMessage } from "@/lib/auth-messages";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { safeInternalPath } from "@/lib/safe-internal-path";
import {
  CANONICAL_PRODUCTION_APP_URL,
  canInitiateEmailAuth,
  isPreviewEmailAuthEnabled,
  resolveAppBaseUrl,
} from "@/lib/app-base-url";
import { validatePassword } from "@/lib/password-policy";

const EMAIL_AUTH_ORIGIN_BLOCKED =
  "Continue this authentication request at www.leavectrl.co.za.";

function read(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readSecret(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function confirmationPath(next: string, message?: string, error?: string) {
  const params = new URLSearchParams({ next });
  if (message) params.set("message", message);
  if (error) params.set("error", error);
  return `/confirm-email?${params.toString()}`;
}

async function emailRedirect(next: string) {
  const headerStore = await headers();
  const vercelEnv = process.env.VERCEL_ENV;
  const production = process.env.NODE_ENV === "production";
  const previewAuthEnabled = isPreviewEmailAuthEnabled(
    process.env.LEAVECTRL_ENABLE_PREVIEW_AUTH_EMAIL
  );
  const forwardedHost =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const forwardedProto =
    headerStore.get("x-forwarded-proto") ??
    (forwardedHost?.startsWith("localhost") ? "http" : "https");
  const requestOrigin =
    headerStore.get("origin") ??
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null);

  if (
    !canInitiateEmailAuth({
      requestOrigin,
      vercelEnv,
      production,
      previewAuthEnabled,
    })
  ) {
    const target = new URL("/login", CANONICAL_PRODUCTION_APP_URL);
    target.searchParams.set("error", EMAIL_AUTH_ORIGIN_BLOCKED);
    target.searchParams.set("next", next);
    redirect(target.toString());
  }

  const baseUrl = resolveAppBaseUrl({
    configuredUrl: process.env.LEAVECTRL_APP_URL,
    requestOrigin,
    vercelEnv,
    production,
    previewAuthEnabled,
  });

  return baseUrl
    ? `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;
}

async function clearExistingBrowserSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.auth.signOut({ scope: "local" });
  }

  return supabase;
}

export async function signIn(formData: FormData) {
  const email = read(formData, "email").toLowerCase();
  const password = readSecret(formData, "password");
  const next = safeInternalPath(read(formData, "next"), "/");
  const supabase = await clearExistingBrowserSession();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("email") &&
      error.message.toLowerCase().includes("confirm")
    ) {
      redirect(
        confirmationPath(
          next,
          "Check your email to verify your address before signing in."
        )
      );
    }

    redirect(
      `/login?error=${encodeURIComponent(signInErrorMessage(error.message))}&next=${encodeURIComponent(next)}`
    );
  }

  if (!hasVerifiedEmailOwnership(data.user)) {
    await supabase.auth.signOut({ scope: "local" });
    redirect(
      confirmationPath(
        next,
        undefined,
        "Email verification is required before LeaveCtrl access. Send the confirmation email again below."
      )
    );
  }

  redirect(next);
}

export async function signUp(formData: FormData) {
  const firstName = read(formData, "firstName");
  const lastName = read(formData, "lastName");
  const email = read(formData, "email").toLowerCase();
  const password = readSecret(formData, "password");
  const next = safeInternalPath(read(formData, "next"), "/onboarding");
  const invitationIntent =
    next.startsWith("/join?") || next.startsWith("/activate?");

  const passwordPolicy = validatePassword(password);
  if (!firstName || !lastName || !email || !passwordPolicy.valid) {
    const message =
      !firstName || !lastName || !email
        ? "Please complete all fields."
        : passwordPolicy.message;
    redirect(
      `/login?mode=signup&error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`
    );
  }

  // A stale or pre-existing browser session must never be allowed to make a
  // failed/new registration appear authenticated as that prior account.
  const supabase = await clearExistingBrowserSession();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        registration_intent: invitationIntent
          ? "invitation"
          : "create_organisation",
      },
      emailRedirectTo: await emailRedirect(next),
    },
  });

  if (error) {
    redirect(
      `/login?mode=signup&error=${encodeURIComponent(signUpErrorMessage(error.message))}&next=${encodeURIComponent(next)}`
    );
  }

  // With production email confirmation enabled, Supabase returns a user but no
  // session. If configuration ever returns a session here, fail closed and
  // revoke it rather than admitting the registration to the application.
  if (data.session || hasVerifiedEmailOwnership(data.user)) {
    if (data.session) {
      await supabase.auth.signOut({ scope: "local" });
    }

    redirect(
      confirmationPath(
        next,
        undefined,
        "LeaveCtrl requires email ownership verification before application access. Check your email or send the confirmation email again."
      )
    );
  }

  redirect(
    confirmationPath(
      next,
      "Check your email. Open the confirmation link to verify your address and activate your LeaveCtrl account."
    )
  );
}

export async function requestPasswordReset(formData: FormData) {
  const email = read(formData, "email").toLowerCase();

  if (!email) {
    redirect(
      `/login?error=${encodeURIComponent(
        "Enter your email address to request a password reset."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await emailRedirect("/reset-password"),
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        "We could not send a password reset email. Please try again shortly."
      )}`
    );
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "If an account exists for that email, password reset instructions have been requested."
    )}`
  );
}

export async function resendConfirmation(formData: FormData) {
  const email = read(formData, "email").toLowerCase();
  const next = safeInternalPath(read(formData, "next"), "/onboarding");

  if (!email) {
    redirect(
      confirmationPath(
        next,
        undefined,
        "Enter your email address to send the confirmation email again."
      )
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: await emailRedirect(next),
    },
  });

  if (error) {
    // Keep the response neutral: do not reveal whether the address is already
    // confirmed, absent or temporarily rate-limited.
    redirect(
      confirmationPath(
        next,
        "If an account requiring confirmation exists for that address, confirmation instructions have been requested."
      )
    );
  }

  redirect(
    confirmationPath(
      next,
      "If an account requiring confirmation exists for that address, confirmation instructions have been requested."
    )
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
