import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

export default function NoMembershipPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><BrandLogo className="auth-brand-logo" /></div>
        <div className="auth-copy">
          <p className="eyebrow">LEAVECTRL ACCESS</p>
          <h1>No organisation membership yet</h1>
          <p>
            Your identity is verified, but it is not currently connected to an
            active LeaveCtrl organisation. Authentication alone does not grant
            workforce access.
          </p>
        </div>

        <div className="auth-recovery-options">
          <div className="auth-recovery-form">
            <div>
              <strong>Create a LeaveCtrl organisation</strong>
              <span>For a new customer establishing a new workspace.</span>
            </div>
            <Link href="/onboarding" className="btn primary">
              Create organisation
            </Link>
          </div>

          <div className="auth-recovery-form">
            <div>
              <strong>Joining an existing organisation?</strong>
              <span>Open the secure invitation sent by your organisation.</span>
            </div>
          </div>
        </div>

        <form action={signOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
