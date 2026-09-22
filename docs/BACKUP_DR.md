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
# 2. Configure DB_BACKUP_GPG_PASSPHRASE in each backup environment.
#    The backup reuses the existing Cloudflare Access + SSH deployment secrets
#    to stream pg_dump from the host-local Supabase database container.
# 3. Optionally configure S3 backup secrets for 30-day encrypted retention.
# 4. Enable object versioning on every storage bucket.
```

## Nightly logical dump workflow

`.github/workflows/db-backup.yml` runs nightly and on manual dispatch. It uses
`pg_dump --format=custom`, encrypts the dump with GPG before upload, writes a
SHA-256 checksum, and optionally copies both files to S3 when the S3 secrets are
configured.

Required environment secrets:

- `DB_BACKUP_GPG_PASSPHRASE` — dedicated passphrase used to symmetrically encrypt database dumps.
- Existing deployment tunnel secrets: `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `SSH_HOST`, `SSH_USER`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET`.

The workflow deliberately does **not** require a directly reachable `SUPABASE_DB_URL`. It runs `pg_dump` inside the host-local Supabase Postgres container and streams the archive over the encrypted Cloudflare Access/SSH tunnel into GPG on the runner. The unencrypted archive is not written to runner disk.

Optional environment secrets:

- `DB_BACKUP_S3_BUCKET` — encrypted S3 destination bucket.
- `DB_BACKUP_S3_PREFIX` — key prefix; defaults to `flc-bi/db-backups`.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — required only for S3 upload.

If S3 is not configured, the workflow still uploads the encrypted dump,
checksum, and non-sensitive restore metadata as short-lived GitHub Actions
artifacts. Treat those artifacts as sensitive even though the database content
is encrypted.

Before upload, the workflow verifies the encrypted-file checksum and decrypts
the archive as a stream into the database container's matching `pg_restore
--list`. This validates encryption/decryption and archive readability, but it
is **not** a substitute for the separate full restore drill.

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
