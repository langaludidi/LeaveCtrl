# Approved LeaveCtrl domain migration

Approved by the owner on 6 October 2026. Marketing: https://leavectrl.co.za; www redirects to marketing; authenticated application: https://app.leavectrl.co.za.

This branch starts from the exact current production commit 754233a70214a6150321b72ff2b2b0967d6e2b64. It changes only the application canonical origin, origin-related recovery wording and employee invitation destination/CORS, plus relevant tests. No database or product workflow changes.

Verification: 12 focused origin, callback and invitation tests pass using Node 24.19.0. Production allows email-auth initiation and code exchange only on app.leavectrl.co.za; marketing origins and ordinary previews are rejected. Full Vercel build and deployed flows are pending.

## Current external state

- Vercel leave-ctrl project: app.leavectrl.co.za connected, valid configuration and active certificate.
- Production environment variable LEAVECTRL_APP_URL added as https://app.leavectrl.co.za. A new deployment is required. Existing production remains unchanged.
- Apex currently redirects to www; www serves the existing app.
- DNS traffic records have not been changed. Preserve Brevo DKIM, mail tracking, DMARC, verification records, CAA and app routing.
- Supabase project nihvucwfzajudsejczzz is ACTIVE_HEALTHY. Dashboard sign-in is required to inspect/update Auth URL Configuration. GitHub sign-in attempt was rejected. No Auth settings have been changed.

## Remaining coordinated steps

1. Authenticate to the existing Supabase account. Inspect current Site URL, redirect allowlist, email templates and deployed send-employee-invite configuration. Preserve authentication/RLS controls; do not add broad host wildcards.
2. Move Site URL to https://app.leavectrl.co.za and allow the existing /auth/callback flow including its next query parameter on that exact host. Confirm email templates use the configured callback rather than hard-coded www.
3. Deploy this exact branch to canonical Vercel project leave-ctrl and deploy the updated employee invitation Edge Function preserving existing JWT/auth controls. Do not deploy unrelated newer main commits.
4. Verify app health, login, confirmation and password reset, and invitation destination. Previously issued PKCE email links may need reissuing because origin-scoped cookies do not transfer from www to app.
5. Prepare marketing app CTA flag, public indexing, legacy application-path redirects preserving path/query, www-to-apex redirect, contact allowed origin and Turnstile hostnames. Run marketing checks/build and publish approved site.
6. Add Sites verification TXT records and prepare certificates, then move only apex/www routing to Sites. Keep app on Vercel and preserve email records. Verify DNS, HTTPS, redirects, sitemap/robots and contact form before reporting cutover complete.

No production app deployment or traffic cutover has occurred yet.
