# Launch Checklist

One-time gate before first production cutover. Every box must be checked.

## Infrastructure

- [ ] Production Supabase project provisioned (separate from staging/local)
- [ ] Staging Supabase project provisioned and seeded via
      `scripts/seed-from-extract.ts`
- [ ] `.env.staging` populated from `.env.staging.example` with rotated keys
- [ ] Production `.env` populated (rotated keys, never reused from staging)
- [ ] DNS + TLS cert for `app.<domain>` and `api.<domain>`
- [ ] Docker image published to GHCR via `release.yml`
- [ ] Nginx/reverse proxy routes `/` to the static bundle with HSTS +
      CSP headers
- [x] UAT deploy verification passes with `npm run verify:uat`

## Security

- [ ] RLS matrix sign-off (`docs/RLS_MATRIX.md`) complete
- [ ] `scripts/security-check.sh` passes on the release commit
- [ ] `npm audit` high+ clean; open items tracked as issues
- [ ] `osv-scanner` findings reviewed
- [ ] CodeQL scan attached to release
- [ ] Supabase `[auth] enable_signup = false` confirmed in production
      `config.toml`
- [ ] All edge functions validate JWT + same-company checks
- [ ] CORS allow-list pinned to production origins only
- [ ] Service-role key set via `supabase secrets set` (never in client)
- [ ] **Environment provisioned via one-shot script** — run
      `./scripts/provision-supabase-env.sh` after copying
      `scripts/provision-supabase-env.env.example` outside the repo
      (chmod 600) and filling in secrets. The script is idempotent and
      links the project, dry-runs migrations, applies them on approval,
      verifies the schema, bootstraps the first `super_admin`, and sets
      the `SITE_URL` / `APP_URL` edge-function secrets. Required because
      `handle_new_user` creates every user as `status='pending'` /
      `company_id=NULL`, and `AuthContext` signs such users out — a fresh
      environment has no admin to activate the first admin.
  - [ ] Verify login lands on `/dashboard` (no redirect back to `/login`)

## Observability

- [x] Root and route error boundaries report through `errorTrackingService`
- [ ] Sentry project created; DSN wired via `VITE_SENTRY_DSN`
- [ ] Sentry source-map upload succeeds on release build
- [ ] Sentry → Slack / email alert route configured
- [ ] Synthetic frontend error appears in Sentry within 60s (tested)
- [ ] Edge-function logs show `request_id` correlation (tested)
- [ ] Application logs flow to `application_logs` with rate limiting

## Reliability

- [ ] Supabase PITR enabled on production
- [ ] Nightly logical dump job green
- [ ] Monthly restore-to-staging drill scheduled
- [ ] Uptime monitoring (StatusCake / BetterUptime) pinging `/health`
- [ ] Error-budget policy documented per module
- [ ] Incident response runbook linked from README
- [ ] On-call rotation defined in `docs/ONCALL.md` (to be created)

## Performance

- [ ] Load test at expected volumes passed: 100,000 vehicles, 10,000 sales orders, VehicleExplorer p95 < 2s with server-side pagination
- [x] Bundle budget gate confirms vendor chunks within targets: `vendor-react` < 150KB gz, `vendor-ui` < 200KB gz, and `vendor-charts` lazy-loaded only on dashboard routes

## Product

- [ ] Every module has a smoke e2e spec in `e2e/`
- [ ] Vitest coverage ≥ 70 % on `services/`, `contexts/`, `lib/`
- [ ] All pages pass `jsx-a11y` lint (no new errors)
- [ ] i18n scaffold boots; `en` bundle seeded
- [ ] Dark mode + system theme toggle verified

## Process

- [x] Changeset / CHANGELOG entry for the release tag
- [ ] Rollback playbook tested (revert + re-deploy previous tag)
- [ ] Backup + DR drill recorded (`docs/BACKUP_DR.md`)
- [ ] RLS pen-test report filed
- [ ] CLA / DPA in place if required for enterprise customers
