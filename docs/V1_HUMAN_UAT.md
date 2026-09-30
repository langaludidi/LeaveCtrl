# LeaveCtrl V1 — Human UAT Runbook

**Purpose:** Complete the final role-based, browser/device acceptance pass after automated security and workflow UAT.

## Test environment

Use the authoritative production project:

- Application: `https://www.leavectrl.co.za` (use only after the P0 deployment reconciliation verifies the exact approved commit on this domain)
- Git branch: `main`
- Supabase project: LeaveCtrl / Leave Hub

Use dedicated UAT accounts only. Do not use live employee records for destructive test cases.

## Global pass criteria

Each role must confirm:

- login succeeds;
- only authorised navigation is visible;
- protected routes cannot be reached by typing a URL directly;
- page layout is usable at desktop, tablet and phone widths;
- keyboard focus remains visible;
- validation messages are understandable;
- no raw Supabase/Vercel/internal error is exposed;
- sign-out works;
- no cross-role or cross-employee confidential data is visible.

Any P0/P1 issue blocks release.

---

## Employee journey

1. Sign in as an ordinary employee.
2. Confirm dashboard shows own balances and relevant notifications only.
3. Open Company Calendar.
4. Confirm colleagues are visible as available/away without confidential absence detail.
5. Submit valid annual leave.
6. Confirm pending request appears in My Leave.
7. Withdraw the pending request and confirm balance restoration.
8. Submit a second leave request for manager approval.
9. After manager decision, confirm notification and decision reason/context.
10. Request cancellation of approved leave.
11. Verify cancellation status and final balance after decision.
12. If TOIL exists, submit and withdraw a TOIL request.
13. Attempt to navigate directly to HR/Admin/Audit-only surfaces and confirm access is denied or redirected.

**Pass:** Employee can self-service own leave/TOIL without seeing another employee's confidential details or privileged controls.

---

## Manager journey

1. Sign in as a manager with at least one direct report.
2. Confirm My Work/Requests shows only legitimate direct-report decisions plus own requests.
3. Review a direct report's leave request.
4. Approve one request.
5. Decline another and confirm a meaningful reason is required.
6. Verify team availability/coverage context.
7. Confirm the manager cannot approve their own leave or TOIL request.
8. Confirm unrelated employees outside current reporting scope do not expose private request detail.
9. Verify mobile decision buttons remain reachable and usable.

**Pass:** Manager can manage current reports only and cannot self-approve.

---

## HR / Organisation Admin journey

1. Sign in as HR/Admin.
2. Add an employee record.
3. Assign department, manager and schedule.
4. Verify assigning a reporting manager grants appropriate manager capability.
5. Create/reissue an employee invitation.
6. Confirm invitation delivery workflow reaches the intended email.
7. Test CSV preview with:
   - duplicate email;
   - invalid date;
   - unknown manager;
   - self-manager;
   - duplicate employee number.
8. Confirm invalid rows are blocked before import.
9. Configure or review leave policy/settings.
10. Record opening balance/remuneration where authorised.
11. Exit a test employee and verify access/lifecycle handling.
12. Export authorised organisation data and confirm the action is audited.

**Pass:** HR/Admin can perform governed workforce administration without bypassing validation or audit controls.

---

## Reporter journey

1. Sign in as Reporter.
2. Open Reports.
3. Confirm permitted workforce/remuneration reporting is visible.
4. Export an authorised report.
5. Confirm operational mutation controls are absent.
6. Attempt direct navigation to Admin mutation pages.
7. Confirm Reporter cannot alter remuneration, employees, policies, leave decisions or access controls.

**Pass:** Reporter has reporting visibility without operational write authority.

---

## Auditor journey

1. Sign in as Auditor.
2. Open Audit.
3. Confirm governance/audit history is visible.
4. Confirm confidential remuneration is not visible.
5. Confirm all operational mutation controls are absent.
6. Attempt direct navigation to mutation surfaces.

**Pass:** Auditor has read-only evidence access without HR/Admin or decision authority.

---

## Account recovery journey

1. From Login, open **Can't access your account?**
2. Request password reset.
3. Confirm the UI does not disclose whether an email account exists.
4. Follow a valid reset link.
5. Attempt a weak password and confirm rejection.
6. Use a password with 12+ characters, uppercase, lowercase, number and symbol.
7. Confirm password update succeeds.
8. Confirm the recovery session signs out after update.
9. Sign in with the new password.
10. Confirm prior refresh sessions are no longer usable.
11. Test **Send confirmation email again** for an unconfirmed UAT account.

**Pass:** Recovery is non-enumerating, strong-password enforced, and closes prior refresh sessions.

---

## Browser/device matrix

Minimum practical matrix:

| Surface | Chrome/Chromium | Safari |
| --- | --- | --- |
| Desktop >= 1280px | Required | Required |
| Tablet ~768px | Required | Required where available |
| Phone <= 480px | Required | Required where available |

At each size verify:

- navigation reachability;
- no clipped primary actions;
- calendar/table horizontal scrolling;
- modal/detail readability;
- form controls;
- status labels;
- focus visibility;
- no overlap between header actions.

---

## Release severity

### P0 — Release blocker
- cross-tenant data exposure;
- unauthorised mutation;
- broken login for all users;
- corrupt leave/TOIL balance;
- inability to approve/decline;
- production route inaccessible.

### P1 — Release blocker
- role can see confidential data it should not;
- key employee/manager/HR workflow unusable;
- mobile navigation makes a core area unreachable;
- account recovery unusable.

### P2 — Can release with documented follow-up
- cosmetic spacing issue;
- non-blocking copy issue;
- minor responsive imperfection with usable workaround.

---

## Final sign-off

V1 may move from Release Candidate to Production only when:

- all role journeys above pass;
- no open P0/P1 defect remains;
- CI is green on the release commit;
- latest authoritative Vercel deployment is READY;
- duplicate Vercel project cleanup is completed or explicitly scheduled with no DNS/alias ambiguity;
- external plan limitations are documented and accepted.
