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

Use the manual Release workflow with `build_target=hrms-web` to publish a standalone HRMS image. Use the Deploy Image workflow with `app=hrms-web` and an HRMS-specific environment such as `uat-hrms` or `production-hrms` to deploy that image to a separate container/port/domain.

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

`uat-synthetic.yml` also runs the same verifier hourly and on manual dispatch.
It fails on health, bundle configuration, or required-login regressions without
needing a deploy event. Set `UAT_VERIFY_FETCH_ATTEMPTS` if the synthetic check
needs a different retry count than the default three attempts.

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
