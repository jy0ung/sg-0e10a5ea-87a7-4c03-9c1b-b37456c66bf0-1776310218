# Phase 1 Closeout

Status: Closed 2026-04-27

## Scope Closed

- Replaced the vulnerable `xlsx` runtime path with lazy-loaded `exceljs` for workbook import/export flows.
- Added bundle budget enforcement and a static import guard so workbook code stays out of the initial app bundle.
- Moved Vehicle Explorer search, filters, sorting, and pagination onto the `search_vehicles` RPC while retaining client fallback behavior.
- Applied and tracked the required Auto-Aging v2 and Phase 1 vehicle-search migrations on UAT.
- Hardened the UAT release path with same-origin Supabase proxying, Docker build args, and automated UAT verification.
- Completed adjacent auth error-handling hardening discovered during Phase 1 verification.

## Closure Gates

Run these before reopening or extending Phase 1 work:

```bash
npm run lint
npm run typecheck
npm run test
npm run build:budget
npm run verify:uat
```

Latest closeout result on 2026-04-27:

- `npm run lint` passed with 0 errors and 243 existing warnings.
- `npm run typecheck` passed.
- `npm run test` passed: 32 test files, 282 tests.
- `npm run build:budget` passed; `exceljs` stayed in the async vendor chunk and the app entry stayed inside budget.
- `npm run verify:uat` passed for health and public Supabase bundle URL checks; browser login was skipped because UAT credentials are not configured in this environment.

## Deferred Outside Phase 1

- Add GitHub UAT environment secrets `UAT_LOGIN_EMAIL` and `UAT_LOGIN_PASSWORD` so the automated UAT verifier includes the real browser login check.
- Decide the long-term backend topology: keep self-hosted Supabase behind the same-origin proxy or move UAT/staging to a public Supabase project.
- Complete production launch gates that are intentionally broader than Phase 1, including load testing, monitoring, backup drills, and RLS release sign-off.