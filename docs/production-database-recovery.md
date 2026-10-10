# LeaveCtrl Free-Tier Database Recovery Runbook

## Purpose

LeaveCtrl deliberately remains on the Supabase Free plan until recurring revenue justifies managed backup features. This runbook provides an independent logical backup and recovery control.

## Backup schedule

GitHub Actions runs `.github/workflows/database-backup.yml` every day at 00:35 UTC (02:35 SAST), can be started manually, and also runs when the backup workflow itself is changed on `main`.

The workflow requires one GitHub Actions repository secret named `SUPABASE_DB_PASSWORD`. Store the **raw Supabase database password only** in this secret. Do not URL-encode it, do not include the connection string, and never commit it to the repository.

The non-sensitive LeaveCtrl Session Pooler endpoint and username are fixed in the workflow:
- project ref: `nihvucwfzajudsejczzz`
- username: `postgres.nihvucwfzajudsejczzz`
- host: `aws-1-eu-west-1.pooler.supabase.com`
- port: `5432`

The workflow uses the official Supabase CLI backup method and creates:
- `roles.sql` for database roles required by the logical export;
- `schema.sql` for the application database schema;
- `data.sql` for application data;
- SHA-256 checksums and UTC creation time.

GitHub retains each artifact for seven days. This gives seven rolling daily restore points once the schedule has run for a week.

## First activation

1. In GitHub, open the LeaveCtrl repository.
2. Go to **Settings → Secrets and variables → Actions**.
3. Create a repository secret named `SUPABASE_DB_PASSWORD`.
4. Paste only the current Supabase database password as the secret value.
5. Run or trigger **Production database backup**.
6. Confirm the workflow succeeds and that a non-empty backup artifact exists.
7. Download the first artifact and keep one additional offline copy in a secure location.

Do not treat the backup control as operational until steps 3-6 have succeeded.

## Recovery test

At least monthly, test one backup against a disposable Supabase/PostgreSQL recovery target. Never test restoration against production.

1. Download and extract a backup artifact.
2. Verify checksums with `sha256sum -c SHA256SUMS`.
3. Prepare a disposable recovery database with the required Supabase extensions/services.
4. Restore with `psql`, using the isolated recovery connection string:

   `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "$RECOVERY_DB_URL"`

5. Verify key schemas/tables and representative row counts, including organisations, memberships, employees, leave requests, entitlement/ledger records, audit records, billing records and authentication identities where applicable.
6. Record the test date, backup creation date, result, and any errors.

A backup is not considered proven recoverable until a restore test has passed.

The retained-backup restore workflow downloads the actual latest successful
artifact, verifies all three SQL checksums, restores it into isolated native
Supabase, and compares every exported COPY table's row count. It runs only from
reviewed `main` code through a scheduled run, a relevant main push, or a manual
dispatch targeting main. Pull-request code must never download production
archives. The archive includes native Auth password hashes and session data;
protect downloads and never publish dump files or restore logs as artifacts.
This is distinct from the encrypted Vercel Admin API snapshot, which excludes
password hashes and requires password reset or reinvitation after recovery.

## Incident recovery

If production data is lost or corrupted:

1. Stop or restrict application writes.
2. Preserve the current database state before attempting recovery.
3. Identify the newest known-good backup before the incident.
4. Restore it to an isolated recovery target first.
5. Validate authentication data, organisation memberships, employees, leave requests, balances/ledger, audit records and billing records.
6. Determine the recovery point objective gap: changes after the backup time may need manual reconstruction.
7. Only after validation, plan the production recovery/cutover.
8. Re-test LeaveCtrl authentication, tenant isolation, leave workflows and billing before reopening writes.

## Limitations

This is a logical backup, not Supabase Point-in-Time Recovery. A daily schedule means the theoretical recovery-point gap can approach 24 hours. GitHub artifact retention is intentionally short and is not a substitute for a long-term archive. Supabase Storage objects and external-provider configuration require separate recovery controls if LeaveCtrl begins storing material files outside PostgreSQL.

When revenue permits, move to a paid Supabase plan with managed daily backups and retain this independent backup as defence in depth.
