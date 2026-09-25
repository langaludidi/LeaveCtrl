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
