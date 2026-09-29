# LeaveCtrl V1 — Backup & Recovery Runbook

**Current Supabase tier:** Free  
**Production implication:** Supabase recommends Free-plan projects maintain their own regular off-site logical backups. Scheduled restorable daily backups and PITR are paid-tier capabilities.

## V1 minimum backup standard

Before production sign-off:

1. Take a logical database backup using the Supabase CLI / pg_dump-compatible workflow.
2. Store the backup outside Supabase in encrypted storage.
3. Keep at least the most recent 7 daily backup copies during controlled launch.
4. Test that a backup can be inspected/restored into a disposable environment before relying on it.
5. Record the backup timestamp and operator in the release evidence.

The LeaveCtrl organisation JSON export is useful for customer data portability, but it is **not** a substitute for a database backup because it does not represent the complete database/auth infrastructure.

## Supabase CLI workflow

Run from a trusted workstation or CI environment that has the required database credentials:

```bash
supabase db dump --project-ref nihvucwfzajudsejczzz -f leavectrl-schema-and-data.sql
```

If the installed Supabase CLI version requires different flags, use:

```bash
supabase db dump --help
```

and follow the current command syntax rather than guessing.

## Storage requirements

Backups should:

- be encrypted at rest;
- not be committed to GitHub;
- not be placed in the public application repository;
- have access restricted to authorised operational administrators;
- have a retention policy;
- be removed securely when no longer required.

## Recovery test

A recovery test should verify that the backup can reconstruct:

- organisation and employee records;
- memberships and role data;
- leave policies and entitlements;
- leave and TOIL ledgers;
- requests and approval history;
- reporting configuration;
- audit events.

Auth/session recovery must be evaluated separately because database restore behaviour and Auth operational state are not identical to a tenant JSON export.

## Recommended post-launch direction

For material production usage, move LeaveCtrl to a paid Supabase tier and evaluate scheduled backups/PITR based on acceptable recovery-point and recovery-time objectives.

Until then, manual off-site logical backup is a release operating control.
