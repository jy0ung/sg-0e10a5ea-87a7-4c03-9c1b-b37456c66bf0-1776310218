# Phase 4 HRMS Shared Frontend Extraction

Status: UAT validated
Started: 2026-04-28
Validated: 2026-04-29

## Objective

Reduce duplicated routing and shell behavior between the main web app and the dedicated HRMS web app after the HRMS workspace split.

This phase should stay incremental. Shared code is extracted only where both shells already need the same behavior and where the extraction reduces maintenance risk.

## Slice 1: Location-Preserving Redirects

Phase 3.1 introduced legacy HRMS compatibility routes in both shells:

- main app `/hrms/admin` and `/hrms/leave-calendar`
- dedicated HRMS app mounted aliases such as `/hrms/admin` and `/hrms/leave-calendar`

Both shells need redirects that preserve the current query string and hash during canonicalization. That behavior is now centralized in `src/components/shared/LocationPreservingNavigate.tsx`.

## Implementation Mapping

- `src/components/shared/LocationPreservingNavigate.tsx` provides a shared wrapper around React Router `Navigate` that carries current `search` and `hash` into clean redirect targets.
- `src/main.tsx` uses the shared component for main-app HRMS legacy aliases.
- `apps/hrms-web/src/App.tsx` uses the shared component for dedicated HRMS compatibility aliases.
- `src/components/shared/LocationPreservingNavigate.test.tsx` covers query/hash preservation and explicit target query/hash behavior.

## Slice 2: Shared Page Loading Spinner

The main app route shell, dedicated HRMS app route shell, and sales nested layout each carried a local page-level spinner for lazy route fallbacks.

That behavior is now centralized in `src/components/shared/PageSpinner.tsx`, with an accessible `role="status"` and configurable label.

## Slice 2 Implementation Mapping

- `src/components/shared/PageSpinner.tsx` provides the shared lazy-route loading state.
- `src/main.tsx` uses the shared spinner for main app lazy route fallback.
- `apps/hrms-web/src/App.tsx` uses the shared spinner for dedicated HRMS lazy route fallback and module-access loading.
- `src/components/layout/SalesLayout.tsx` uses the shared spinner for nested sales route fallback.
- `src/components/shared/PageSpinner.test.tsx` covers the accessible loading status.

## Slice 3: Shared Query Client Defaults

The main app route shell and dedicated HRMS app route shell both used the same React Query defaults for freshness, cache retention, focus refetch behavior, and retries.

Those defaults are now centralized in `src/lib/queryClient.ts` so the two shells keep matching cache behavior as HRMS shared frontend extraction continues.

## Slice 3 Implementation Mapping

- `src/lib/queryClient.ts` exports `APP_QUERY_DEFAULTS` and `createAppQueryClient()`.
- `src/main.tsx` creates the main app query client through the shared factory.
- `apps/hrms-web/src/App.tsx` creates the dedicated HRMS query client through the shared factory.
- `src/lib/queryClient.test.ts` covers the shared default options.

## Validation Evidence

- Focused redirect and HRMS metadata tests: `npm run test -- src/components/shared/LocationPreservingNavigate.test.tsx src/lib/hrmsWorkspace.test.ts apps/hrms-web/src/App.test.tsx` passed with 3 files and 9 tests.
- TypeScript: `npx tsc --noEmit` passed.
- Main-app HRMS launcher browser smoke: `npx playwright test e2e/hrms.spec.ts e2e/hrms-admin.spec.ts --project=chromium` passed with 6 Chromium tests.
- Dedicated HRMS browser smoke: `npm run test:e2e --workspace apps/hrms-web` passed with 6 Chromium tests.
- Shared spinner focused tests: `npm run test -- src/components/shared/PageSpinner.test.tsx src/components/shared/LocationPreservingNavigate.test.tsx apps/hrms-web/src/App.test.tsx` passed with 3 files and 6 tests.
- Shared query-client focused tests: `npx vitest run src/lib/queryClient.test.ts src/components/shared/PageSpinner.test.tsx src/components/shared/LocationPreservingNavigate.test.tsx apps/hrms-web/src/App.test.tsx` passed with 4 files and 7 tests.
- Post-spinner browser validation, 2026-04-28: main-app HRMS launcher/handoff smoke and dedicated HRMS browser smoke both passed when run sequentially to avoid dev-server port contention.
- Post-query-client browser validation, 2026-04-28: main-app HRMS launcher/handoff smoke and dedicated HRMS browser smoke both passed after both shells were moved to `createAppQueryClient()`.
- Editor diagnostics: no errors in the shared redirect, main route table, or HRMS web route table.
- UAT image, 2026-04-29: `flc-bi-uat:phase4-shared-frontend-20260429-r2` deployed to container `flc-bi-uat`, healthy on `127.0.0.1:8080`.
- UAT deployment correction, 2026-04-29: the first Phase 4 image used unsupported `VITE_APP_ENV=uat`; browser smoke caught the blank client, UAT was rolled back to `flc-bi-uat:phase3-1-launcher-20260428-r2`, then corrected image `r2` was rebuilt with `VITE_APP_ENV=staging` and promoted after staged browser smoke passed.
- UAT deployment verification, 2026-04-29: `npm run verify:uat` passed for `https://uat.protonfookloi.com/healthz` and confirmed the live main bundle uses `https://uat.protonfookloi.com` as the browser Supabase URL. Browser login was skipped because UAT credentials were not present in this shell.
- UAT HTTP smoke, 2026-04-29: `https://uat.protonfookloi.com/`, `/hrms/`, and `/hrms/admin` returned HTTP 200 with no-store HTML; `/healthz` returned `ok`.
- UAT browser smoke with mocked Supabase auth, 2026-04-29: main `/modules` exposes the HRMS launcher at `/hrms/`; `/hrms/admin` maps to `/hrms/settings`; `/hrms/leave-calendar?view=team#month` maps to `/hrms/leave/calendar?view=team#month`.

## Remaining Candidates

- Shared HRMS route guard helpers, if route gating logic grows beyond the current simple wrappers.
- Shared shell utilities only where both apps already depend on the same behavior.

Keep broad UI package extraction out of scope until duplication becomes concrete enough to justify it.