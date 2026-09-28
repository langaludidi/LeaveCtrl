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
