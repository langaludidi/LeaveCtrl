# LeaveCtrl Free-Tier Database Recovery Runbook

## Purpose

LeaveCtrl deliberately remains on the Supabase Free plan until recurring revenue justifies managed backup features. This runbook provides an independent logical backup and recovery control.

## Backup schedule

GitHub Actions runs `.github/workflows/database-backup.yml` every day at 00:35 UTC (02:35 SAST) and can also be started manually.

The workflow requires one GitHub Actions secret named `SUPABASE_DB_URL`. Use the **Supabase Session Pooler** connection string on port 5432. The password must exist only in GitHub Secrets; never commit it to the repository, place it in a public variable, or paste it into documentation.

The workflow creates:
- a PostgreSQL custom-format logical dump;
- a schema-only SQL dump;
- a `pg_restore --list` inventory;
- SHA-256 checksums and UTC creation time.

GitHub retains each artifact for seven days. This gives seven rolling daily restore points once the schedule has run for a week.

## First activation

1. In Supabase, open **Connect** and select **Session pooler**.
2. Copy the connection string and substitute the database password.
3. In the LeaveCtrl GitHub repository, create an Actions secret named `SUPABASE_DB_URL`.
4. Run **Production database backup** manually once.
5. Confirm the run succeeds and that the backup artifact exists.
6. Download the first artifact and keep one additional offline copy in a secure location.

Do not treat the backup control as operational until steps 3-5 have succeeded.

## Recovery test

At least monthly, test one backup against a disposable PostgreSQL 17 database or a temporary recovery project. Never test restoration against production.

1. Download a backup artifact.
2. Verify checksums:
   `sha256sum -c SHA256SUMS`
3. Inspect the archive:
   `pg_restore --list leavectrl.dump`
4. Restore to the isolated target:
   `pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$RECOVERY_DB_URL" leavectrl.dump`
5. Verify key schemas/tables and representative row counts.
6. Record the test date, backup creation date, result, and any errors.

A backup is not considered proven recoverable until a restore test has passed.

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

This is a logical PostgreSQL backup, not Supabase PITR. A daily schedule means the theoretical recovery-point gap can approach 24 hours. GitHub artifact retention is intentionally short and is not a substitute for a long-term archive. Storage objects and external-provider configuration require separate recovery controls if LeaveCtrl begins storing material files outside PostgreSQL.

When revenue permits, move to a paid Supabase plan with managed daily backups and retain this independent backup as defence in depth.
