import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { loadAccessStates } from "@/lib/access-state";
import { claimInvitation } from "./actions";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";

  if (!token) {
    return (
      <main className="join-page">
        <section className="join-card">
          <div className="auth-brand"><span>Leave</span>Ctrl</div>
          <h1>Invitation link required</h1>
          <p>Open the secure invitation link supplied by your organisation administrator.</p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const next = "/join?token=" + encodeURIComponent(token);

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
        <p className="eyebrow">ORGANISATION INVITATION</p>
        <h1>Join your organisation</h1>
        <p>
          Your verified LeaveCtrl identity is ready. Accepting this invitation
          will connect you only to the organisation, employee profile and
          capabilities assigned by the invitation.
        </p>

        {params.error ? <div className="auth-alert error" role="alert">{params.error}</div> : null}

        <form action={claimInvitation}>
          <input type="hidden" name="token" value={token} />
          <button className="btn primary join-submit" type="submit">
            Accept invitation
          </button>
        </form>
      </section>
    </main>
  );
}
