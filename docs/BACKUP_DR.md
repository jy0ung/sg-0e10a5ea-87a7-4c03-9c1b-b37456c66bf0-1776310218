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
# 2. Schedule the nightly logical dump via GitHub Actions
#    (.github/workflows/db-backup.yml) using SUPABASE_DB_URL (service role).
# 3. Enable object versioning on every storage bucket.
```

## Restore drill (monthly)

1. Pick a timestamp T within the PITR window on the **production** project.
2. Use the Supabase dashboard to restore the DB into a **new** staging project at T.
3. Deploy the matching git tag to the restored project.
4. Run the e2e smoke suite (`npm run test:e2e`) against the restored stack.
5. Record pass/fail + duration in `docs/dr-drills.md` (not yet created).
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
