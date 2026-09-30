import { redirect } from "next/navigation";
import { ActivateAccountForm } from "@/components/ActivateAccountForm";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { loadAccessStates } from "@/lib/access-state";

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

  const next = "/activate?token=" + encodeURIComponent(token);

  if (!user) {
    redirect("/login?mode=signup&next=" + encodeURIComponent(next));
  }

  if (!hasVerifiedEmailOwnership(user)) {
    redirect("/confirm-email?next=" + encodeURIComponent(next));
  }

  const states = await loadAccessStates(supabase);
  if (states.length > 0) {
    redirect("/");
  }

  return (
    <main className="join-page">
      <section className="join-card">
        <div className="auth-brand"><span>Leave</span>Ctrl</div>
        <p className="eyebrow">EMPLOYEE ACCESS</p>
        <h1>Activate your account</h1>
        <p>
          Your organisation controls the employee profile and permissions
          attached to this invitation. Create your password to activate access;
          you cannot choose or elevate your role here.
        </p>
        <ActivateAccountForm token={token}/>
      </section>
    </main>
  );
}
