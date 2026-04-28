# Phase 2 Production Readiness

Status: Closed for Phase 2 local engineering readiness - production launch evidence remains tracked in `docs/LAUNCH_CHECKLIST.md`
Started: 2026-04-27
Closed: 2026-04-28

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

## Formal Close Record

Phase gate decision, 2026-04-28: close Phase 2 as the local engineering-readiness and hardening phase. This close confirms the app is locally validated across type safety, unit tests, RLS isolation, core browser flows, accessibility smoke, UAT deploy smoke, security guardrails, and build budget. It is not a production cutover approval; the production launch checklist remains open for environment-specific evidence and owner sign-off.

Validation snapshot, 2026-04-28:

- Passed: `npm run lint` with 0 errors, 144 existing non-blocking warnings, and no `jsx-a11y` warnings reported.
- Passed: `npm run typecheck`.
- Passed: `npm run test`, `291 passed`.
- Passed: `npm run test:coverage`, `291 passed`; coverage target remains a launch gap because current grouped coverage is below the checklist target (`services` 49.42%, `contexts` 68.20%, `lib` 67.83%).
- Passed: `npm run build:budget`.
- Passed: `bash scripts/security-check.sh`; high+ npm audit gate is clean, OSV is skipped because `osv-scanner` is not installed, and moderate advisories remain for tracked dependency review.
- Passed: `npm run verify:uat`; health endpoint and bundle Supabase URL checks passed, credentialed browser login skipped because credentials were not provided.
- Passed: `git diff --check`.
- Passed: full Chromium Playwright project, `108 passed`, `21 skipped`.
- Passed: local seeded Supabase RLS matrix, `npm run test:rls`, `84 passed`.

## Gap Assessment

Production cutover remains blocked until the following evidence is captured and approved:

- Infrastructure: provision separate staging and production Supabase projects, rotated `.env.staging` and production `.env`, production DNS/TLS, GHCR image release, and reverse-proxy security headers.
- Credentialed UAT: configure `UAT_LOGIN_EMAIL`, `UAT_LOGIN_PASSWORD`, and `UAT_LOGIN_REQUIRED=1` so UAT verification includes a real browser login.
- Live RLS and edge-function security: rerun `npm run test:rls` against the seeded live stack, attach the evidence to `docs/SECURITY_SIGNOFF.md`, confirm all edge functions validate JWT and same-company access, pin CORS to production origins, and complete reviewer sign-off.
- Observability: create/connect the production Sentry project, set `VITE_SENTRY_DSN`, upload source maps in the release job, configure alert routing, and prove a synthetic frontend error arrives within 60 seconds.
- Reliability: enable production PITR, run the nightly logical dump with production secrets, complete a restore-to-staging drill, configure uptime monitoring, and fill the live on-call rota.
- Performance: run the expected-volume load test for 100,000 vehicles and 10,000 sales orders with Vehicle Explorer p95 below 2 seconds.
- Product coverage: raise or rescope the coverage target for `services`, `contexts`, and `lib`; the command passes, but the checklist target of 70% is not met by current grouped coverage.
- Release process: attach CodeQL and OSV review evidence, test rollback, record the DR drill, complete RLS pen-test notes, and confirm CLA/DPA needs for enterprise customers.

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

## Slice 3: Security Sign-Off Guardrails

Scope:

- Remove the stale duplicate `send-push-notification` edge-function implementation so only the hardened CORS/JWT/company-scope path remains deployed.
- Restrict `invite-user` so `company_admin` callers can only invite into their own company and cannot grant global access.
- Add `scripts/check-edge-functions.ts` and wire it into `scripts/security-check.sh` to catch duplicate handlers, wildcard CORS, missing Authorization reads, missing `auth.getUser()` checks, and missing role/company guardrails in service-role functions.
- Add `docs/SECURITY_SIGNOFF.md` as the release security review checklist and evidence log.

Exit checks:

```bash
npm run security:edge-functions
bash scripts/security-check.sh
npm run typecheck
```

Still requires external setup before production launch:

- Run `npm run test:rls` against the seeded live Supabase stack and attach evidence in `docs/SECURITY_SIGNOFF.md`.
- Have a release reviewer complete the sign-off table before production cutover.
