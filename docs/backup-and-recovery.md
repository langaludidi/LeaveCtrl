# LeaveCtrl independent backup and recovery

LeaveCtrl remains on Supabase Free. Production recovery therefore uses application-controlled encrypted data snapshots stored outside Supabase.

## Backup contents

Each snapshot contains:

- every table listed in `config/backup-tables.json`;
- Supabase Auth user metadata available through the Admin API;
- private billing-operator state;
- row counts, generation timestamp, backup ID and Git commit.

Auth password hashes are intentionally not exported by the Admin API. After a disaster restore, users must reset their passwords or be re-invited.

The database schema is not duplicated inside the snapshot. The authoritative schema is the migration history in GitHub. The backup records the production Git commit so the matching schema can be recreated before data restoration.

## Encryption

Snapshots are compressed with gzip and encrypted with AES-256-GCM using `BACKUP_ENCRYPTION_KEY`.

Keep an offline recovery copy of that key outside Vercel. Without it, the encrypted snapshots cannot be recovered.

## Retention

The production cron writes rolling private Blob paths:

- 7 daily slots;
- 4 weekly slots;
- 3 monthly slots.

This caps retention at 14 snapshots instead of growing storage indefinitely.

## Required Vercel configuration

Create a private Blob store on the canonical `leave-ctrl` project. After creation, Vercel supplies Blob credentials to the project.

Production also requires:

- `BACKUP_ENCRYPTION_KEY` — base64-encoded 32-byte key;
- `CRON_SECRET` — high-entropy secret used by Vercel Cron.

The cron route is `/api/cron/database-backup` and is scheduled daily in `vercel.json`.

## Integrity verification

Download a private `.lcbak` file and run:

```bash
BACKUP_ENCRYPTION_KEY='<recovery-key>' npm run backup:verify -- ./backup.lcbak
```

The command decrypts, authenticates, decompresses and parses the snapshot and prints only metadata/counts.

## Recovery outline

1. Create or recover a Supabase project.
2. Deploy the Git commit recorded in the selected backup and apply migrations.
3. Verify the resulting schema before importing data.
4. Decrypt and validate the snapshot.
5. Restore application data in a controlled maintenance window.
6. Recreate/reinvite Auth users as required; password hashes are not present in the application-level snapshot.
7. Run tenant-isolation, authentication and leave-balance reconciliation checks before reopening writes.

A full restore rehearsal should be performed periodically against a disposable project. The daily snapshot job proves data capture and encrypted-archive integrity; it does not replace a restore rehearsal.
