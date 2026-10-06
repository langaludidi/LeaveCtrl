# LeaveCtrl domain cutover — 6 October 2026

Owner approved public launch and domain separation. Marketing is https://leavectrl.co.za, www redirects to the apex preserving path/query, and the authenticated app remains on Vercel at https://app.leavectrl.co.za.

## Production changes

- App Vercel project: leave-ctrl (prj_uaiL3oUv9H2XPUqGUyQpnIFkDKLH). Origin migration deployed from the previously running production commit 754233a70214a6150321b72ff2b2b0967d6e2b64, with no unrelated newer-main changes. App deployment dpl_2Dws6KC9ZBgBbfkKez9XoAbxhjRx contains commit 7ecd8c0c6c3b2220ae98180a771bc01eba0f6d72.
- Vercel production LEAVECTRL_APP_URL is https://app.leavectrl.co.za.
- Supabase project nihvucwfzajudsejczzz Site URL changed from a stale preview to https://app.leavectrl.co.za. Added exact /auth/callback and /auth/callback?** allowlist entries on this host, preserving the existing preview entry. Confirmation template uses ConfirmationURL.
- send-employee-invite Edge Function version 7 uses the app subdomain with verify_jwt=true and all existing authorization/token-validation controls preserved.
- Sites marketing deployment appgdep_6ac50f6e96e08191bd33ff1b2bf7c04b, source 4a3322094b55ced2f88a628ea8936ef95b3a5657, environment revision 18, public audience. Indexing enabled for substantive pages; legal drafts remain noindex. CONTACT_ALLOWED_ORIGIN changed to marketing apex.
- Apex and www removed only from the app project. App domain retained with Valid Configuration.

## DNS

Vercel nameservers retained. Added:

| Name | Type | Value | TTL |
| --- | --- | --- | --- |
| apex | A | 162.159.143.30 | 60 |
| apex | A | 172.66.3.26 | 60 |
| www | CNAME | custom-domains.chatgpt.site. | 60 |
| app | CNAME | cname.vercel-dns-017.com. | 60 |

Added four provider-supplied verification TXT records for apex/www. Sites reports both marketing custom domains active with active TLS. Existing Brevo DKIM (brevo1, brevo2), mail/img.mail/r.mail tracking, DMARC, Brevo verification, CAA and managed wildcard records preserved. No registrar, nameserver or email changes.

## Verification

12 focused app-origin/callback/invitation tests passed. Vercel production build succeeded. Marketing TypeScript, 32 rendered routes/1643 internal links and anchors, SEO/schema checks, 36 simulated contact checks, calculator/planner checks and production build passed.

Live HTTPS checks: marketing homepage, contact, guides, robots and 29-URL sitemap return 200. www/guides?source=cutover reaches apex with path/query intact; marketing /login?next=%2F reaches app login with its query intact. App login returns 200 and noindex/nofollow/nocache. App health returns status=ok. Callback without a code reaches the recovery page on the app host.

## Remaining limits and maintenance

- No real signup, reset, employee invitation or enquiry email was sent during these checks. End-to-end delivery and contact Turnstile hostname support need verification. Cloud browser observation prevented inspection of the marketing/Cloudflare pages, although live HTTP checks passed. Keep the contact-page email/phone and enquiry-download fallback available.
- Previously issued PKCE email links and old www sessions may need reissuing/sign-in because origin-scoped cookies do not transfer to app.
- This branch began from the exact deployed production baseline. Main is newer (2426813c1be0d54cb9a9ed4f46b8e1e89f37f9f5 at inspection). Carry these origin changes into main before the next main deployment so the old www authentication pin cannot return. Do not promote unrelated main changes as part of this DNS cutover.
- Legal draft content and unconfirmed Information Officer/PAIA details remain unadopted; do not invent legal facts. Paystack environment keys were preserved; checkout integration was not tested as part of domain cutover.
