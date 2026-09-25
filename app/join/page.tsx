import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?mode=signup&next=${encodeURIComponent(`/join?token=${token}`)}`);
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
        <p className="eyebrow">ORGANISATION INVITATION</p>
        <h1>Join your organisation</h1>
        <p>
          Your account is authenticated. Accepting this invitation will connect your employee profile,
          work schedule and approval role to the organisation that invited you.
        </p>

        {params.error ? <div className="auth-alert error">{params.error}</div> : null}

        <form action={claimInvitation}>
          <input type="hidden" name="token" value={token} />
          <button className="btn primary join-submit" type="submit">Accept invitation</button>
        </form>
      </section>
    </main>
  );
}
