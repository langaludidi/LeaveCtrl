import {
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signUp,
} from "@/app/auth/actions";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthCaptcha } from "@/components/AuthCaptcha";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    error?: string;
    message?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;
  const signingUp = params.mode === "signup";
  const next = safeInternalPath(
    params.next,
    signingUp ? "/onboarding" : "/"
  );
  const invitationSignup =
    signingUp &&
    (next.startsWith("/join?") || next.startsWith("/activate?"));
  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <BrandLogo className="auth-brand-logo" />
        </div>

        <div className="auth-copy">
          <p className="eyebrow">LEAVE & WORKFORCE AVAILABILITY</p>
          <h1>
            {signingUp
              ? invitationSignup
                ? "Join your organisation"
                : "Create your LeaveCtrl organisation"
              : "Welcome back"}
          </h1>
          <p>
            {signingUp
              ? invitationSignup
                ? "Create one secure LeaveCtrl identity, verify your email, then continue with the organisation that invited you."
                : "Set up leave and workforce availability for your organisation. You will verify your email before organisation setup begins."
              : "Sign in to manage your leave, your team and the work that needs your attention."}
          </p>
        </div>

        {params.error && (
          <div className="auth-alert error" role="alert">
            {params.error}
          </div>
        )}
        {params.message && (
          <div className="auth-alert success" role="status" aria-live="polite">
            {params.message}
          </div>
        )}

        <form action={signingUp ? signUp : signIn} className="auth-form">
          <input type="hidden" name="next" value={next} />

          {signingUp && (
            <div className="auth-name-row">
              <label>
                First name
                <input name="firstName" autoComplete="given-name" required />
              </label>
              <label>
                Last name
                <input name="lastName" autoComplete="family-name" required />
              </label>
            </div>
          )}

          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={signingUp ? 12 : undefined}
              autoComplete={signingUp ? "new-password" : "current-password"}
              aria-describedby={signingUp ? "signup-password-policy" : undefined}
              required
            />
          </label>

          <AuthCaptcha siteKey={captchaSiteKey} label="Sign-in security check" />

          {signingUp && <p id="signup-password-policy" className="auth-captcha-note">
            Use at least 12 characters, including uppercase and lowercase letters, a number and a symbol.
          </p>}

          <button className="btn primary auth-submit" type="submit">
            {signingUp ? "Create account" : "Sign in"}
          </button>
        </form>

        {signingUp && <p className="auth-switch">
          Read our <a href="https://leavectrl.co.za/privacy">privacy information</a> and{" "}
          <a href="https://leavectrl.co.za/terms">terms information</a> before creating an account.
        </p>}

        <p className="auth-switch">
          {signingUp ? "Already have an account?" : "New to LeaveCtrl?"}{" "}
          <a
            href={
              signingUp
                ? `/login?next=${encodeURIComponent(next)}`
                : `/login?mode=signup&next=${encodeURIComponent(next)}`
            }
          >
            {signingUp ? "Sign in" : "Create account"}
          </a>
        </p>

        <details className="auth-recovery">
          <summary>Need help signing in?</summary>
          <div className="auth-recovery-options">
            <form action={requestPasswordReset} className="auth-recovery-form">
              <div>
                <strong>Reset password</strong>
                <span>We&apos;ll email you a secure reset link.</span>
              </div>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Work email"
                aria-label="Email address for password reset"
                required
              />
              <AuthCaptcha siteKey={captchaSiteKey} label="Password reset security check" />
              <button className="btn secondary" type="submit">
                Send reset link
              </button>
            </form>

            <form action={resendConfirmation} className="auth-recovery-form">
              <input type="hidden" name="next" value={next} />
              <div>
                <strong>Send confirmation email again</strong>
                <span>For accounts still waiting for email confirmation.</span>
              </div>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Work email"
                aria-label="Email address for confirmation email"
                required
              />
              <button className="btn secondary" type="submit">
                Send confirmation email again
              </button>
            </form>
          </div>
        </details>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-card">
          <div className="auth-kicker">
            Simple on the surface. Governed underneath.
          </div>
          <h2>
            Know who is away, why a request is allowed, and whether the team can
            support it.
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
