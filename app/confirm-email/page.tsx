import { resendConfirmation } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedEmailOwnership } from "@/lib/auth-verification";
import { BrandLogo } from "@/components/BrandLogo";
import { safeInternalPath } from "@/lib/safe-internal-path";

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/onboarding");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const verified = hasVerifiedEmailOwnership(user);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <BrandLogo className="auth-brand-logo" />
        </div>

        <div className="auth-copy">
          <p className="eyebrow">EMAIL VERIFICATION</p>
          <h1>{verified ? "Email verified" : "Check your email"}</h1>
          <p>
            {verified ? "Your account is confirmed. You can continue to LeaveCtrl." : "Open the confirmation link sent to your registered email address to activate your account."}
          </p>
        </div>

        {verified && <a className="btn primary" href={next}>Continue to LeaveCtrl</a>}

        {params.error && !verified && (
          <div className="auth-alert error" role="alert">
            {params.error}
          </div>
        )}
        {params.message && !verified && (
          <div className="auth-alert success" role="status" aria-live="polite">
            {params.message}
          </div>
        )}

        {!verified && (
          <form action={resendConfirmation} className="auth-recovery-form">
          <input type="hidden" name="next" value={next} />
          <div>
            <strong>Send confirmation email again</strong>
            <span>
              Enter the address you registered. We&apos;ll respond neutrally
              whether or not confirmation is still required.
            </span>
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
        )}

        <p className="auth-switch">
          <a href={`/login?mode=signup&next=${encodeURIComponent(next)}`}>
            Use a different email
          </a>
          {" · "}
          <a href={`/login?next=${encodeURIComponent(next)}`}>
            Back to sign in
          </a>
        </p>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-card">
          <div className="auth-kicker">Verify first. Enter LeaveCtrl second.</div>
          <h2>
            Email ownership verification is required before onboarding or
            protected workforce data becomes available.
          </h2>
          <div className="auth-points">
            <span>Native Supabase email verification</span>
            <span>Canonical LeaveCtrl callback</span>
            <span>Protected onboarding</span>
            <span>Fail-closed application access</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
