# LeaveCtrl — P0 Email Verification Enforcement & Authentication Gate Repair

**Status:** OPEN — NO-GO  
**Started:** 30 September 2026  
**Canonical domain:** `https://www.leavectrl.co.za`

## Evidence before repair

Production Auth records do **not** show a new user created during the reported
immediate-access test. At the time of investigation:

- production `auth.users` contained four email identities;
- all four had a native confirmation message timestamp and a later email
  confirmation timestamp;
- no user was confirmed without confirmation-message evidence;
- the newest Auth user had been created on 29 September 2026;
- the only `/signup` Auth event on 30 September was a repeated-signup event
  originating from the old `leave-ctrl-2eqn` preview path;
- production Vercel logs show a `POST /login` followed by middleware redirect
  from `/login` into the application, while no corresponding new Supabase
  `/signup` or new Auth session was created.

This means the observed production journey was not a newly created unverified
Supabase identity receiving a new-user session. A pre-existing/stale browser
authentication state was able to contaminate the registration experience and
make the result look like successful new-user authentication.

The application also had a defence gap: protected-route middleware accepted any
valid Supabase user id and did not independently require authoritative email
confirmation evidence.

## Repair

The source repair:

- clears a pre-existing browser session before sign-in or self-service signup so
  a failed/new registration cannot fall through as a previously authenticated
  account;
- never treats `signUp()` as authentication;
- if Supabase unexpectedly returns a signup session, the app revokes that local
  session and fails closed at the confirmation state;
- adds a dedicated `/confirm-email` state with the customer action
  **Send confirmation email again**;
- makes confirmation send-again responses account-enumeration neutral;
- changes protected server authorization from local claims-only gating to
  authoritative `auth.getUser()` verification;
- requires native Supabase evidence: `email_confirmed_at` plus either
  `confirmation_sent_at` or `invited_at`;
- re-checks that evidence after PKCE code exchange before onboarding routing;
- adds database-level membership/employee activation guards so an identity
  without native confirmation evidence cannot become an active LeaveCtrl
  organisation member or employee;
- keeps the existing canonical callback hardening unchanged.

## Supabase configuration conclusion

Historical and current Auth records are consistent with native email
confirmation having been enabled for the existing production users. The
connected Supabase interface does not expose the hosted Auth configuration flag
itself, so the dashboard **Confirm Email** setting still requires direct
configuration verification before P0 closure.

If that setting is found disabled, it must be enabled. The application and
database changes above deliberately fail closed even if it is accidentally
disabled again, but they are defence in depth and do not replace the native
Supabase control.

## Release gate

P0 remains open until a never-before-used production address proves:

signup → no protected access → confirmation email delivery → canonical callback
→ verified Auth state → session → onboarding → refresh → logout → password login.

No password, OTP, complete confirmation URL, access token or refresh token may
be recorded as evidence.
