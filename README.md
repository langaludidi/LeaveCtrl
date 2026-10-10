# LeaveCtrl

South Africa-first leave and workforce availability platform.

## Current build

LeaveCtrl V1 is in controlled release hardening. The current implementation includes governed leave/TOIL workflows, organisation administration, employee onboarding, workforce availability, role boundaries, reporting/audit surfaces and responsive employee self-service.

## Run

```bash
npm install
npm run dev
```

## Architecture direction

- Next.js + TypeScript
- Supabase Auth/Postgres/RLS
- Vercel hosting
- Immutable leave ledger
- Versioned policy/statutory rule sets
- Tenant-level isolation

## Deployment

Authoritative repository: `langaludidi/LeaveCtrl`  
Production branch: `main`  
Canonical Vercel production project: `leave-ctrl`  
Canonical application domain: `https://app.leavectrl.co.za`

Public website: `https://leavectrl.co.za`

A duplicate Vercel project, `leave-ctrl-2eqn`, remains under controlled P0 reconciliation and must not be treated as an independent production path.

A READY preview or duplicate-project deployment is not production evidence. Production is current only when the exact approved `main` SHA is verified on `app.leavectrl.co.za`.

## Authentication contract

Production authentication email journeys are pinned to:

`https://app.leavectrl.co.za/auth/callback`

Ordinary Vercel preview deployments cannot initiate authentication email flows. Preview email authentication can only be enabled deliberately through the dedicated preview-auth flag and must remain on the same preview origin so PKCE state is preserved.

## Current acceptance checkpoint

The governed V1 vertical slice covers organisation bootstrap, employee-first onboarding, access invitations, manager assignment, leave submission, approval, withdrawal, cancellation, immutable ledger reconciliation, workforce calendar/request projection, statutory leave rules, TOIL and production authentication hardening.

Release sign-off remains gated by the documented P0 production deployment and authentication acceptance tests.
