# LeaveCtrl V1 — Production Authentication Email & Callback Contract

**Status:** P0 release gate  
**Canonical customer origin:** `https://www.leavectrl.co.za`

## Production invariant

A customer who begins an authentication journey on the production LeaveCtrl site must remain on the canonical customer domain:

`www.leavectrl.co.za → Supabase Auth → email → www.leavectrl.co.za/auth/callback → session → intended LeaveCtrl route`

No production signup, confirmation, recovery or invitation email may use a Vercel preview hostname as its customer-facing callback.

## Application URL source

The server-side application configuration uses one URL variable:

`LEAVECTRL_APP_URL=https://www.leavectrl.co.za`

Production callback resolution is additionally pinned in code to the canonical domain so a stale or incorrect environment value cannot leak a customer into a Vercel alias.

The previous authentication fallback inputs `NEXT_PUBLIC_APP_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are not used to construct authentication email callbacks.

## Preview safeguard

Vercel preview deployments run with production-mode application code, so relying on `NODE_ENV` alone is unsafe.

LeaveCtrl therefore uses `VERCEL_ENV`:

- `production`: authentication email callbacks are always canonical.
- `preview`: signup/recovery/confirmation-email initiation is blocked by default.
- deliberate preview auth test: set `LEAVECTRL_ENABLE_PREVIEW_AUTH_EMAIL=true`; the flow then remains on that exact `*.vercel.app` preview origin so the PKCE verifier cookie and callback stay together.
- local development: localhost callbacks are allowed.

Do not enable the preview-auth flag on normal preview deployments.

## Existing callback route

`/auth/callback` remains the single authoritative callback implementation.

It:

- exchanges the Supabase PKCE auth code through `exchangeCodeForSession`;
- refuses code exchange on an unauthorised callback origin;
- handles Supabase callback error parameters without exposing raw provider errors;
- maps invalid, expired and reused confirmation credentials to a recovery path;
- preserves a safe internal `next` route;
- marks callback responses `private, no-store`.

No parallel callback implementation is used.

## Existing-account UX

Signup success copy is intentionally non-enumerating. It does not tell a visitor whether the submitted email is new, unconfirmed or already registered.

The customer is guided to:

- check email if confirmation is required;
- sign in if an account already exists;
- use password recovery where appropriate;
- **Send confirmation email again** if confirmation is still pending.

Customer-facing copy no longer uses the ambiguous phrase “Resend confirmation”.

## Invitation email

The production employee-invitation Edge Function now accepts only the canonical LeaveCtrl origin for its callback. A stale non-canonical `LEAVECTRL_APP_URL` is ignored rather than used to generate an invitation link.

Email transport configuration is separate from callback construction.

## Supabase dashboard configuration required before sign-off

In the production Supabase project, verify:

- **Site URL:** `https://www.leavectrl.co.za`
- the allowed Redirect URLs explicitly include:
  - `https://www.leavectrl.co.za/auth/callback`
- retain only intentional local/development or deliberately controlled preview callback entries.

Do not add broad wildcard preview redirects merely to make authentication testing convenient.

## SMTP / transport

Auth logs previously recorded failures resolving `smtp-reply.brevo.com`. Later signup/recovery requests also returned HTTP 200, so transport and callback correctness must be tested independently.

The final P0 acceptance test must prove actual email receipt and callback completion. A provider change must not alter the authentication destination.

## Acceptance evidence still required

Use a brand-new email address never before present in production Supabase Auth and record, without tokens or complete magic links:

1. originating hostname;
2. exact deployed commit;
3. signup result;
4. email delivery;
5. callback hostname/path;
6. confirmation result;
7. confirmed-user state;
8. session establishment;
9. onboarding/authenticated destination;
10. refresh persistence;
11. sign-out;
12. subsequent password sign-in;
13. reused/expired-link recovery;
14. existing-unconfirmed confirmation-email-again flow;
15. preview contamination test.

This P0 is not complete until that end-to-end production evidence exists.
