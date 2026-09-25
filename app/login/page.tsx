import { signIn, signUp } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const signingUp = params.mode === "signup";

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><span>Leave</span>Ctrl</div>

        <div className="auth-copy">
          <p className="eyebrow">LEAVE & WORKFORCE AVAILABILITY</p>
          <h1>{signingUp ? "Create your workspace" : "Welcome back"}</h1>
          <p>
            {signingUp
              ? "Set up a calm, reliable place for leave, approvals and team availability."
              : "Sign in to manage your leave, your team and the work that needs your attention."}
          </p>
        </div>

        {params.error && <div className="auth-alert error">{params.error}</div>}
        {params.message && <div className="auth-alert success">{params.message}</div>}

        <form action={signingUp ? signUp : signIn} className="auth-form">
          {signingUp && (
            <div className="auth-name-row">
              <label>First name<input name="firstName" autoComplete="given-name" required /></label>
              <label>Last name<input name="lastName" autoComplete="family-name" required /></label>
            </div>
          )}

          <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={signingUp ? "new-password" : "current-password"}
              required
            />
          </label>

          <button className="btn primary auth-submit" type="submit">
            {signingUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="auth-switch">
          {signingUp ? "Already have an account?" : "New to LeaveCtrl?"}{" "}
          <a href={signingUp ? "/login" : "/login?mode=signup"}>
            {signingUp ? "Sign in" : "Create account"}
          </a>
        </p>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-card">
          <div className="auth-kicker">Simple on the surface. Governed underneath.</div>
          <h2>
            Know who is away, why a request is allowed, and whether the team can support it.
          </h2>
          <div className="auth-points">
            <span>South Africa-first setup</span>
            <span>Clear employee balances</span>
            <span>Policy-aware approvals</span>
            <span>Operational coverage context</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
