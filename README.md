# FLC BI App

This project is a Vite React application backed by a local Supabase stack for development.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — monorepo layout, layering rules, data fetching
- [Security model](docs/SECURITY.md) — authn/z, edge functions, threat model
- [Environment contract](docs/ENV.md) — required + optional env vars
- [RLS matrix](docs/RLS_MATRIX.md) — per-table policy posture
- [Release flow](docs/RELEASE.md) — branches, CI gates, rollback
- [Backup & DR](docs/BACKUP_DR.md) — PITR, restore drills, incident response
- [Launch checklist](docs/LAUNCH_CHECKLIST.md) — one-time production gate

## Prerequisites

- Node.js 20+ and npm
- Docker
- Supabase CLI

Verify the required tools are available:

```bash
node --version
npm --version
docker --version
supabase --version
```

## Local Development

Install dependencies:

```bash
npm install
```

Start the local Supabase stack:

```bash
supabase start
```

Start the Vite dev server:

```bash
npm run dev
```

If port `3000` is already in use, Vite will automatically choose another port such as `3001`. Always use the app URL shown in the terminal output.

Expected local URLs:

- App: `http://localhost:3000` or the next available port reported by Vite
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

The checked-in `.env` is already configured for native local development against the local Supabase stack.

## Login And Auth Setup

You do not need to start any additional application service beyond:

- `supabase start`
- `npm run dev`

If the login form shows `Failed to fetch`, the usual causes are:

1. The browser cannot reach the Supabase API URL configured in `.env`
2. The app is running in a remote dev container or Codespace, but `VITE_SUPABASE_URL` still points to `127.0.0.1`

If you are running this repo directly on your own machine, `supabase start` plus `npm run dev` is sufficient.

Self-service sign-up is disabled in the app. If you do not have a local auth user yet, create one by either:

- creating or inviting a user in Supabase Studio under Authentication
- creating the auth user through the Supabase Dashboard or CLI, then using the app's password reset flow

Use the app's **Forgot Password** link only after the auth user already exists. If email delivery is enabled for your local stack, open Mailpit at `http://127.0.0.1:54324` to retrieve invite or password reset emails.

## Ubuntu Test Server

To turn a fresh Ubuntu host into the LAN test server, run the bootstrap script from the repo root and pass the server IP or hostname:

```bash
bash scripts/setup-ubuntu-test-server.sh 192.168.1.241
```

The script installs the OS packages, Node.js 20, Docker, the Supabase CLI, PM2, and the workspace dependencies. It also rewrites `.env.local` so the browser points at the LAN host and updates `supabase/config.toml` so auth redirects return to the same address.

After the bootstrap finishes, open a new shell if Docker group membership was just added. If the current shell still cannot reach the Docker socket, use `sg docker -c 'supabase start'`. Then start the local services:

```bash
supabase start
pm2 start ecosystem.config.cjs
pm2 save
```

Expected LAN URLs:

- App: `http://192.168.1.241:3000`
- Supabase API: `http://192.168.1.241:54321`
- Supabase Studio: `http://192.168.1.241:54323`
- Mailpit: `http://192.168.1.241:54324`

If you plan to run Playwright smoke tests on the server, install the Chromium browser after the workspace install:

```bash
npx playwright install chromium
```

## Remote Dev Containers And Codespaces

If the app is running inside a dev container, GitHub Codespace, or another remote environment, the browser cannot use the container's `127.0.0.1:54321` directly. In that setup you must expose the required ports and override the frontend env vars with forwarded URLs.

Forward these ports from the container or Codespace:

- `3000` for the Vite app when available
- `3001` if Vite reports that `3000` is in use and starts on `3001`
- `54321` for the Supabase API
- `54323` for Supabase Studio
- `54324` for Mailpit

### GitHub Codespaces Checklist

1. Start the stack:

```bash
supabase start
npm run dev
```

2. Open the `Ports` panel in Codespaces.

3. Make sure the app port and Supabase ports are forwarded.
	- Use whichever app port Vite prints, usually `3000` or `3001`
	- Forward `54321`, `54323`, and `54324`

4. Copy the forwarded HTTPS URLs for:
	- the app port
	- port `54321`

5. Create a local env override:

```bash
cp .env .env.local
```

6. Update `.env.local` so the browser uses the forwarded URLs instead of container localhost:

```env
VITE_SUPABASE_URL="https://<your-forwarded-54321-url>"
VITE_APP_URL="https://<your-forwarded-app-url>"
```

Keep the existing anon or publishable key values from `.env` unless your local `supabase start` output shows different keys.

7. Restart the Vite dev server after editing `.env.local`:

```bash
npm run dev
```

8. Open the forwarded app URL from the `Ports` panel, not `localhost`.

If login still fails with `Failed to fetch`, the app is still pointing at `127.0.0.1:54321` from the browser. Re-check `VITE_SUPABASE_URL`, then restart the Vite server.

### Known Local Test Login

For the current local Supabase database, this test account is available:

- Email: `local.admin@flc.test`
- Password: `LocalAdmin123!`

This account exists only in the current local Supabase instance. If you run `supabase db reset`, recreate it in Supabase Auth before using the app again.

## Useful Commands

Check the local Supabase status:

```bash
supabase status
```

Reset the local database and re-run migrations:

```bash
supabase db reset
```

Run the unit test suite:

```bash
npm test
```

## Data Migration

Legacy data extraction and seeding instructions live in `migration/RUNBOOK.md`.
