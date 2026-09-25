# LeaveCtrl

South Africa-first leave and workforce availability platform.

## Current build

This first implementation slice contains:
- employee/manager home dashboard
- book-leave workflow with projected balance and coverage context
- organisation onboarding / South African leave-rule setup
- responsive teal-led design system based on the approved prototype

The app currently uses representative frontend data. Supabase auth, RLS, ledger persistence and workflow events are the next implementation slice.

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

Vercel project: `leave-ctrl-2eqn`

The active development branch is `build/foundation-v0.1`; production `main` remains intentionally unchanged until the preview build is validated.

Environment configuration completed for Vercel preview on 25 Sep 2026.


## Current acceptance checkpoint

The first governed vertical slice now covers organisation bootstrap, employee-first onboarding, access invitations, manager assignment, leave submission, approval, withdrawal, cancellation, immutable ledger reconciliation, and live calendar/request projection.


### V1 checkpoint — entitlement and jurisdiction slice
- employee records inherit active leave-policy entitlements automatically
- administrator-confirmed opening balances reconcile through the immutable ledger
- South African public holidays for 2026–2027 are seeded with provenance
- observed holidays and the 4 November 2026 election-day proclamation are represented explicitly
- public holidays are excluded from chargeable leave days by the booking engine
- employee activation email delivery is now attempted automatically, with recovery-link fallback
