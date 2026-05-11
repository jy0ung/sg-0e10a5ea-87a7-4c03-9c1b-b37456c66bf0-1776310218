# Environment Contract

Required values are loaded at boot and validated by the zod schema in `src/config/env.ts`. Boot fails fast if any required value is missing.

## Required

| Variable                | Purpose                                     | Notes                              |
| ----------------------- | ------------------------------------------- | ---------------------------------- |
| `VITE_SUPABASE_URL`     | Browser-facing Supabase URL                 | `http://127.0.0.1:54321` locally; for self-hosted production behind nginx, use the public app origin so browsers call same-origin proxy paths. |
| `VITE_SUPABASE_ANON_KEY`| Supabase anon/publishable key               | From `supabase start` output. Required for every web build target, including standalone `apps/hrms-web`; omitting it causes the client to fail boot with missing Supabase env errors. |
| `VITE_APP_URL`          | Canonical app URL used for auth redirects   | Must match browser origin. `VITE_SITE_URL` still accepted as a legacy fallback. HRMS-hosted builds must set this to the HRMS domain so recovery links redirect to `/reset-password` on the HRMS hostname, not a local smoke URL. |

## Optional

| Variable                      | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `VITE_SENTRY_DSN`             | Enables Sentry error reporting                 |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Browser tracing sample rate from `0` to `1`; defaults to `0.1` when omitted. |
| `VITE_APP_ENV`                | Environment label sent to Sentry (`development`, `staging`, `production`). |
| `VITE_HRMS_APP_URL`           | Dedicated HRMS web origin used by the main app launcher. Leave unset to use same-origin `/hrms/`. |
| `VITE_APP_VERSION`            | Release tag sent to Sentry for source map association. |
| `SUPABASE_INTERNAL_URL`        | Docker/nginx build arg for the private Supabase upstream behind same-origin proxy routes. For the all-in-one production host, use `http://host.docker.internal:54321`. |

## Source maps

Production browser source maps are disabled by default. The release workflow
sets `BUILD_SOURCEMAP=true` only in the Sentry upload job, builds a matching
bundle with `VITE_APP_VERSION`, uploads `dist` source maps to Sentry, and keeps
the Docker image build free of public source maps.

## Files

- `.env` — local development defaults (checked in)
- `.env.local` — per-developer overrides (never committed)
- `.env.staging.example` — staging template (keys rotated per env)
- `.env.example` — canonical required keys with placeholder values

## Edge function secrets

Set via `supabase secrets set` — never via client env:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` (or SMTP equivalents)
- `PUSH_NOTIFICATION_KEY`

## Database connection (edge functions)

Edge functions that need a direct Postgres connection must use the **connection pooler** (PgBouncer), not the direct Postgres port. Use `SUPABASE_DB_URL` with **port 6543**:

```
SUPABASE_DB_URL=postgresql://postgres:[password]@host:6543/postgres?pgbouncer=true
```

- Port **5432** — direct Postgres (no pooling); used by migrations and local tooling only.
- Port **6543** — PgBouncer/connection pooler; required for edge functions and any short-lived connection that would otherwise exhaust Postgres connection slots.
- Do **not** set `statement_cache_size` or named prepared statements when using the pooler (`pgbouncer=true` disables them automatically).

For local `supabase start`, the pooler is available at `postgresql://postgres:postgres@127.0.0.1:6543/postgres`.

## DMS sync secrets

Phase 5 DMS integration must run only from backend workers, scheduled jobs, or edge functions. Do not add any `VITE_DMS_*` variable; `VITE_*` values are bundled into the browser app.

Provision DMS values through Supabase secrets, a systemd env file, or the deployment secret manager used by the backend worker:

- `DMS_API_BASE_URL` — Proton DMS API origin, for example `https://dcs-api.proton.com`.
- `DMS_CLIENT_ID` — DMS integration client or dealer identifier.
- `DMS_CLIENT_SECRET` — DMS integration secret.
- `DMS_SIGNING_KEY` — request signing key or HMAC secret when required by Proton.
- `DMS_TOKEN_URL` — optional token endpoint if different from `DMS_API_BASE_URL`.
- `DMS_DEFAULT_COMPANY_ID` — UBS company id used by first read-only sync jobs when no tenant mapping table exists yet.

The first DMS sync remains read-only. Raw responses must land in `sync_runs` and `dms_raw_*` staging tables before any canonical UBS table is updated.

`supabase/functions/dms-sync-worker` is the first backend skeleton. It accepts caller-supplied raw DMS records, creates a `sync_runs` audit row, and upserts those records into the selected `dms_raw_*` staging table. It does not perform live DMS fetches yet, and it must not be exposed to the browser as a normal page dependency.

All Edge Functions are declared in `supabase/config.toml` under `[functions.*]` sections. For the self-hosted `supabase-edge-runtime` container, set the following env var and restart the Edge Runtime service before invoking any function in production:

```
SUPABASE_INTERNAL_FUNCTIONS_CONFIG='[
  {"name":"invite-user","verify_jwt":true},
  {"name":"delete-user","verify_jwt":true},
  {"name":"update-user-status","verify_jwt":true},
  {"name":"send-push-notification","verify_jwt":true},
  {"name":"rollover-leave-balances","verify_jwt":true},
  {"name":"dms-sync-worker","verify_jwt":true}
]'
```

Add new function names to this list whenever a new Edge Function is deployed. The same list is documented as a comment in `supabase/config.toml`.

## Self-hosted auth SMTP relay

Production auth email for invites and password resets is sent by self-hosted Supabase Auth, not by the frontend app. Keep Mailpit for local development and configure the live server with `scripts/configure-supabase-auth-smtp.sh`.

Recommended production-only variables for that script:

- `APP_URL` — main app origin, for example `https://ubs.protonfookloi.com`
- `SUPABASE_API_EXTERNAL_URL` — public Supabase API origin used by the CLI when deriving service URLs, for example `https://ubs.protonfookloi.com`. Defaults to `<APP_URL>`.
- `AUTH_EXTERNAL_URL` — public Supabase Auth API base used inside email action links, for example `https://ubs.protonfookloi.com/auth/v1`. Defaults to `<APP_URL>/auth/v1`.
- `HRMS_APP_URL` — standalone HRMS origin, for example `https://hrms.protonfookloi.com`
- `AUTH_RATE_LIMIT_EMAIL_SENT` — Supabase Auth email-send rate limit per hour. Defaults to `30` for production SMTP; keep this aligned with your provider quota and abuse posture.
- `AUTH_SMTP_HOST` — relay hostname such as `smtp.resend.com`
- `AUTH_SMTP_PORT` — relay port, usually `465` or `587`
- `AUTH_SMTP_USER` — relay username
- `AUTH_SMTP_PASS` — relay password or API key; stored in `/etc/flc-bi/supabase.env`, never in tracked repo files
- `AUTH_SMTP_ADMIN_EMAIL` — visible sender address, ideally a verified no-reply mailbox on your domain
- `AUTH_SMTP_SENDER_NAME` — visible sender name, for example `UBS`

The script updates [supabase/config.toml](supabase/config.toml) auth URLs, `[api].external_url`, `[auth].external_url`, `[auth.rate_limit].email_sent`, and the managed `[auth.email.smtp]` block, writes the SMTP secret to the systemd env file, and restarts `flc-bi-supabase.service` when requested.

## Supabase auth config

`supabase/config.toml` now follows the current Supabase CLI schema:

- keep public self-signup disabled at `[auth].enable_signup = false`
- set `[auth.rate_limit].email_sent` above the default `2` once production SMTP is configured, otherwise password resets/invites will still hit GoTrue's email throttle even when Resend has quota
- keep email auth enabled at `[auth.email].enable_signup = true` so email login and password recovery still work

Disabling signup under `[auth.email]` turns off the email provider entirely and breaks password reset.
