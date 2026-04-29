# Environment Contract

Required values are loaded at boot and validated by the zod schema in `src/config/env.ts`. Boot fails fast if any required value is missing.

## Required

| Variable                | Purpose                                     | Notes                              |
| ----------------------- | ------------------------------------------- | ---------------------------------- |
| `VITE_SUPABASE_URL`     | Browser-facing Supabase URL                 | `http://127.0.0.1:54321` locally; for self-hosted UAT behind nginx, use the public app origin so browsers call same-origin proxy paths. |
| `VITE_SUPABASE_ANON_KEY`| Supabase anon/publishable key               | From `supabase start` output. Required for every web build target, including standalone `apps/hrms-web`; omitting it causes the client to fail boot with missing Supabase env errors. |
| `VITE_APP_URL`          | Canonical app URL used for auth redirects   | Must match browser origin. `VITE_SITE_URL` still accepted as a legacy fallback. Standalone HRMS builds must set this to the HRMS domain so recovery links redirect to `/reset-password` on `hrms-...`, not a localhost smoke URL. |

## Optional

| Variable                      | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `VITE_SENTRY_DSN`             | Enables Sentry error reporting                 |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Browser tracing sample rate from `0` to `1`; defaults to `0.1` when omitted. |
| `VITE_APP_ENV`                | Environment label sent to Sentry (`development`, `staging`, `production`). |
| `VITE_HRMS_APP_URL`           | Dedicated HRMS web origin used by the main app launcher. Leave unset to use same-origin `/hrms/`. |
| `VITE_APP_VERSION`            | Release tag sent to Sentry for source map association. |
| `SUPABASE_INTERNAL_URL`        | Docker/nginx build arg for the private Supabase upstream behind same-origin proxy routes. Defaults to the current UAT LAN host. |

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

## Supabase auth config

`supabase/config.toml` now follows the current Supabase CLI schema:

- keep public self-signup disabled at `[auth].enable_signup = false`
- keep email auth enabled at `[auth.email].enable_signup = true` so email login and password recovery still work

Disabling signup under `[auth.email]` turns off the email provider entirely and breaks password reset.
