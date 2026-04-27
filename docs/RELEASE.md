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

- Supabase PITR is enabled on staging and production.
- A monthly restore-to-staging drill verifies backups.

## Launch checklist

- [x] UAT synthetic verification workflow
- [ ] Production uptime monitoring (StatusCake / BetterUptime)
- [ ] Sentry alert routes to on-call channel
- [ ] Error budget defined per module
- [ ] Load test at ≥100k vehicles / ≥10k orders
- [ ] Incident response runbook linked from README
- [ ] `npm audit` + `osv-scanner` reports filed as issues
