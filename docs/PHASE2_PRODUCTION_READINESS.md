# Phase 2 Production Readiness

Status: In progress
Started: 2026-04-27

## Objective

Move the closed Phase 1 UAT build toward a production launch posture: observable, recoverable, secure by policy, and validated under expected operating load.

## Slice 1: Observability Foundation

Scope:

- Wire React root and route error boundaries into `errorTrackingService` so crashes reach Sentry when `VITE_SENTRY_DSN` is configured.
- Keep Sentry user context to the internal user id only; do not send email, phone, session, token, or other PII.
- Reuse the logging redaction path before sending Sentry `extra` data, messages, breadcrumbs, or cloned error messages.
- Pass `VITE_APP_ENV`, `VITE_APP_VERSION`, and optional `VITE_SENTRY_TRACES_SAMPLE_RATE` through validated runtime config.
- Emit source maps only for the Sentry release upload job via `BUILD_SOURCEMAP=true`; do not publish source maps in the Docker image by default.

Exit checks:

```bash
npm run typecheck
npm run test -- src/services/errorTrackingService.test.ts src/contexts/AuthContext.test.tsx src/services/loggingService.test.ts
npm run build
```

## Remaining Phase 2 Work

- Configure GitHub UAT environment secrets `UAT_LOGIN_EMAIL`, `UAT_LOGIN_PASSWORD`, and `UAT_LOGIN_REQUIRED=1` so scheduled UAT synthetic checks include a real browser login.
- Create or connect the production Sentry project, configure alert routing, and prove a synthetic frontend error appears within 60 seconds.
- Complete RLS matrix sign-off and file a release security review covering edge-function JWT and company-boundary checks.
- Run the expected-volume load test: 100,000 vehicles, 10,000 sales orders, and Vehicle Explorer p95 below 2 seconds with server-side pagination.
- Confirm backup and restore operations: production PITR, nightly logical dump, and restore-to-staging drill.
- Decide backend topology for UAT/staging/production: self-hosted Supabase behind same-origin proxy or public/cloud Supabase projects.

## Slice 2: Operational Runbooks And Backups

Scope:

- Add the nightly encrypted logical dump workflow.
- Document required backup secrets, optional S3 retention path, and restore-drill logging.
- Add the incident response runbook.
- Add the on-call process contract.
- Link operational docs from README and launch checklist.

Exit checks:

```bash
npm run verify:uat
```

Still requires external setup before production launch:

- Configure production `SUPABASE_DB_URL` and `DB_BACKUP_GPG_PASSPHRASE` secrets.
- Configure S3 backup destination or accept short-lived encrypted GitHub artifacts as a temporary fallback.
- Fill the private live on-call rota.
- Execute and record the first restore drill in `docs/DR_DRILLS.md`.
