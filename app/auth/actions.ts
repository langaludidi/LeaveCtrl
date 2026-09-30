"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInErrorMessage, signUpErrorMessage } from "@/lib/auth-messages";
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

export async function signIn(formData: FormData) {
  const email = read(formData, "email").toLowerCase();
  const password = readSecret(formData, "password");
  const next = safeInternalPath(read(formData, "next"), "/");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(signInErrorMessage(error.message))}&next=${encodeURIComponent(next)}`
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: await emailRedirect(next),
    },
  });

  if (error) {
    redirect(
      `/login?mode=signup&error=${encodeURIComponent(signUpErrorMessage(error.message))}&next=${encodeURIComponent(next)}`
    );
  }

  if (data.session) redirect(next);

  // Keep the response account-enumeration-safe. Supabase deliberately obscures
  // whether a submitted email already belongs to an account.
  redirect(
    `/login?message=${encodeURIComponent(
      "If this email needs confirmation, check your inbox. If you already have a LeaveCtrl account, sign in or use password recovery. You can also send the confirmation email again below."
    )}&next=${encodeURIComponent(next)}`
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
      `/login?error=${encodeURIComponent(
        "Enter your email address to send the confirmation email again."
      )}&next=${encodeURIComponent(next)}`
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
    redirect(
      `/login?error=${encodeURIComponent(
        "We could not send a confirmation email. If this account is already confirmed, sign in or use password recovery."
      )}&next=${encodeURIComponent(next)}`
    );
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "If confirmation is still required, a new confirmation email has been requested."
    )}&next=${encodeURIComponent(next)}`
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
