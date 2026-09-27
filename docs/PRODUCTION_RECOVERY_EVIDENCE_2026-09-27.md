# Production recovery and release evidence — 2026-09-27

This record separates controls verified in production from repository code that has only passed tests. It contains configuration names and aggregate status only; no credentials or business rows.

## Verified controls

- GitHub `main` branch protection now requires PRs, resolved conversations and the six CI jobs (`Lint`, `Web App`, `Mobile App (hrms-mobile)`, `Security Audit`, `Production Readiness (local Supabase)`, `E2E (Playwright)`). Protection applies to admins; force pushes and branch deletion are disabled.
- The `production` GitHub environment now accepts deployments only from protected branches. The application deployment workflow remains manual dispatch.
- PR #95 merged at `9f0da4d` after all its PR CI jobs passed. This is repository evidence; it is not a production deployment.

## Recovery gaps confirmed by live inspection

- The scheduled production `Database Backup` run on 2026-09-26 failed in `Resolve backup transport`, before any encrypted dump or artifact. The production GitHub environment has no `DB_BACKUP_GPG_PASSPHRASE`, `DB_BACKUP_S3_BUCKET` or AWS backup secrets configured. It does have the SSH/Cloudflare Access credential entries used by the transport. No successful production backup run or restore-drill record was found.
- The host has two Supabase database containers. Selecting the first `supabase_db_*` container can produce an artifact from the wrong system. The backup workflow now requires an exact `DB_BACKUP_CONTAINER` environment variable and confirms that container is running before `pg_dump`. The configured production value must be checked against the live host before dispatch.
- The production Postgres instance reports `archive_mode=off` and `archive_command=(disabled)`. A 7-day PITR window cannot be claimed from that configuration. No PITR restore evidence exists.
- `/srv/backups/postgres` exists but contained no backup files at inspection time. This local path cannot demonstrate retained off-host recovery. The production Storage container reports `STORAGE_BACKEND=file` and `FILE_STORAGE_BACKEND_PATH=/mnt`; its enabled S3-compatible protocol does not mean objects are stored in a versioned S3 backend. No off-host object versioning has been evidenced.
- The production migration ledger ended at `20260712000000`; the `20260922*` Employee/Deal identity migrations and PR #95's `20260927*` migrations had not been applied. The release migration gate must continue to block promoting the new application until the ledger is reconciled.

## Decisions required before the next production step

1. Put a recoverable, approved backup encryption key in the `production` GitHub environment and escrow it independently of GitHub Actions. Do not record the key in Git, issue comments, or CI logs.
2. Designate an off-host, versioned backup destination with retention matching the 30-day logical-backup target and a 7-day WAL/PITR target. Configure least-privilege upload credentials and lifecycle rules.
3. Run a successful encrypted production backup from the **exact** production container; verify the SHA-256 checksum and retained destination. Then run the network-isolated logical restore workflow against that artifact and record the measured recovery time and smoke result in `docs/DR_DRILLS.md`.
4. Enable and verify PostgreSQL WAL archiving/PITR, perform a point-in-time restore to an isolated target, and confirm Storage object versioning/recovery. Avoid production schema changes until the backup and restore path is proven.
5. After recovery controls pass, apply the pending migrations in order through the canonical Deal ownership schema, run the full read-only Business Core reconciliation, review exceptions, then apply remaining migrations and explicitly promote the application.

This document records gaps rather than claiming completed recovery evidence. Issue #48 remains open until the operational checks succeed.
