# Release Flow

## Branches

- `main` — protected; every merge must pass CI (lint, typecheck, unit, build, e2e).
- feature branches — created from `main`, merged via PR.

## CI gates (GitHub Actions)

```
lint  →  typecheck  →  unit  →  build-web  →  build-mobile  →  e2e
                                                ↘  npm audit / CodeQL (parallel)
```

- Coverage is uploaded to the CI artifacts store.
- Playwright uses a managed `webServer` block so e2e is self-contained.

## Versioning

- Changesets-driven semver bumps per merged PR.
- Tags trigger a Docker image build and publish (see `docs/HOSTING.md`).

## Docker Build Targets

The release workflow supports three image targets:

| Target | Image | Output |
| ------ | ----- | ------ |
| `main-with-hrms` | `ghcr.io/<owner>/<repo>:<tag>` | Root app plus HRMS web mounted at `/hrms/`. This is the default for tag releases and current UAT. |
| `main` | `ghcr.io/<owner>/<repo>:<tag>` | Root app only. |
| `hrms-web` | `ghcr.io/<owner>/<repo>-hrms-web:<tag>` | Standalone `apps/hrms-web` app for an HRMS subdomain. |

Use the manual Release workflow with `build_target=hrms-web` to publish a standalone HRMS image. Select the Release workflow `environment` that owns the browser build secrets, such as `uat-hrms` or `production-hrms`. Use the Deploy Image workflow with `app=hrms-web` and the matching deploy environment to deploy that image to a separate container/port/domain.

The Vite public environment is baked into each static image at build time. Publish separate HRMS images for UAT and production when their browser origins or Supabase projects differ; do not promote a UAT-built HRMS image to production or a production-built HRMS image back to UAT.

Release workflow tags use the git-style `v` prefix, such as `v0.1.0`. The Docker metadata action publishes semver image tags without that prefix, such as `0.1.0`, plus `0.1`, `latest`, and a `sha-...` tag.

Standalone HRMS UAT release values:

| Secret / input | Value |
| -------------- | ----- |
| Release `environment` | `uat-hrms` |
| Release `build_target` | `hrms-web` |
| Release `VITE_SUPABASE_URL` | `https://uat.protonfookloi.com` |
| Release `VITE_SUPABASE_ANON_KEY` | UAT anon/publishable key |
| Release `VITE_APP_URL` | `https://hrms-uat.protonfookloi.com` |
| Deploy `environment` | `uat-hrms` |
| Deploy `app` | `hrms-web` |
| Deploy `DEPLOY_CONTAINER_NAME` | `flc-bi-hrms-uat` |
| Deploy `DEPLOY_HOST_PORT` | `8082` |
| Deploy `UAT_URL` | `https://hrms-uat.protonfookloi.com` |
| Deploy `UAT_EXPECTED_SUPABASE_URL` | `https://uat.protonfookloi.com` |
| Deploy `UAT_HEALTH_URL` | `https://hrms-uat.protonfookloi.com/healthz` |

Standalone HRMS production release values:

| Secret / input | Value |
| -------------- | ----- |
| Release `environment` | `production-hrms` |
| Release `build_target` | `hrms-web` |
| Release `VITE_SUPABASE_URL` | Production browser-facing Supabase URL |
| Release `VITE_SUPABASE_ANON_KEY` | Production anon/publishable key |
| Release `VITE_APP_URL` | `https://hrms.protonfookloi.com` |
| Deploy `environment` | `production-hrms` |
| Deploy `app` | `hrms-web` |
| Deploy `DEPLOY_CONTAINER_NAME` | Production HRMS container name |
| Deploy `DEPLOY_HOST_PORT` | Production HRMS host port |

For UAT break/fix validation before publishing a GHCR image, the host can run:

```bash
scripts/deploy-hrms-uat-local.sh
```

The helper builds `apps/hrms-web` with the HRMS UAT app URL, includes the required Supabase anon key from `.env` unless already exported, promotes the local image through the same health-gated container swap, and runs the standalone HRMS UAT verifier.

Once the GitHub environment secrets are present, validate and dispatch the official standalone HRMS workflows with:

```bash
scripts/check-hrms-github-env.sh uat-hrms release
TAG=v0.1.0 RELEASE_ENVIRONMENT=uat-hrms scripts/release-hrms-web.sh
```

After the Release workflow succeeds, deploy the published image to HRMS UAT with:

```bash
TAG=v0.1.0 IMAGE_TAG=0.1.0 RELEASE_ENVIRONMENT=uat-hrms DEPLOY_ENVIRONMENT=uat-hrms DEPLOY_AFTER_RELEASE=1 scripts/release-hrms-web.sh
```

For production, use the same helper with `RELEASE_ENVIRONMENT=production-hrms` and `DEPLOY_ENVIRONMENT=production-hrms` after production DNS, Supabase auth redirects, and deploy secrets are ready.

## Environments

| Env        | Supabase project          | URL                         |
| ---------- | ------------------------- | --------------------------- |
| Local      | `supabase start`          | `http://127.0.0.1:3000`     |
| Staging    | Separate Supabase project | `https://staging.…`         |
| Production | Separate Supabase project | `https://app.…`             |

Staging is seeded from `scripts/seed-from-extract.ts` with rotated keys.

## Rollback

1. Revert the merge commit on `main`.
2. Re-deploy the previous image tag.
3. If the release ran migrations, run the inverse migration or restore from PITR.

## UAT verification

After deploying to UAT, run:

```bash
npm run verify:uat
```

The verifier checks `/healthz`, confirms the live Vite bundle uses the public
same-origin Supabase URL instead of a private LAN/localhost URL, and skips the
real browser login check unless credentials are supplied. To include login:

```bash
UAT_LOGIN_EMAIL=<email> UAT_LOGIN_PASSWORD=<password> npm run verify:uat
```

Set `UAT_LOGIN_REQUIRED=1` in CI if missing login credentials should fail the
verification job.

`deploy-image.yml` runs this verifier automatically after UAT deployments. Add
`UAT_LOGIN_EMAIL` and `UAT_LOGIN_PASSWORD` as UAT environment secrets to include
the real browser login check in that automated deploy gate.

For standalone HRMS deployments, set `UAT_APP=hrms-web` or deploy with
`app=hrms-web`. The verifier then installs Chromium in CI and runs an additional
mocked-auth browser smoke covering the HRMS shell, `/admin -> /settings`, and
`/leave-calendar -> /leave/calendar` query/hash preservation.

`uat-synthetic.yml` also runs the same verifier hourly and on manual dispatch.
It fails on health, bundle configuration, or required-login regressions without
needing a deploy event. Set `UAT_VERIFY_FETCH_ATTEMPTS` if the synthetic check
needs a different retry count than the default three attempts.

For a manual standalone HRMS UAT check after adding `uat-hrms` login secrets,
dispatch `uat-synthetic.yml` with `environment=uat-hrms` and `app=hrms-web`.

## Phase 1 closure

Phase 1 performance hardening is closed as of 2026-04-27. The release criteria
are the default validation gates, bundle budget, and UAT deploy verifier:

```bash
npm run lint
npm run typecheck
npm run test
npm run build:budget
npm run verify:uat
```

The remaining UAT follow-up is operational: add `UAT_LOGIN_EMAIL` and
`UAT_LOGIN_PASSWORD` secrets so the automated verifier exercises a real browser
login instead of skipping that optional check.

## Backups

- Supabase PITR must be enabled on staging and production.
- `db-backup.yml` creates nightly encrypted logical dumps once `SUPABASE_DB_URL`
    and `DB_BACKUP_GPG_PASSPHRASE` are configured in the target environment.
- A monthly restore-to-staging drill verifies backups and is recorded in
    `docs/DR_DRILLS.md`.

## Phase 2 production readiness

Phase 2 started on 2026-04-27. The first slice is the observability foundation:
React error boundaries report through `errorTrackingService`, Sentry metadata is
driven by the validated env contract, and source maps are generated only for the
Sentry release upload job. Track the full phase in
`docs/PHASE2_PRODUCTION_READINESS.md`.

## Launch checklist

- [x] UAT synthetic verification workflow
- [ ] Production uptime monitoring (StatusCake / BetterUptime)
- [ ] Sentry alert routes to on-call channel
- [ ] Error budget defined per module
- [ ] Load test at ≥100k vehicles / ≥10k orders
- [x] Incident response runbook linked from README
- [ ] `npm audit` + `osv-scanner` reports filed as issues
