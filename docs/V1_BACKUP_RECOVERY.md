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

Run from a trusted workstation or CI environment that has the database connection string and current Supabase CLI.

Supabase's documented backup procedure separates roles, schema and data:

```bash
supabase db dump --db-url "[CONNECTION_STRING]" -f roles.sql --role-only
supabase db dump --db-url "[CONNECTION_STRING]" -f schema.sql
supabase db dump --db-url "[CONNECTION_STRING]" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

The connection string should come from the Supabase **Connect** panel. Use the Session pooler connection string by default unless the environment supports the direct database connection.

Before execution, run:

```bash
supabase db dump --help
```

to verify the installed CLI syntax. Never place the database password or connection string in this repository.

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

Auth/session recovery must be evaluated separately. Supabase's standard `db dump` excludes managed schemas such as Auth and Storage by default, so database logical backup is not a complete replacement for documenting/recreating platform Auth/SMTP configuration.

## Recommended post-launch direction

For material production usage, move LeaveCtrl to a paid Supabase tier and evaluate scheduled backups/PITR based on acceptable recovery-point and recovery-time objectives.

Until then, manual off-site logical backup is a release operating control.
