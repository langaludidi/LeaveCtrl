import { signOut } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

export default function OrganisationSetupPendingPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><BrandLogo className="auth-brand-logo" /></div>
        <div className="auth-copy">
          <p className="eyebrow">ORGANISATION SETUP</p>
          <h1>Your organisation is still being prepared</h1>
          <p>
            An organisation administrator must complete the core LeaveCtrl setup
            before normal employee access is opened. Your membership is retained,
            but protected workforce functions remain gated.
          </p>
        </div>
        <form action={signOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
