# Launch Checklist

One-time gate before first production cutover. Every box must be checked.

## Infrastructure

- [x] Production Supabase stack provisioned on the all-in-one host
- [ ] Production `.env` populated with rotated keys
- [x] DNS + TLS cert for `ubs.protonfookloi.com`
- [x] DNS + TLS cert for `hrms.protonfookloi.com`
- [x] Docker image published to GHCR via `main-deploy.yml`
- [x] Production deploy workflow is manual-only (`workflow_dispatch`) and separated from push-to-main CI (`main-deploy.yml`)
- [ ] Production host bootstrapped via `scripts/setup-production-host.sh`
- [ ] Nginx/reverse proxy routes `/` to the static bundle with HSTS +
      CSP headers
- [x] Production deploy verification has an unconditional Chromium dependency and is wired to `npm run verify:production`

## Security

- [ ] RLS matrix sign-off (`docs/RLS_MATRIX.md`) complete
- [x] Security sign-off checklist exists in `docs/SECURITY_SIGNOFF.md`
- [x] `scripts/security-check.sh` passes on the release commit
- [x] `npm audit` high+ clean; open items tracked as issues
- [ ] `osv-scanner` findings reviewed
- [ ] CodeQL scan attached to release
- [ ] Supabase `[auth] enable_signup = false` confirmed in production
      `config.toml`
- [x] Edge-function static guardrails wired into `scripts/security-check.sh`
- [ ] All edge functions validate JWT + same-company checks with release evidence attached
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

- [ ] Supabase PITR enabled on production — repository docs define the target, but current production enablement has not been evidenced in this repository
- [x] Nightly logical dump workflow defined in `.github/workflows/db-backup.yml`
- [ ] Nightly logical dump job green with production secrets configured — code supports direct `SUPABASE_DB_URL` or Cloudflare Access SSH fallback; production `DB_BACKUP_GPG_PASSPHRASE` + transport secrets and a successful encrypted run are still unverified
- [ ] Monthly restore drill executed at least once — manual isolated logical-restore workflow is implemented; successful real-artifact evidence is still required
- [ ] Uptime monitoring (StatusCake / BetterUptime) pinging `/health`
- [ ] Error-budget policy documented per module
- [x] Incident response runbook linked from README
- [x] On-call process defined in `docs/ONCALL.md`
- [ ] Live on-call rota filled in private team calendar/tool

## Performance

- [ ] Load test at expected volumes passed: 100,000 vehicles, 10,000 sales orders, VehicleExplorer p95 < 2s with server-side pagination
- [x] Bundle budget gate confirms vendor chunks within targets: `vendor-react` < 150KB gz, `vendor-ui` < 200KB gz, and `vendor-charts` lazy-loaded only on dashboard routes

## Latest Validation Snapshot

2026-05-06 production validation passed through GitHub Actions for commit `70820b7`: CI passed, `main-deploy.yml` built and deployed the production image, and production verification passed against `https://ubs.protonfookloi.com`. Follow-up host validation activated `hrms.protonfookloi.com` cloudflared ingress, verified HRMS public routes, created the production super admin, and passed `npm run smoke:production` across 57/57 module routes.

Phase decision: Phase 2 local engineering readiness is formally closed. Keep this launch checklist open until the remaining unchecked infrastructure, security, observability, reliability, performance, product coverage, and process gates have owner-approved production evidence.

## Product

- [x] Every active production module has a credentialed smoke route in `scripts/smoke-production-modules.ts`
- [ ] Vitest coverage ≥ 70 % on `services/`, `contexts/`, `lib/`
- [x] All pages pass `jsx-a11y` lint (no new errors)
- [x] i18n scaffold boots; `en` bundle seeded
- [x] Dark mode + system theme toggle verified

## Process

- [x] Changeset / CHANGELOG entry for the release tag
- [ ] Rollback playbook exercised against a non-production target; repository scripts preserve/restore the previous container but live drill evidence is still required
- [ ] Backup + DR drill recorded (`docs/DR_DRILLS.md`)
- [ ] RLS pen-test report filed
- [ ] CLA / DPA in place if required for enterprise customers


## 2026-09-22 Release-Safety Rebaseline

Repository-enforced controls now present:

- production deploy is manual-only and is not triggered by a successful push/CI run;
- Playwright Chromium is installed whenever production verification executes;
- release migration-ledger compatibility is checked before the existing application container is touched;
- the previous production container is preserved through post-promotion verification and restored on failure;
- manual encrypted logical-backup restore automation restores only into a network-isolated scratch database and records timing/smoke evidence;
- static regression tests cover the workflow trigger, verifier dependency, migration preflight ordering, rollback preservation, backup safety, and restore isolation.

Still requires external/operator evidence:

- production backup encryption secret plus one configured direct-DB or Cloudflare Access SSH transport, and one successful encrypted backup artifact;
- checksum verification and isolated restore drill with recorded RTO/RPO;
- confirmation of production PITR/storage-versioning configuration;
- branch/ruleset governance. The connected GitHub integration reports no repository rulesets and does not have administration permission to inspect or change classic branch protection.

No production deployment or production database mutation was performed during this rebaseline.
