"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function read(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signIn(formData: FormData) {
  const email = read(formData, "email").toLowerCase();
  const password = read(formData, "password");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  redirect("/");
}

export async function signUp(formData: FormData) {
  const firstName = read(formData, "firstName");
  const lastName = read(formData, "lastName");
  const email = read(formData, "email").toLowerCase();
  const password = read(formData, "password");

  if (!firstName || !lastName || !email || password.length < 8) {
    redirect("/login?mode=signup&error=Please%20complete%20all%20fields%20and%20use%20at%20least%208%20characters.");
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? headerStore.get("x-forwarded-host");
  const baseUrl = origin?.startsWith("http") ? origin : origin ? `https://${origin}` : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: baseUrl ? `${baseUrl}/auth/callback?next=/onboarding` : undefined,
    },
  });

  if (error) redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
  if (data.session) redirect("/onboarding");

  redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
