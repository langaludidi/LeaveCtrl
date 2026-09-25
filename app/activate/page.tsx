import { redirect } from "next/navigation";
import { ActivateAccountForm } from "@/components/ActivateAccountForm";
import { createClient } from "@/lib/supabase/server";

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";

  if (!token) redirect("/login?error=Invitation%20token%20missing.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/activate?token=${token}`)}`);
  }

  const { data: existingEmployee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingEmployee) redirect("/");

  return (
    <main className="join-page">
      <section className="join-card">
        <div className="auth-brand"><span>Leave</span>Ctrl</div>
        <p className="eyebrow">EMPLOYEE ACCESS</p>
        <h1>Activate your account</h1>
        <p>
          Your organisation has already created your employee profile and leave position.
          Create a password to activate access.
        </p>
        <ActivateAccountForm token={token}/>
      </section>
    </main>
  );
}
