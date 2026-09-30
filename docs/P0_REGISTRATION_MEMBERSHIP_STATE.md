# LeaveCtrl — P0 Registration Intent, Membership & Role-Safe Onboarding

**Status:** OPEN — NO-GO  
**Date:** 30 September 2026

## Confirmed forensic evidence

The production evidence does not show a newly created unverified Auth identity
being automatically promoted into LeaveCtrl.

The newest production Auth identity was created at
\`2026-09-29 18:22:53Z\`. Native confirmation mail was recorded immediately,
email ownership was confirmed at \`18:24:32Z\`, and organisation/membership/
employee records were created later at \`18:33:04Z\` by the governed
\`organisation.bootstrapped\` transaction.

That controlled transaction created exactly two memberships for the creator:

- \`employee\`
- \`org_admin\`

The role was not selected by the user. It was assigned because a verified,
no-membership identity explicitly created a new organisation. The same
transaction created the creator's employee record.

A second confirmed Auth identity in production has **zero** organisation
memberships and **zero** employee records. This is direct evidence that Auth
identity creation itself does not manufacture LeaveCtrl membership.

For the later reported "new email → immediate application access" test, no new
Auth user and no new Auth session were created at the corresponding time.
Production application logs showed browser navigation through the login route,
while Supabase recorded no new signup. This is consistent with the previously
confirmed stale/pre-existing browser session contaminating the registration
experience rather than a new identity being granted membership.

## Architectural gap found

Even though the database did not automatically create membership from Auth
signup, the application shell previously treated a valid authenticated user id
as sufficient to pass middleware. Membership and onboarding were resolved only
later by individual pages. That made the product state machine ambiguous and
could allow an existing session to look like successful registration.

Public signup copy also did not clearly distinguish:

- creating a new organisation;
- joining through a trusted invitation; and
- signing in as an existing member.

## Authoritative state machine

Normal application access now resolves in this order:

1. authenticated identity;
2. native email verification evidence;
3. active organisation membership;
4. exactly one unambiguous organisation context under the current V1 tenant
   contract;
5. active employee context;
6. authoritative role/capability set;
7. organisation onboarding state;
8. employee welcome/onboarding state;
9. normal application workspace.

Authentication alone never implies membership.

## Public organisation creation

Public self-registration is presented as **Create your LeaveCtrl organisation**.

No role selector exists.

After verification, a no-membership identity may enter organisation onboarding.
The controlled \`bootstrap_organisation\` transaction:

- requires verified email ownership;
- requires the submitted email to match the verified identity;
- rejects an identity already linked to an active organisation;
- creates one new organisation;
- assigns fixed \`employee + org_admin\` memberships;
- creates the creator employee record;
- seeds the South Africa-first schedule, public holidays and statutory leave
  baseline;
- records an auditable \`organisation.bootstrapped\` event;
- leaves organisation onboarding incomplete until the creator reviews and
  confirms the core readiness controls.

The creator cannot supply a role to this transaction.

## Organisation onboarding

New organisations are gated from ordinary application operations until core
readiness is explicitly completed.

Core completion currently verifies:

- an active employee exists;
- an active work schedule assignment exists;
- an annual leave policy exists;
- the public-holiday calendar exists.

Advanced departments, locations, extra leave types, TOIL and coverage rules can
continue progressively after the core gate.

Completion is restricted to \`org_admin\`, persisted on the organisation and
recorded as \`organisation.onboarding.completed\`.

Established pre-migration organisations are backfilled as complete so the P0
does not lock existing tenants out.

## Invitation / employee onboarding

Invitation context remains authoritative.

The claimant supplies only the one-time invitation token. The database resolves:

- organisation;
- employee record;
- invitation status/expiry;
- employee membership;
- manager capability where the trusted invitation/reporting-line configuration
  says it applies.

The claimant cannot supply organisation id or role.

Claiming requires verified email ownership and an exact invitation-email match.
Accepted, expired and sibling retry tokens cannot be reused.

After claim, employees and managers enter the one-time employee Welcome flow.
A manager remains the same employee identity with additive manager capability.

## No-membership behaviour

A verified identity with no active LeaveCtrl membership is routed to an explicit
**No organisation membership yet** state.

From there the legitimate paths are:

- create a new LeaveCtrl organisation; or
- reopen a trusted invitation to join an existing organisation.

It does not enter My Leave.

## Multi-role and organisation-context safety

Roles remain additive membership capabilities, for example:

- employee;
- employee + manager;
- employee + HR;
- employee + org admin.

Navigation does not grant authority; database/RPC authorization remains
authoritative.

The current production data model still enforces one active organisation
identity. The new access resolver nevertheless treats more than one returned
organisation context as an explicit ambiguous state and fails closed rather
than silently choosing or merging tenants. Enabling true multi-organisation
membership requires the remaining privileged RPCs to become explicitly
organisation-context aware; this P0 does not weaken tenant isolation to enable
it prematurely.

## Production acceptance still required

This source repair is not release sign-off. Real production acceptance must
still prove:

- new organisation creator;
- invited employee;
- invited manager;
- existing user;
- verified user with no membership;
- privilege-escalation denial;
- cross-tenant denial;
- email-confirmation delivery and canonical callback.

No password, OTP, complete magic link, access token or refresh token is to be
recorded.
