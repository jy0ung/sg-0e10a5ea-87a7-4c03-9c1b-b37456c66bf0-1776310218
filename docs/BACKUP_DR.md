# Backup & Disaster Recovery

Scope: Supabase Postgres data, storage buckets, edge function code, and configuration.

## Backup posture

| Asset                      | Mechanism                            | Retention  | Owner          |
| -------------------------- | ------------------------------------ | ---------- | -------------- |
| Postgres (staging + prod)  | Supabase PITR (point-in-time)        | 7 days     | Platform team  |
| Daily logical dump         | `pg_dump` → encrypted S3 bucket       | 30 days    | Platform team  |
| Storage buckets            | Object versioning + lifecycle rule    | 30 days    | Platform team  |
| Edge function source       | Git (tagged releases)                 | Forever    | Engineering    |
| `.env.*` templates         | Git                                   | Forever    | Engineering    |
| Supabase project config    | `supabase/config.toml` in repo        | Forever    | Engineering    |

## Enablement (one-time per project)

```bash
# 1. Turn on PITR in the Supabase dashboard for staging and prod projects.
# 2. Configure .github/workflows/db-backup.yml with SUPABASE_DB_URL and
#    DB_BACKUP_GPG_PASSPHRASE secrets in the target environment.
# 3. Enable object versioning on every storage bucket.
```

## Nightly logical dump workflow

`.github/workflows/db-backup.yml` runs nightly and on manual dispatch. It uses
`pg_dump --format=custom`, encrypts the dump with GPG before upload, writes a
SHA-256 checksum, and optionally copies both files to S3 when the S3 secrets are
configured.

Required environment secrets:

- `SUPABASE_DB_URL` — Postgres connection string for the target Supabase project.
- `DB_BACKUP_GPG_PASSPHRASE` — passphrase used to symmetrically encrypt dumps.

Optional environment secrets:

- `DB_BACKUP_S3_BUCKET` — encrypted S3 destination bucket.
- `DB_BACKUP_S3_PREFIX` — key prefix; defaults to `flc-bi/db-backups`.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — required only for S3 upload.

If S3 is not configured, the workflow still uploads the encrypted dump and
checksum as short-lived GitHub Actions artifacts. Treat those artifacts as
sensitive even though the database content is encrypted.

## Restore drill (monthly)

1. Pick a timestamp T within the PITR window on the **production** project.
2. Use the Supabase dashboard to restore the DB into a **new** staging project at T.
3. Deploy the matching git tag to the restored project.
4. Run the e2e smoke suite (`npm run test:e2e`) against the restored stack.
5. Record pass/fail + duration in `docs/DR_DRILLS.md`.
6. Tear down the scratch staging project.

Target RTO: ≤ 2 hours. Target RPO: ≤ 5 minutes (PITR granularity).

## Incident-driven restore (prod)

1. Declare incident; freeze writes by disabling the frontend (put the app in
   maintenance mode via env flag `VITE_MAINTENANCE=1`).
2. Identify the last-known-good timestamp T.
3. Use Supabase dashboard → Database → Backups → "Restore to point in time".
4. Verify row counts on critical tables (`vehicles`, `sales_orders`,
   `invoices`, `import_batches`).
5. Re-enable writes; monitor Sentry for anomaly spike.
6. Postmortem within 48h.

## Non-database recovery

- Edge functions: `supabase functions deploy <name>` from the tagged git commit.
- Storage objects: restore via versioning; manual for bucket-level loss.
- Auth users: covered by the logical dump (auth schema).
