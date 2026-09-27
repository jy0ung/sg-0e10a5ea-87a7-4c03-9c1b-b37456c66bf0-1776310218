# Backup & Disaster Recovery

Scope: Supabase Postgres data, storage buckets, edge function code, and configuration.

## Backup posture

The table below is the **target recovery posture**, not proof that each production control is currently enabled. Production PITR, storage versioning, backup delivery, retention, and restore evidence must be verified operationally.

| Asset                      | Target mechanism                      | Target retention | Owner          | Current evidence |
| -------------------------- | ------------------------------------- | ---------------- | -------------- | ---------------- |
| Postgres (staging + prod)  | Self-hosted base backups + archived WAL for PITR | 7 days | Platform team | Production `archive_mode=off` on 2026-09-27; not enabled |
| Daily logical dump         | `pg_dump` → GPG-encrypted artifact/S3 | 30 days in S3    | Platform team  | Direct DB URL and Cloudflare Access SSH transports implemented; production encrypted-run evidence still open |
| Storage buckets            | Off-host versioned object storage or verified file-backend replication | 30 days | Platform team | Production uses local file backend; no off-host versioning evidence |
| Edge function source       | Git (tagged releases)                  | Forever          | Engineering    | Repository-backed |
| `.env.*` templates         | Git                                    | Forever          | Engineering    | Repository-backed |
| Supabase project config    | `supabase/config.toml` in repo         | Forever          | Engineering    | Repository-backed |

## Enablement (one-time per project)

```bash
# 1. For this self-hosted deployment, configure a tested PostgreSQL base-backup
#    and continuous WAL-archiving path to retained off-host storage. Managed
#    Supabase dashboard PITR is not available for a self-hosted stack.
# 2. Configure .github/workflows/db-backup.yml with DB_BACKUP_GPG_PASSPHRASE
#    plus either SUPABASE_DB_URL or the complete Cloudflare Access SSH secret set.
# 3. Move Storage to a versioned off-host S3 backend, or replicate the current
#    file backend to versioned off-host storage and prove object recovery.
```

## Nightly logical dump workflow

`.github/workflows/db-backup.yml` runs nightly and on manual dispatch. It uses
`pg_dump --format=custom`, encrypts the dump with GPG before upload, writes a
SHA-256 checksum, and optionally copies both files to S3 when the S3 secrets are
configured.

Required environment secrets:

- `DB_BACKUP_GPG_PASSPHRASE` — passphrase used to symmetrically encrypt dumps.
- Backup transport: either
  - `SUPABASE_DB_URL` for direct Postgres access, or
  - the complete Cloudflare Access SSH set already used by production operations: `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `SSH_HOST`, `SSH_USER`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` (with `SSH_PORT` optional/defaulting to 22), plus the `DB_BACKUP_CONTAINER` environment variable set to the exact production Supabase DB container name.

In SSH mode the runner does not receive a production DB URL. The workflow connects through Cloudflare Access, verifies the configured production database container is running, runs `pg_dump` inside that exact container, and streams the custom-format dump back to the runner before encryption. Never pick the first `supabase_db_*` container: production and local HRMS stacks can run on the same host.

Optional environment secrets:

- `DB_BACKUP_S3_BUCKET` — encrypted S3 destination bucket.
- `DB_BACKUP_S3_PREFIX` — key prefix; defaults to `flc-bi/db-backups`.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — required only for S3 upload.

If S3 is not configured, the workflow still uploads the encrypted dump,
checksum, and non-sensitive restore metadata as short-lived GitHub Actions artifacts. Treat those artifacts as
sensitive even though the database content is encrypted.

### Current production blocker — 2026-09-22

PR #88 / `c5f3153` added the Cloudflare Access SSH fallback while preserving mandatory encryption, checksum validation, plaintext cleanup, and encrypted-only artifact upload. The workflow still deliberately fails before `pg_dump` unless `DB_BACKUP_GPG_PASSPHRASE` is present and one complete backup transport is available. Production secret configuration and an actual successful encrypted production run have not been evidenced in-repo. Do not weaken encryption, invent credentials, or mark backup readiness complete based only on workflow code.

Backup readiness requires evidence of:
1. a successful encrypted production dump;
2. checksum verification;
3. retention/destination confirmation;
4. an isolated restore;
5. application/schema smoke against the restored target;
6. measured RTO/RPO recorded in `docs/DR_DRILLS.md`.

## Isolated logical restore drill

`.github/workflows/db-restore-drill.yml` is a **manual-only** restore-safety workflow. It consumes a successful encrypted Database Backup artifact, verifies its checksum/environment metadata, starts a scratch Postgres container with `--network none`, decrypts directly into `pg_restore` without writing a plaintext restore dump, verifies critical UBS relations plus the Supabase migration ledger, records restore duration/logical-backup age, and destroys the scratch container and volume on every outcome.

For SSH-produced backups the workflow can reuse the recorded Supabase Postgres image. For a direct-DB backup whose metadata does not contain an image, the operator must provide an explicit `restore_image` input. This workflow does not connect to production and does not replace PITR evidence.

A successful workflow run is required before marking the logical restore drill complete.

## PITR restore drill (monthly)

1. Pick a timestamp T within the retained **production** base-backup/WAL window.
2. Restore the appropriate base backup and archived WAL into a new isolated PostgreSQL cluster, stopping replay at T. Never replay into the live production data directory.
3. Connect a matching application image or schema-smoke harness to the restored cluster.
4. Check the migration ledger, critical UBS relations and a bounded authenticated smoke path. Verify the restored timestamp is at or before T.
5. Record pass/fail, recovery duration and effective RPO in `docs/DR_DRILLS.md`.
6. Destroy the isolated cluster after evidence review.

Target RTO: ≤ 2 hours. Target RPO: ≤ 5 minutes (PITR granularity).

## Incident-driven restore (prod)

1. Declare incident; freeze writes by disabling the frontend (put the app in
   maintenance mode via env flag `VITE_MAINTENANCE=1`).
2. Identify the last-known-good timestamp T.
3. Select a verified off-host base backup and WAL archive; restore to an isolated replacement cluster at T. Fail over only after data and schema checks pass.
4. Verify row counts on critical tables (`vehicles`, `sales_orders`,
   `invoices`, `import_batches`).
5. Re-enable writes; monitor Sentry for anomaly spike.
6. Postmortem within 48h.

## Non-database recovery

- Edge functions: `supabase functions deploy <name>` from the tagged git commit.
- Storage objects: restore via versioning; manual for bucket-level loss.
- Auth users: covered by the logical dump (auth schema).

For the current self-hosted architecture, follow [PostgreSQL's continuous archiving and PITR procedure](https://www.postgresql.org/docs/17/continuous-archiving.html) and [Supabase's self-hosted Storage backend guidance](https://supabase.com/docs/guides/self-hosting/self-hosted-s3). Supabase's managed-project PITR dashboard does not operate this host-local stack.
