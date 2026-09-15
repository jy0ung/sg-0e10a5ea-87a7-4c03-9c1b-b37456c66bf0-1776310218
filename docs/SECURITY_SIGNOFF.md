# Security Release Sign-Off

Status: Local production-readiness gate passed; UAT unavailable and staging/operational sign-off blocked
Last updated: 2026-09-15

Use this document for the production release security review. Keep customer-identifying evidence, credentials, and raw logs out of the repository; link to private tickets or internal evidence stores where needed.

## Required Gates

```bash
npm run security:edge-functions
bash scripts/security-check.sh
npm run test:integration
```

`npm run test:integration` creates and destroys an isolated local Supabase stack and synthetic tenants. The staging RLS job remains required before cutover; do not seed synthetic users into production.

## Edge Function Review

| Function | JWT verified | Service-role use constrained | Company boundary | Shared CORS helper | Status |
| -------- | ------------ | ---------------------------- | ---------------- | ------------------ | ------ |
| `invite-user` | Yes | Admin role required; company admins cannot grant global access | `company_admin` limited to own company | Yes | Ready for RLS test evidence |
| `rollover-leave-balances` | Yes | Admin role required | `company_admin` limited to own company | Yes | Ready for RLS test evidence |
| `send-push-notification` | Yes for user callers; service-role webhook allowed | Notify roles required for user callers | Recipients limited to caller company unless global | Yes | Ready for RLS test evidence |

## Sign-Off Record

| Gate | Result | Evidence | Reviewer | Date |
| ---- | ------ | -------- | -------- | ---- |
| Edge function static guardrail | Passed | `npm run security:edge-functions` | | 2026-04-27 |
| Full security script | Passed | `bash scripts/security-check.sh` | | 2026-04-28 |
| RLS/auth/RPC persistence suite | 149 tests passed locally; isolated staging evidence blocked | Disposable Supabase: `npm run test:integration`; database lint, dual approval engines, HRMS leave workflow, and privilege audits passed | | 2026-09-15 |
| Migration reconstruction | Passed locally | Full clean-stack migration application inside `npm run test:integration` | | 2026-09-15 |
| Definer/search-path and anonymous RPC audit | Passed locally | Automated catalog assertions inside `npm run test:integration` | | 2026-09-15 |
| Sentry redaction/user-context review | Passed in Phase 2 slice 1 | `src/services/errorTrackingService.test.ts` | | 2026-04-27 |
| Backup/incident/on-call runbook review | Passed in Phase 2 slice 2 | `docs/BACKUP_DR.md`, `docs/INCIDENT_RESPONSE.md`, `docs/ONCALL.md` | | 2026-04-27 |

## Reviewer Checklist

- No direct client access to service-role keys.
- Edge functions using service-role clients verify caller identity first.
- Tenant-scoped mutations include a `company_id` or equivalent ownership check.
- Browser-facing CORS allow-list is pinned through `ALLOWED_ORIGINS`.
- Logs, Sentry events, and incident docs do not store credentials or customer PII.
- RLS matrix matches actual table and policy behavior.
