import { signOut } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

export default function MembershipIncompletePage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><BrandLogo className="auth-brand-logo" /></div>
        <div className="auth-copy">
          <p className="eyebrow">ACCESS CHECK</p>
          <h1>Your organisation access needs attention</h1>
          <p>
            LeaveCtrl found an organisation membership but no matching active
            employee context. Protected workforce data remains unavailable until
            the organisation resolves the membership.
          </p>
        </div>
        <form action={signOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
