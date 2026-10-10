# LeaveCtrl V1 — Release Checklist

**Status:** Release-candidate hardening  
**Current evidence:** [10 October 2026 assurance record](release-assurance/2026-10-10.md)
**Rule:** A checked item means evidence exists. It does not mean the entire product is production-signed-off.

The deployment and email-provider entries below retain historical evidence.
Use the dated assurance record for the current production SHA, canonical app
domain, backup proof and unresolved release gates. Historical unchecked entries
are not fresh provider findings.

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
- [x] Canonical production domain is publicly reachable.
- [x] Unauthenticated protected routes resolve to the login surface with no-store caching.
- [x] Baseline browser security headers verified live in production.
- [x] Canonical production project selected on deployment/domain evidence: `leave-ctrl`.
- [x] Last known-good production deployment identified: `dpl_Cej6MeE3U6s4GRESLzTHgbEZ6HUj` at commit `47a78c9c0675efc8d5698aae3a966a75efbef6db`.
- [ ] Complete project-admin settings/environment comparison between `leave-ctrl` and `leave-ctrl-2eqn`; current connected Vercel capability does not expose those settings safely.
- [ ] Deploy the exact approved current `main` commit through canonical project `leave-ctrl`.
- [ ] Verify `https://www.leavectrl.co.za` serves that exact approved commit.
- [ ] Complete post-deployment authenticated production smoke tests.
- [ ] Stop duplicate project `leave-ctrl-2eqn` from creating competing Git production deployments after canonical production is verified.
- [ ] Disconnect/archive/decommission `leave-ctrl-2eqn` only after confirming no unique configuration or rollback dependency remains.

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

## P0 deployment reconciliation gate

- [x] Production-domain divergence reproduced and documented.
- [x] `www.leavectrl.co.za` confirmed to resolve to `leave-ctrl` deployment `dpl_Cej6MeE3U6s4GRESLzTHgbEZ6HUj` at commit `47a78c9c0675efc8d5698aae3a966a75efbef6db`.
- [x] Both Vercel projects confirmed to receive deployments from `langaludidi/LeaveCtrl`.
- [x] Duplicate-project split deployment behaviour reproduced: a newer `main` commit succeeded on `leave-ctrl-2eqn` while `leave-ctrl` was rate-limited.
- [x] Repository/deployed Supabase migration parity restored on the P0 branch.
- [x] Cross-tenant, self-approval, manager-authorization and HR-mutation negative gates re-run successfully.
- [x] Annual leave and TOIL approval/cancellation/balance-restoration lifecycles re-run in rollback-only transactions.
- [x] Event-based leave direct-RPC balance-semantics defect fixed and regression-tested.
- [ ] Vercel free-plan build-rate limit has reset, allowing an exact release-candidate deployment.
- [ ] Canonical-project environment/settings presence and target scoping verified without revealing secret values.
- [ ] Exact approved `main` commit deployed to `leave-ctrl`.
- [ ] Production domain verified against exact commit and deployment ID.
- [ ] Post-deployment production smoke and browser/device regression complete.

## Go-live gate

Production sign-off requires the P0 deployment reconciliation gate above, all other unchecked release items, and controlled human UAT to pass without an unresolved P0/P1 issue.

## 9 October 2026 audit-remediation candidate

Branch: `release/audit-fixes-2026-10-09`, based on production/main
`f61096d46fe862c80c3ed8bad26bcbdcb7de9115`. The items below describe the
review candidate, not production acceptance. Earlier deployment/email entries
above are historical and must be reconciled against current provider evidence.

- [x] Annual liability uses only net annual reservations charged to the current entitlement; pending requests and future approved days are independent of reporting-year filters.
- [x] Screen and CSV use the same liability calculation and reject failed source reads.
- [x] Liability source reads paginate and bound ID batches; mixed leave types, partial days, cancellation and entitlement/year boundaries have regression protection.
- [x] Exact backup-cron path reaches its bearer authorization without a browser session; missing/invalid secrets fail closed.
- [x] Email-verification behavior has direct tests, including accidental auto-confirm rejection.
- [x] Signup displays all password requirements and links to privacy/terms information. Those links do not represent adoption of the current draft legal pages.
- [x] README application and authentication callback domains match `app.leavectrl.co.za`.
- [x] PR #67 reconciled and stacked on onboarding PR #65 (`2b1f2d06b54d565552f6f05e139954436a4e45d3`); combined reporting preserves historical exports, role auditing and optional founder employment. Both remain draft pending review and acceptance.
- [ ] Confirm current CI and preview result for the exact candidate commit, then approve its release through the existing process.
- [x] Legal documents approved by the product owner on 9 October 2026. Publication of the approved versions remains to be verified.
- [x] Free application-level breached-password checks prepared for signup and server-side recovery: padded hash-prefix lookup, no password/hash logging, timeout and provider failures block mutation.
- [ ] Accept and verify the compensating password control: native Supabase protection remains disabled on Free; direct Auth API requests bypass the application check. The product owner declined a plan upgrade.
- [ ] Activate an independent freshness checker and notification/heartbeat destination; GitHub incident checks alone cannot detect their own scheduling outage promptly.
- [ ] Complete signed-in employee, manager and HR/admin UAT: email confirmation/recovery, setup, invitation, submission, approval/cancellation, mixed-type financial reporting and CSV parity.
- [ ] Verify tenant/role boundaries and representative mobile/keyboard/accessibility journeys against the accepted candidate.
- [ ] After approved deployment, verify exact release SHA, invalid cron token rejection and a controlled successful encrypted backup/restore check. Do not confuse the successful GitHub logical restore rehearsal with acceptance of the Vercel Blob backup.
- [ ] Reconcile historical checklist entries with fresh evidence and close all remaining P0/P1 release blockers before sign-off.

Current production evidence from the audit: app health matches the base SHA;
GitHub logical backup run `37973478336` succeeded on 9 October; logical restore
rehearsal run `37781164715` succeeded on 8 October. These facts do not certify
email delivery, authentication recovery or the full release.
