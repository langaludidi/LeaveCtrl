# LeaveCtrl V1 — Release Checklist

**Status:** Release-candidate hardening  
**Current engineering estimate:** ~95% complete  
**Rule:** A checked item means evidence exists. It does not mean the entire product is production-signed-off.

## Security and data isolation

- [x] All public tables have RLS enabled.
- [x] Public views use security-invoker semantics.
- [x] Anonymous public-table reads and writes are closed.
- [x] Generic authenticated public-table writes are closed.
- [x] Governed application mutations run through authorised RPCs.
- [x] Ordinary employee full-record visibility is limited to self.
- [x] Managers are restricted to current reporting scope.
- [x] Cross-organisation employee access negative test passes.
- [x] Reporter and Auditor boundaries verified.
- [x] Confidential remuneration is hidden from ordinary employees, managers and auditors.
- [x] Self-approval is rejected.
- [x] Invitation email/linkage boundaries verified.
- [x] Invitation delivery validation is service-role only.
- [x] Supabase Free-plan limitation documented: leaked-password protection is Pro-only.
- [x] Compensating application password policy added for new/reset passwords (12+ characters, upper/lower/number/symbol).
- [x] Password recovery revokes refresh sessions globally after reset.

## Leave workflow

- [x] Submit and reserve balance.
- [x] Approve.
- [x] Decline with mandatory reason.
- [x] Decline releases reservation.
- [x] Withdrawal releases reservation.
- [x] Cancellation request.
- [x] Cancellation decline preserves approved absence.
- [x] Cancellation approval restores entitlement.
- [x] Duplicate/stale decision rejected.
- [x] Leave cannot overlap active TOIL on the same date.
- [x] Employee notifications include decision context and decline reason.

## TOIL workflow

- [x] TOIL earned from approved overtime.
- [x] Submit and reserve hours.
- [x] Approve.
- [x] Decline with mandatory reason.
- [x] Withdrawal releases reservation.
- [x] Cancellation decline preserves approved usage.
- [x] Cancellation approval restores TOIL.
- [x] Duplicate/stale decision rejected.
- [x] TOIL cannot overlap active leave on the same date.
- [x] Self-approval rejected.

## Build and deployment

- [x] package-lock.json committed.
- [x] CI uses npm ci.
- [x] Unit/security contract tests run in CI.
- [x] Dependency audit runs in CI.
- [x] Production Next.js build runs in CI.
- [x] Recent production deployments are READY.
- [x] Recent Vercel runtime-error check found no runtime errors.
- [x] Canonical production alias is publicly reachable.
- [x] Unauthenticated protected routes resolve to the login surface with no-store caching.
- [x] Baseline browser security headers verified live in production.
- [x] Latest production deployment is READY on the authoritative Vercel project.
- [x] Recent production runtime-error check is clean.
- [x] Authoritative Vercel production project selected: `leave-ctrl` (`leave-ctrl.vercel.app`).
- [ ] Disconnect/decommission duplicate Vercel project `leave-ctrl-2eqn` (requires Vercel project-admin write capability).

## Responsive and usability

- [x] Static responsive breakpoints reviewed.
- [x] Mobile navigation no longer hides authorised destinations.
- [x] Key mobile touch targets hardened.
- [x] Visible keyboard focus states added for interactive controls.
- [x] Narrow-phone topbar collision risk removed.
- [x] Wide tables/calendars use horizontal overflow.
- [ ] Browser-driven desktop regression.
- [ ] Browser-driven tablet regression.
- [ ] Browser-driven mobile regression.
- [ ] Safari regression.
- [ ] Chrome/Chromium regression.
- [ ] Keyboard/focus walkthrough.
- [ ] Controlled human UAT for Employee.
- [ ] Controlled human UAT for Manager.
- [ ] Controlled human UAT for HR/Admin.
- [ ] Controlled human UAT for Reporter.
- [ ] Controlled human UAT for Auditor.

## Backup and recovery

- [x] Free-tier backup limitation documented.
- [x] Backup/recovery runbook committed.
- [ ] Fresh logical database backup taken and stored off-site before production sign-off.
- [ ] Recovery copy inspected/tested in a disposable environment.

## Email delivery

- [ ] Correct Supabase Auth SMTP host from `smtp-reply.brevo.com` to `smtp-relay.brevo.com`.
- [ ] Re-test password recovery after SMTP correction and confirm Auth `/recover` returns 200.
- [ ] Confirm a recovery email is received and completes the reset flow.

## Go-live gate

Production sign-off requires all unchecked security/deployment items resolved and controlled human UAT completed without an unresolved P0/P1 issue.
