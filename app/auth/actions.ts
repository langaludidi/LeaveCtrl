"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function read(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeNext(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function signIn(formData: FormData) {
  const email = read(formData, "email").toLowerCase();
  const password = read(formData, "password");
  const next = safeNext(read(formData, "next") || "/");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function signUp(formData: FormData) {
  const firstName = read(formData, "firstName");
  const lastName = read(formData, "lastName");
  const email = read(formData, "email").toLowerCase();
  const password = read(formData, "password");
  const next = safeNext(read(formData, "next") || "/onboarding");

  if (!firstName || !lastName || !email || password.length < 8) {
    redirect(
      `/login?mode=signup&error=${encodeURIComponent("Please complete all fields and use at least 8 characters.")}&next=${encodeURIComponent(next)}`
    );
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const forwardedHost = headerStore.get("x-forwarded-host");
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "https";
  const baseUrl = origin ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : undefined);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: baseUrl
        ? `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`
        : undefined,
    },
  });

  if (error) {
    redirect(
      `/login?mode=signup&error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`
    );
  }

  if (data.session) redirect(next);

  redirect(
    `/login?message=${encodeURIComponent("Check your email to confirm your account.")}&next=${encodeURIComponent(next)}`
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
