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

## Backups

- Supabase PITR is enabled on staging and production.
- A monthly restore-to-staging drill verifies backups.

## Launch checklist

- [ ] Uptime monitoring (StatusCake / BetterUptime)
- [ ] Sentry alert routes to on-call channel
- [ ] Error budget defined per module
- [ ] Load test at ≥100k vehicles / ≥10k orders
- [ ] Incident response runbook linked from README
- [ ] `npm audit` + `osv-scanner` reports filed as issues
