# Environment Contract

Required values are loaded at boot and validated by the zod schema in `src/config/env.ts`. Boot fails fast if any required value is missing.

## Required

| Variable                | Purpose                                     | Notes                              |
| ----------------------- | ------------------------------------------- | ---------------------------------- |
| `VITE_SUPABASE_URL`     | Supabase project URL                        | `http://127.0.0.1:54321` locally   |
| `VITE_SUPABASE_ANON_KEY`| Supabase anon/publishable key               | From `supabase start` output       |
| `VITE_APP_URL`          | Canonical app URL used for auth redirects   | Must match browser origin. `VITE_SITE_URL` still accepted as a legacy fallback. |

## Optional

| Variable                      | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `VITE_SENTRY_DSN`             | Enables Sentry error reporting                 |
| `VITE_SENTRY_ENVIRONMENT`     | Environment label (e.g. `production`)          |
| `VITE_SENTRY_RELEASE`         | Release tag for source map association         |
| `VITE_APP_VERSION`            | Shown in footer / sent to Sentry               |

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
