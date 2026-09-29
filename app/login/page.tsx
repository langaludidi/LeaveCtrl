import {
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signUp,
} from "@/app/auth/actions";
import { safeInternalPath } from "@/lib/safe-internal-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const signingUp = params.mode === "signup";
  const next = safeInternalPath(
    params.next,
    signingUp ? "/onboarding" : "/"
  );

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><span>Leave</span>Ctrl</div>

        <div className="auth-copy">
          <p className="eyebrow">LEAVE & WORKFORCE AVAILABILITY</p>
          <h1>{signingUp ? "Create your workspace" : "Welcome back"}</h1>
          <p>
            {signingUp
              ? "Create your secure account, then continue directly to your organisation or invitation."
              : "Sign in to manage your leave, your team and the work that needs your attention."}
          </p>
        </div>

        {params.error && <div className="auth-alert error" role="alert">{params.error}</div>}
        {params.message && <div className="auth-alert success" role="status" aria-live="polite">{params.message}</div>}

        <form action={signingUp ? signUp : signIn} className="auth-form">
          <input type="hidden" name="next" value={next} />

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
              minLength={signingUp ? 12 : undefined}
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
          <a href={signingUp
            ? `/login?next=${encodeURIComponent(next)}`
            : `/login?mode=signup&next=${encodeURIComponent(next)}`}>
            {signingUp ? "Sign in" : "Create account"}
          </a>
        </p>

        <details className="auth-recovery">
          <summary>Can&apos;t access your account?</summary>
          <div className="auth-recovery-options">
            <form action={requestPasswordReset} className="auth-recovery-form">
              <div>
                <strong>Forgot password</strong>
                <span>We&apos;ll request a secure password reset link.</span>
              </div>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Work email"
                aria-label="Email address for password reset"
                required
              />
              <button className="btn secondary" type="submit">Send reset link</button>
            </form>

            <form action={resendConfirmation} className="auth-recovery-form">
              <input type="hidden" name="next" value={next} />
              <div>
                <strong>Confirmation email missing</strong>
                <span>Use this only if your account still requires email confirmation.</span>
              </div>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Work email"
                aria-label="Email address for confirmation resend"
                required
              />
              <button className="btn secondary" type="submit">Resend confirmation</button>
            </form>
          </div>
        </details>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-card">
          <div className="auth-kicker">Simple on the surface. Governed underneath.</div>
          <h2>Know who is away, why a request is allowed, and whether the team can support it.</h2>
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
