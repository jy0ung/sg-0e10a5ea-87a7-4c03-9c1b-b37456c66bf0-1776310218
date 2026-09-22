# Production-readiness validation

Status: **RELEASE-CANDIDATE READY FOR STAGING VALIDATION**

Current staging qualification is blocked by the unavailable UAT runtime and missing staging configuration. See [Staging validation and release qualification](STAGING_QUALIFICATION.md) for the current release decision, repaired approval defect, and exact rerun command.

Validated locally on 2026-09-15 against working-tree changes based on `d45023d`. No production system, secret, deployment, or database was changed.

## Assurance established

`npm run test:integration` creates a disposable Supabase stack on isolated ports, applies the full migration history, lints the resulting database, seeds two synthetic companies and authenticated users, executes live integration tests, and destroys the stack.

The gate proves:

- all public tables have RLS enabled;
- every application-owned function is unavailable to the anonymous database role;
- every `SECURITY DEFINER` function uses `pg_catalog, public` as its search path;
- known unscoped authenticated read policies are absent;
- cross-company selection, insertion, updates, and representative RPC calls are rejected;
- users cannot promote their own profile role, scope, or company;
- an already-issued session loses PostgREST/RPC access after account deactivation;
- audit and application logs are isolated by actor company;
- ticket creation, retrieval, cancellation, and persisted state work through real Auth, PostgREST, RLS, RPC, triggers, and PostgreSQL;
- the canonical HRMS leave service persists a request, routes it to the configured approver, rejects self-approval, persists the final decision, and keeps the result tenant-isolated;
- legacy and current approval decision targets coexist with an exact-one-target constraint and assigned-approver enforcement;
- anonymous and ordinary-staff edge-function callers cannot invoke the privileged invite flow.

The integration suite reports 149 passing tests across six files. It includes the existing DMS normalization, sales pipeline, accounts-payable foundation, and tenant matrix suites plus exact production-readiness and release-workflow cases with complete rows.

## Security repairs

Migration `20260915090000_production_readiness_security.sql`:

- removes legacy policies that exposed audit logs, application logs, approval requests, and approval decisions;
- adds restrictive enabled-actor and tenant-company policies so a permissive legacy policy cannot widen access;
- adds a PostgREST pre-request account-state check to close the stale-token window for inactive users;
- rejects self-service authorization-field changes and unsafe company-admin role promotion;
- removes anonymous execution from application-owned functions and limits backend/trigger functions to service-role execution;
- converts report and sales-transition functions that do not need elevation to security-invoker execution;
- repairs three database-linter failures involving branch identifier types and ambiguous PL/pgSQL identifiers.

Migration `20260915100000_approval_decision_compatibility.sql` repairs the dual approval-engine decision model, validates both legacy and canonical targets, and enforces assigned-approver access in database policy.

Privileged edge-function rate limiting now fails closed when its database counter is unavailable. Production image builds require explicit HTTPS public URLs, a public client key, and an internal Supabase proxy URL. Production promotion is manual-only. The deploy always installs Chromium for public verification, conditionally runs credentialed smoke checks after a credential precheck, requires migration-ledger compatibility before promotion, and preserves the previous container for rollback until all verification succeeds.

## Repeatable gates

```bash
npm ci
npm run check:baseline
npm run test:integration
# Equivalent composed command:
npm run check:production-readiness
git diff --check
```

The production Docker image was also built with explicit synthetic HTTPS configuration, started as its non-root nginx user, and returned `200 ok` from `/healthz` with the configured CSP, HSTS, no-sniff, frame-denial, and no-store response headers.

CI runs the disposable Supabase gate for every eligible main/dev pull request or push and keeps the existing optional non-production remote RLS job. Every disposable run uses a unique project ID and deletes its database volumes so cached schemas cannot skip migrations. The production deploy is deliberately **not** an automatic downstream action of CI. CI is evidence; an operator must explicitly dispatch production promotion after reviewing the release gates.

## Required staging evidence

Before release approval:

1. Apply the migrations to an isolated staging project and run the credentialed RLS job there.
2. Run `npm run verify:production` against the staging image with a dedicated smoke account and `PROD_LOGIN_REQUIRED=1`.
3. Verify the deployed Supabase external URL, auth redirect allow-list, `ALLOWED_ORIGINS`, SMTP delivery, edge-runtime function configuration, and Sentry ingestion using staging values.
4. Exercise an administrator invite/deactivate/reactivate flow, an HRMS leave request/approval flow, and one finance/sales state transition with staging users and inspect their persisted audit trail.
5. Confirm PITR, encrypted logical backup delivery, storage versioning, and a completed restore drill. The repository contains runbooks and automation, but `docs/DR_DRILLS.md` has no completed drill.

## Validation boundaries

- Local tests use deterministic synthetic data and shared local development keys. They do not reconcile real production business data.
- The production hostname, DNS/TLS, private Supabase upstream, secrets, SMTP provider, backup destinations, and Sentry project were not accessed.
- HRMS web has build and browser coverage, but its standalone production deployment/configuration is not enabled by the current production workflow.
- HRMS mobile is type-checked and built. Native installation, secure storage, push delivery, background behavior, deep links, and device OS coverage require physical-device or emulator validation.
- Browser smoke suites outside the live integration gate still use mocked data.

These items are release gates, not evidence of a repository defect. Production approval should remain withheld until the staging and operational evidence is recorded.


## 2026-09-22 P0 Release-Safety Status

Completed repository controls:

- manual-only production promotion;
- unconditional browser dependency for production verification;
- pre-promotion migration-ledger compatibility check;
- preserved-container rollback with automatic restore on failed post-promotion verification;
- encrypted logical-backup workflow can use either direct Postgres access or the existing Cloudflare Access SSH path to the host-local Supabase DB container, with mandatory GPG encryption, checksum validation, and plaintext cleanup (PR #88 / `c5f3153`);
- manual logical restore-drill automation consumes only successful encrypted backup artifacts, restores into a network-isolated scratch database, verifies critical relations/migration ledger, records timing evidence, and always cleans scratch state (PR #51).

Operational evidence still open:

- successful encrypted production logical backup;
- verified checksum and isolated restore;
- measured RTO/RPO drill;
- production PITR/storage-versioning confirmation;
- repository branch/ruleset governance.

The connected GitHub integration can read repository rulesets and currently reports none. It cannot access classic branch-protection administration, so governance cannot be completed from this session.
