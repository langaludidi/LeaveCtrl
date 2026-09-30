import { signOut } from "@/app/auth/actions";
import { BrandLogo } from "@/components/BrandLogo";

export default function OrganisationContextPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><BrandLogo className="auth-brand-logo" /></div>
        <div className="auth-copy">
          <p className="eyebrow">ORGANISATION CONTEXT</p>
          <h1>Choose an organisation context before continuing</h1>
          <p>
            More than one active organisation membership was detected. LeaveCtrl
            will not choose one implicitly or combine tenant data. Access remains
            fail-closed until an explicit organisation context is selected.
          </p>
        </div>
        <form action={signOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
