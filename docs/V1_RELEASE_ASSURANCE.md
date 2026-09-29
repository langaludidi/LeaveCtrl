# LeaveCtrl V1 — Release Assurance Evidence

**Date:** 28 September 2026  
**Build stage:** Late V1 hardening / controlled UAT preparation  
**Evidence policy:** Completion advances only when release risk is demonstrably retired.

## Transactional production-database UAT completed

The checks below were executed against the authoritative Supabase project inside explicit transactions and rolled back. No UAT leave, TOIL, notification, invitation, remuneration or organisation probe data was retained.

### Role and tenant isolation — PASS

- Manager can read their own full employee record and their current direct report.
- Manager cannot read a synthetic second organisation's employee.
- Manager cannot read confidential remuneration.
- Manager cannot read the governance audit log.
- Ordinary employee can read only their own full employee record.
- Ordinary employee can still obtain the privacy-safe workforce directory required by the Company Calendar.
- Ordinary employee cannot read remuneration or audit events.
- Reporter can read workforce reporting scope and confidential remuneration required for reporting.
- Reporter cannot read the governance audit log and cannot invoke HR/Admin remuneration mutation RPCs.
- Auditor can read workforce/audit scope.
- Auditor cannot read confidential remuneration and cannot invoke HR/Admin remuneration mutation RPCs.
- Direct client table mutation remains denied; application mutations are governed through RPCs.
- A user can mark only their own notification as read.

### Leave lifecycle — PASS

Verified with rolled-back one-day Annual Leave transactions:

- request submission;
- balance reservation;
- manager approval;
- approved balance integrity;
- decline without reason rejected at the database boundary;
- decline with a reason succeeds;
- declined request releases reserved leave;
- self-approval rejected;
- organisation-admin fallback decision works;
- employee decision notification routing works;
- decline reason appears in the employee notification;
- approved leave cancellation request;
- cancellation decline requires a reason;
- declined cancellation preserves approved leave and balance;
- approved cancellation restores entitlement;
- pending leave withdrawal releases the reservation;
- duplicate/stale leave decisions are rejected without a second ledger effect;
- leave/TOIL mutual-exclusion is enforced in both directions on the same working date.

### TOIL lifecycle — PASS

Verified using rolled-back overtime-to-TOIL credits:

- auditable TOIL earning from approved overtime;
- TOIL request reservation;
- manager approval;
- approved usage ledger position;
- cancellation request;
- cancellation decline reason enforcement;
- declined cancellation preserves approved TOIL usage;
- approved cancellation restores TOIL;
- self-approval rejected;
- organisation-admin fallback decision works;
- declined TOIL request releases reservation;
- pending TOIL withdrawal releases reservation;
- duplicate/stale TOIL decisions are rejected without a second ledger effect;
- workflow notifications are generated across submit/decision/cancellation events.

### Invitation and access boundary — PASS

- Wrong-email invitation claim rejected.
- An already-linked account cannot claim a fresh employee invitation.
- Invitation delivery validation is not executable by authenticated clients.
- Invitation delivery validation remains executable by `service_role` for the hardened Edge Function.

### Database/API boundary — PASS

- All 32 public tables currently have RLS enabled.
- All four public views are `security_invoker`.
- Anonymous table SELECT/INSERT/UPDATE/DELETE privileges are closed.
- Generic authenticated INSERT/UPDATE/DELETE privileges are closed.
- The one intentional direct authenticated write is `notifications.read_at`, constrained by RLS.
- Authenticated-executable `SECURITY DEFINER` RPCs all contain a direct `auth.uid()` authentication check.
- Authenticated/anonymous/public roles do not have CREATE privilege on the `public` schema.

## Automated release guards

CI now includes tests that prevent:

- application code from adding direct public-table writes outside the governed notification-read exception;
- removal of the RPC-only mutation migration boundary;
- reopening anonymous public-table reads;
- exposing invitation-delivery validation to authenticated browsers;
- loss of the privacy-safe workforce directory migration;
- regression from deterministic `npm ci` back to nondeterministic dependency installation.

## Current external/manual release gates

These are not code defects but remain before production sign-off:

1. Enable **Supabase Auth leaked-password protection**.
2. Resolve the duplicate Vercel production project connection. Both `leave-ctrl` and `leave-ctrl-2eqn` currently deploy the same GitHub `main` branch. One should be retained as the authoritative production project and the duplicate disconnected/decommissioned.
3. Complete practical cross-browser/device UI regression. Static responsive review is complete and identified/fixed mobile navigation reachability plus mobile touch-target issues; browser automation is still required for final visual sign-off.
4. Run controlled human UAT for the principal Employee, Manager, HR/Admin, Reporter and Auditor journeys.
5. Complete the final release checklist and production sign-off.

## Security-advisor disposition

The Supabase security advisor currently reports authenticated-executable `SECURITY DEFINER` RPC warnings. These functions are intentionally exposed application commands/read models. They are not being mass-revoked merely to silence the advisor. Current review confirms the exposed functions authenticate through `auth.uid()`; mutations additionally enforce organisation/role/manager ownership as appropriate.

The remaining Auth advisor warning is leaked-password protection, which requires the external Auth setting noted above.


## Responsive static audit — PASS WITH VISUAL UAT REMAINING

- All authorised mobile navigation destinations remain reachable through a horizontally scrollable navigation rail.
- The prior <=480px rule that hid navigation destinations after the fourth item has been removed.
- Mobile notification, sign-out, approve/decline and request-review controls now preserve practical touch targets.
- Tables and the workforce calendar retain horizontal overflow containers rather than forcing destructive column compression.
- CI includes a responsive-shell contract test that prevents positional hiding of navigation links and protects the main mobile touch-target rules.

This is a static implementation audit, not a claim of cross-browser visual certification. Final physical/device or browser-driven UAT remains a release gate.


## Production alias and unauthenticated route guard — PASS

- The canonical production alias `https://leave-ctrl.vercel.app` is publicly reachable; Vercel Authentication on generated deployment URLs does not block the production alias.
- Unauthenticated requests to `/`, `/team`, `/reports`, `/audit` and `/setup` resolve to the LeaveCtrl login route.
- Login responses are served with private/no-cache/no-store semantics.
- The same source repository is still connected to two Vercel production projects; duplicate-project cleanup remains an operational release gate, not a public-access blocker.

## Keyboard and narrow-phone static audit — PASS WITH HUMAN VISUAL UAT REMAINING

- Global `:focus-visible` styling now covers links, buttons, inputs, selects and textareas.
- At narrow phone widths the decorative topbar context is removed so notification/profile/sign-out controls do not collide.
- These protections are covered by the responsive-shell CI contract.


## Account recovery — PASS

- Password reset and confirmation resend flows are merged into `main`.
- Password reset completion is handled by the dedicated `/reset-password` page.
- Login rendering and server actions use the shared hardened internal-path validator.
- Password changes explicitly sign out with global scope, revoking refresh sessions across devices after recovery.
- New account and recovered passwords use a shared application policy: at least 12 characters with uppercase, lowercase, numeric and symbol variety.
- Existing users are not blocked at sign-in merely because their historical password predates the stronger new-password policy.
- Recovery contract and password-policy tests are enforced by CI.

## Supabase Free-plan security disposition

The authoritative Supabase organisation `Leave Hub` is on the **Free** plan. Supabase leaked-password protection is a Pro-plan feature, so the advisor warning cannot be cleared without a plan upgrade. This is therefore treated as an external plan limitation rather than an unresolved V1 code defect.

Compensating controls currently implemented:
- stronger new/reset password policy in LeaveCtrl;
- generic authentication error messages;
- production-safe callback origin validation;
- hardened internal redirect validation;
- global session revocation after password recovery.

An upgrade to Supabase Pro would still be beneficial later because it would add server-side leaked-password rejection and additional session-control options.

## Authoritative Vercel project decision

The production project is **`leave-ctrl`** because the public production alias `leave-ctrl.vercel.app` resolves there. The second project, **`leave-ctrl-2eqn`**, is a duplicate deployment target and should be disconnected/decommissioned after final verification.

The connected Vercel capability available in this build session exposes project/deployment reads but not project deletion/disconnection, so duplicate cleanup remains an external project-admin action rather than an application build task.


## Browser security headers — PASS

Verified on the live production alias after deployment:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

The header contract is enforced in CI.

## Current release-head verification

- CI: PASS (install, unit/security tests, dependency audit, production build).
- Authoritative Vercel project: `leave-ctrl`.
- Latest production deployment: READY.
- Recent Vercel runtime errors: none.
- Recent production request statuses observed: normal 200 and 307 responses only.
- Supabase performance advisor: informational unused-index notices only; no indexes removed at this stage because usage volume is still too low for safe pruning.


## Backup and recovery posture

The Supabase organisation is on the Free plan. Current Supabase documentation recommends Free-tier projects regularly export their database using the Supabase CLI and maintain off-site backups. Paid tiers provide dashboard-accessible scheduled backups and can add PITR.

A dedicated `docs/V1_BACKUP_RECOVERY.md` runbook now defines the minimum V1 backup and recovery procedure. The existing LeaveCtrl organisation JSON export is explicitly not treated as a full database backup.

The remaining release operation is to take and verify a fresh logical backup before final production sign-off. This requires database credentials in a trusted operator/CI environment and is therefore not performed from the application runtime or committed into the repository.
