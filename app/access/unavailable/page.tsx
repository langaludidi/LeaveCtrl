import { signOut } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

export default function AccessUnavailablePage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><BrandLogo className="auth-brand-logo" /></div>
        <div className="auth-copy">
          <p className="eyebrow">ACCESS CHECK</p>
          <h1>LeaveCtrl could not resolve your access safely</h1>
          <p>
            No protected data has been opened. Please sign out and try again, or
            contact your LeaveCtrl administrator if this continues.
          </p>
        </div>
        <form action={signOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
