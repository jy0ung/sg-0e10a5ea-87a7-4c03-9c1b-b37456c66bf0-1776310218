# Admin Backup & Recovery product capability

**Status:** Manual encrypted export slice implemented for Dev/UAT. Configured storage destinations, scheduling/retention and in-app restore remain future slices. This is not production recovery evidence under #48.

The main web app has an Admin → Backup & Recovery page restricted to `super_admin`. It never sees the database connection, encryption passphrase or service-role key. The page is inert when `VITE_RECOVERY_API_URL` is unset. When connected, it shows destination availability, job history, progress, database/schema/app version metadata, encrypted archive size, SHA-256 checksum and an export action. Unsupported destinations and restore are disabled visibly rather than failing the rest of UBS.

## Server boundary

`apps/recovery-service` is a separate backend process. It verifies the caller's Supabase access token with Auth, reads the current Profile role/status server-side, and permits only an active `super_admin` to start, list or download full-database backups. Jobs and audit events are persisted as private metadata in a configured export directory. Only one job runs per worker. A failed or interrupted job is marked failed and its incomplete archive is removed; completed downloads recheck size and SHA-256 before streaming.

The worker runs `pg_dump` in custom format, streams it directly into symmetric GPG encryption, then decrypts the encrypted file directly into `pg_restore --list` for integrity/structure validation. No plaintext dump is saved. The passphrase is supplied over a dedicated file descriptor, never through a command argument or response. The archive is useful only if the encryption key is escrowed independently. This validation is not a restore drill.

The destination interface is provider-based. `manual_export` retains the verified encrypted file for authorized download. `local_nas`, `s3_compatible` and `cloud_object` are declared but unavailable until their adapters and credentials are configured. The browser cannot submit arbitrary server paths, bucket names or credentials. A later provider adapter must receive only a verified encrypted archive, keep its secrets server-side, and report delivery/checksum evidence. Manual export is not an off-site copy until an administrator stores the downloaded file elsewhere.

## Configuration contract

The service requires these server-side variables to start:

| Variable | Meaning |
|---|---|
| `RECOVERY_SUPABASE_URL` | Auth and Profile API base URL |
| `RECOVERY_SUPABASE_ANON_KEY` | Public API key for verifying the caller's access token |
| `RECOVERY_SUPABASE_SERVICE_ROLE_KEY` | Server-only key for current Profile verification |
| `RECOVERY_ALLOWED_ORIGIN` | Exact permitted browser origin |
| `RECOVERY_EXPORT_DIR` | Absolute private path for encrypted archives and metadata |

Manual backup becomes available only with `RECOVERY_DATABASE_URL` and `RECOVERY_GPG_PASSPHRASE`. The latter must be at least 16 characters, one line, and independently escrowed. Optional `RECOVERY_APP_VERSION` records the deployed commit/version; `RECOVERY_BIND_HOST` and `RECOVERY_PORT` control the worker listener (defaults: loopback, 8787). `VITE_RECOVERY_API_URL` is the public, build-time web-app endpoint for this service. The packaged web image can use `VITE_RECOVERY_API_URL=/recovery-api` and `RECOVERY_INTERNAL_URL=http://<private-worker-host>:8787` to enable its optional same-origin proxy; both remain unset by default. A standalone HTTPS endpoint also requires the deployment's CSP to permit its origin. Do not expose an unencrypted worker listener to clients. The service Dockerfile supplies `pg_dump`, `pg_restore`, `psql` and GPG; choose a PostgreSQL client version compatible with the target database before running it.

No endpoint, container name, NAS path, bucket, cloud provider or production secret is compiled into the application. An operator must provide a private mounted export directory, route, database connection, key escrow and retention policy for each environment. The current Dev/UAT server is not a template for final production infrastructure.

## Next product slices

1. Admin-configured local/NAS and object-store destination adapters with connection tests, secure credential references, delivery verification, retention and optional scheduling.
2. Controlled restore selection, checksum and compatibility preflight, explicit confirmation, isolated restore execution, validation and audit. No automatic restore on CI or health-check failure.
3. UAT evidence for permissions, large streamed exports, restart/failure recovery and actual restore into a disposable database. Production destination/PITR/off-site/restore evidence remains in #48 after final infrastructure selection.
