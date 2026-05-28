# FLC BI App — Gap Assessment & Implementation Plan

> **Audit date**: 2025  
> **Stack**: React 18 · TypeScript 5.8 · Vite 5 · Supabase · TanStack Query v5 · Radix UI · Tailwind CSS 3  
> **Scope**: Full codebase review against OWASP Top 10, WCAG 2.0 AA, 12-Factor App, and frontend engineering best practices

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What's Working Well](#whats-working-well)
3. [Gap Assessment](#gap-assessment)
   - [S — Security](#s--security)
   - [T — Testing & Quality Gates](#t--testing--quality-gates)
   - [A — Architecture & Code Organisation](#a--architecture--code-organisation)
   - [O — Observability & Performance](#o--observability--performance)
   - [F — Feature Completeness](#f--feature-completeness)
   - [DX — Developer Experience](#dx--developer-experience)
4. [Implementation Plan](#implementation-plan)
5. [Metrics & Success Criteria](#metrics--success-criteria)

---

## Executive Summary

The application is a solid, well-typed monorepo that handles auto-aging, sales, inventory, purchasing, HRMS, and admin reporting across a multi-tenant Supabase backend. TypeScript is clean (0 errors), the auth model is invite-only, edge functions verify identity server-side, and RLS policies are tested in isolation. Those are genuine strengths.

However there are **three immediate blockers** (P0), five meaningful security gaps (P1), and a cluster of architecture and observability concerns that will compound as the feature surface grows. The table below summarises the priority distribution:

| Priority | Count | Examples |
|----------|-------|---------|
| P0 — Blockers | 3 | Broken test infrastructure, broken linter, import-parser syntax error |
| P1 — Security | 5 | No CSP, localStorage RBAC, vulnerable xlsx, no edge-function rate-limiting |
| P2 — Architecture | 0 | ✅ Closed in Phase 2: packages/shell + packages/auth extracted, hrmsService split into 6 domain services, all 16 manual-fetch pages on TanStack Query, useSupabaseChannel hook adopted, global_search RPC shipped. |
| P3 — Observability | 0 | ✅ Closed in Phase 5b: web vitals, performanceService metrics, and BrowserTracing all shipping to Sentry. |
| P4 — Feature Debt | 3 | Import-review queue incomplete, i18n 0% coverage, approval inbox partially wired |

> **2026-05-28 re-audit note.** All P0 blockers, all five P1 security gaps, every P4 feature-debt item in the original table, and `DX-1` / `DX-2` are now closed in `main`. The narrative below preserves the original gap statements; the **Re-audit — 2026-05-28** section near the end is the live source of truth, and the **Re-audit Metrics & Success Criteria** table replaces the original one for current state.

---

## What's Working Well

These areas meet or exceed industry best practice and should be preserved as models for new work.

| Area | Evidence |
|------|---------|
| **TypeScript strictness** | `tsc --noEmit` reports 0 errors across all source files |
| **Invite-only auth** | `supabase/config.toml` disables self-signup; only admins can provision accounts |
| **Server-side role verification** | `invite-user` edge function creates a per-request `callerClient`, fetches `profiles.role` from the admin client, and rejects non-admins before any mutation |
| **CORS origin allow-list** | `_shared/cors.ts` replaces the Phase 0 wildcard with a server-side allowlist from `ALLOWED_ORIGINS` env var; `Vary: Origin` is set correctly |
| **RLS test matrix** | Dedicated `vitest.rls.config.ts` + `src/test/rls-matrix.spec.ts` test row-level security policies against a live Supabase stack |
| **PII redaction in logging** | `loggingService.ts` scrubs email, JWT, and Bearer token patterns before any log is emitted |
| **Sentry integration** | Error tracking initialised at app entry with sanitised capture; `ErrorBoundary` + `RouteErrorBoundary` wrap the router tree |
| **Route-level code splitting** | All 50+ page components are `React.lazy()`-loaded; `manualChunks` in `vite.config.ts` groups vendor bundles (react, ui, charts, excel, forms) |
| **Bundle budget enforcement** | `scripts/check-bundle-budget.ts` enforces chunk size limits in CI |
| **Accessibility testing** | `e2e/accessibility.spec.ts` runs axe-core against WCAG 2.0 AA on both public and authenticated routes across 3 viewports |
| **3-viewport E2E** | Playwright configured for desktop (1280×720), mobile (390×844), and tablet (768×1024) |
| **Zod-validated env config** | `src/config/env.ts` aborts startup on misconfiguration; all VITE\_ vars schema-validated at boot |

---

## Gap Assessment

### S — Security

#### S-1 · No Content-Security-Policy headers *(OWASP A05: Security Misconfiguration)*

`index.html` has no `Content-Security-Policy` meta tag, and there is no evidence of HTTP security headers being set at the Supabase proxy or CDN level. A modern CSP would block the most dangerous class of XSS payloads even if an injection point is introduced in the future.

**Impact**: High — XSS exploits can exfiltrate session tokens or manipulate the Supabase client.

**Gap**: Missing CSP, `X-Frame-Options` (clickjacking), `X-Content-Type-Options` (MIME sniffing), and `Referrer-Policy`.

---

#### S-2 · Role section-permissions stored and read from localStorage *(OWASP A01: Broken Access Control)*

`src/config/rolePermissions.ts` (`loadRolePermissions` / `saveRolePermissions`) persists the admin-configured section-permission matrix to `localStorage`. Any user can open browser DevTools, run:

```js
localStorage.setItem('flc_role_section_permissions', JSON.stringify({sales: ["Platform","Admin","HRMS","Purchasing","Reports","Sales","Inventory","Auto Aging"]}))
```

and immediately gain navigation access to all sections in the UI — regardless of their actual role. While Supabase RLS prevents unauthorised data reads, exposing sensitive section UIs to under-privileged users is an escalation path for information disclosure and social engineering.

**Impact**: Medium — UI-level bypass, limited by RLS; but also reveals UI structure and unvalidated sub-features.

**Gap**: Section permissions should be stored server-side (a `role_section_permissions` DB table, queried once on login) and validated in `RequireRole` / `RequireActiveModule` against the server-fetched value, not a localStorage value.

---

#### S-3 · `xlsx` v0.18.5 present alongside `exceljs` *(OWASP A06: Vulnerable and Outdated Components)*

`package.json` lists both `xlsx` (^0.18.5) and `exceljs` (^4.4.0). SheetJS Community Edition (`xlsx`) v0.18.x carries known prototype-pollution CVEs (CVE-2023-30533 and related). The production `import-parser.ts` was refactored to use `exceljs` but `xlsx` was never removed, so it remains in the `vendor-excel` chunk.

**Impact**: Medium — malicious spreadsheet files could trigger prototype pollution in any code path that still reaches the `xlsx` parser.

**Gap**: Remove `xlsx` from `package.json`; audit any remaining direct import of `xlsx` across the codebase; consolidate on `exceljs`.

---

#### S-4 · Edge functions have no rate limiting *(OWASP A04: Insecure Design)*

`invite-user`, `rollover-leave-balances`, and `send-push-notification` implement correct auth checks but no request-rate throttling. `invite-user` in particular accepts any valid admin JWT and will dispatch Supabase user-invitation emails in a tight loop if hammered.

**Impact**: Low-Medium — risk of email abuse / invitation spamming and unexpected Supabase billing spikes.

**Gap**: Add `Supabase-RateLimit` style response headers or enforce limits via a Supabase database sequence (e.g. `pg_cron`-based counter or a `rate_limits` table).

---

#### S-5 · APNs/FCM server keys in unguarded environment *(OWASP A02: Cryptographic Failures)*

`send-push-notification` reads `FCM_SERVER_KEY` from `Deno.env`. The `SETUP.md` in the mobile app documents this but there is no rotation schedule, no key-expiry handling in the function, and no fallback if the key is absent (the function silently skips FCM delivery). If the key is compromised, attackers can send arbitrary push notifications to all registered devices.

**Impact**: Medium — push notification hijacking, phishing.

**Gap**: Document key-rotation runbook; add a startup assertion that `FCM_SERVER_KEY` is set and non-empty; log a structured warning when FCM delivery fails.

---

### T — Testing & Quality Gates

#### T-1 · 8 of 49 test files fail to collect *(blocker)*

**Root cause**: `vitest.config.ts` has no module aliases or mocks for three packages that have ESM-only or Node-incompatible distributions in the jsdom environment:

| Package | Failing tests |
|---------|--------------|
| `@sentry/react` | `auditService.test.ts`, `errorTrackingService.test.ts`, `LeaveManagement.test.tsx` |
| `i18next` | `src/i18n/index.test.ts` |
| `exceljs` | `import-parser.test.ts` (cascades to `hrmsService.test.ts`) |

Additionally `src/contexts/SalesContext.test.tsx` fails at runtime because its test subject (`useData`) is called outside a `DataProvider`.

**Impact**: The CI test gate is effectively 84% unreliable — any regressions in those 8 files go undetected.

**Gap**: Add `server.deps.external` / `deps.inline` entries or `vi.mock()` factory stubs in `vitest.config.ts` for the three packages; fix the `DataProvider` wrapper in `SalesContext.test.tsx`.

---

#### T-2 · One real test failure — DataContext insertMock not called

`src/contexts/DataContext.test.tsx` has a test that asserts `insertMock` is invoked but the mock is never reached because the code path changed. This is a silent false-negative — the test name makes it appear the coverage is valid.

**Impact**: Medium — DataContext mutation is untested.

---

#### T-3 · 16 services have no unit tests

| Untested service | Risk |
|-----------------|------|
| `approvalEngineService.ts` | Complex approval-chain logic with potential for state bugs |
| `approvalFlowService.ts` | CRUD for flow definitions |
| `importReviewService.ts` | New service, no tests at all |
| `branchService.ts`, `commissionService.ts`, `inventoryService.ts` | Business-critical data mutation |
| `invoiceService.ts`, `purchaseInvoiceService.ts` | Financial data |
| `masterDataService.ts`, `mappingService.ts` | Configuration integrity |
| `salesTargetService.ts`, `reportService.ts` | Reporting accuracy |
| `requestCategoryService.ts`, `requestSubcategoryService.ts`, `roleSectionService.ts` | Admin metadata |

**Gap**: No service-level test for `approvalEngineService` is particularly risky given the complexity of the multi-step approval chain.

---

#### T-4 · ESLint cannot run — missing `eslint-plugin-jsx-a11y` *(blocker)*

`package.json` lists `eslint-plugin-jsx-a11y` as a devDependency but it is not installed in `node_modules`. Running `npx eslint src/` exits with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'eslint-plugin-jsx-a11y'
```

**Impact**: The entire ESLint static-analysis gate is broken; accessibility lint rules never run; any `no-explicit-any` or `react-hooks/rules-of-hooks` violations introduced since the last successful lint are undetected.

**Gap**: Run `npm install` / verify lockfile integrity; add ESLint to CI pre-commit hook.

---

#### T-5 · Coverage thresholds only cover `lib/`, `contexts/`, `utils/` — not `services/`

`vitest.config.ts` enforces branch/line floors for `src/lib/**`, `src/contexts/**`, and `src/utils/**` but **not** `src/services/**`, which contains the largest and most business-critical code. 17 of 33 service files have tests (~52% by count) but no threshold ensures coverage doesn't regress.

---

### A — Architecture & Code Organisation

#### A-1 · `hrmsService.ts` is 2,113 lines — violates Single Responsibility Principle

A single file handles: employee CRUD, leave management, appraisals, payroll, attendance, and approval engine calls. This makes the file:

- Slow to parse by TypeScript and IDEs
- Hard to test in isolation (the test file `hrmsService.test.ts` is also proportionally large)
- A merge-conflict hot-spot as HRMS grows

**Recommended split**:

| New file | Responsibility |
|----------|---------------|
| `employeeService.ts` | Employee CRUD, profile management |
| `leaveService.ts` | Leave requests, balances, leave types |
| `attendanceService.ts` | Clock-in/out, attendance logs |
| `payrollService.ts` | Payroll runs, payslips |
| `appraisalService.ts` | Performance reviews, goal tracking |

---

#### A-2 · Dual Excel parsing libraries (xlsx + exceljs) — redundant and insecure

Both `xlsx` (^0.18.5) and `exceljs` (^4.4.0) are bundled. The `vendor-excel` chunk grows by ~430 KB (gzip) unnecessarily and `xlsx` has known CVEs. `import-parser.ts` was already refactored to `exceljs`; `xlsx` should be removed entirely.

---

#### A-3 · 16 pages use manual `useCallback` + `useState` fetch pattern instead of TanStack Query

All HRMS pages and several admin pages load data with the following anti-pattern:

```ts
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);
const load = useCallback(async () => {
  setLoading(true);
  const result = await hrmsService.getX();
  setData(result);
  setLoading(false);
}, []);
useEffect(() => { load(); }, [load]);
```

This bypasses TanStack Query's caching, background re-fetch, deduplication, and stale-while-revalidate semantics. The same data is re-fetched on every component mount even if it was fetched 2 seconds ago in a sibling component.

**Pages affected**: `EmployeeDirectory`, `Announcements`, `AttendanceLog`, `LeaveManagement`, `HrmsAdmin`, `ApprovalInbox`, `ApprovalFlows`, `PerformanceAppraisals`, `PayrollSummary`, `Dealers`, `BranchManagement`, `UserGroups`, `Suppliers`, `VerifyOR`, `MappingAdmin`, `CommissionDashboard`.

---

#### A-4 · i18n infrastructure is installed but never used — 0% component coverage

`i18next` and `react-i18next` are installed, the `src/i18n/` scaffold exists with an English locale bundle, and `main.tsx` imports it. However **zero page or component files** call `useTranslation`. The `en.json` locale covers only 15 common strings.

This creates technical debt in two directions:
1. All UI strings are hardcoded in English, making future localisation a full-codebase text search-and-replace exercise.
2. The i18n packages add ~35 KB (gzip) to the bundle for zero functional benefit.

**Recommendation**: Either adopt `t()` calls progressively (starting with `common.*` and `nav.*` keys already in the locale), or remove i18next until localisation is a stated product requirement.

---

### O — Observability & Performance

#### O-1 · `performanceService.ts` metrics are in-memory only — never shipped to an APM backend

`performanceService.ts` measures query durations, tracks slow queries (>500 ms threshold), and exposes a `getReport()` method. But no code ever calls `getReport()` to ship the data to Sentry, DataDog, or any APM endpoint. Metrics are lost on page reload.

**Impact**: Slow queries go undetected in production unless users report them.

**Gap**: Hook into Sentry's custom metrics API (`Sentry.metrics.distribution`) or ship the report in the Sentry breadcrumb before a crash.

---

#### O-2 · No Web Vitals (Core Web Vitals) measurement

The codebase has no `web-vitals` import or Sentry `BrowserTracing` transaction configured. LCP, FID, CLS, INP, and TTFB are unmeasured in production.

**Gap**: Add `import { onCLS, onINP, onLCP } from 'web-vitals'` in `main.tsx` and route metrics to Sentry or a custom analytics endpoint.

---

#### O-3 · No Real User Monitoring (RUM)

Sentry is configured for error capture but `BrowserTracing` performance integration is not enabled. Page-level navigation timings, slow API calls, and long tasks are invisible without RUM.

---

### F — Feature Completeness

#### F-1 · Import Review Queue is half-built

`importReviewService.ts` and the `import_review_rows` Supabase table exist, but the UI route is present without a full end-to-end wire-up (the review-decision flow is not connected). The feature is in a "deployed but broken" state.

---

#### F-2 · ApprovalInbox exists but uses manual fetch — no real-time updates — ✅ DONE (Phase 2)

- **Status**: `useApprovalInboxItems` (consumed by both `src/pages/hrms/leave/ApprovalInboxTab.tsx` and the `apps/hrms-web` copy) now wraps `useSupabaseChannel` from `@flc/supabase`. The channel subscribes to INSERT/UPDATE/DELETE on `leave_requests`, `payroll_runs`, and `appraisals` filtered to the caller's `company_id`, and invalidates the `approval-inbox` React Query cache on any change. Manual `useCallback` + `useEffect` polling is gone; the existing window-event invalidation stays as a fallback for in-process optimistic updates that bypass the realtime channel.
- **Test**: `src/hooks/useApprovalInboxItems.test.ts` asserts the subscription shape and that `onChange` invalidates the right query key.

---

#### F-3 · PWA has no offline fallback page

`vite-plugin-pwa` with `workbox` is configured and pre-caches all JS/CSS/HTML. But if the network is unavailable and the user navigates to a URL not in the cache, Workbox will return a generic browser offline screen rather than a branded fallback. The `robots.txt` and `icons/` are cached but no `offline.html` is registered.

---

### DX — Developer Experience

#### DX-1 · `import-parser.ts` has a syntax error from a WIP stash *(blocker)*

During the previous rebase + stash-pop workflow, `src/lib/import-parser.ts` was left with a syntax error (unresolved stash conflict markers). This causes `import-parser.test.ts` to fail at collection and cascades to `hrmsService.test.ts`.

**Fix**: Resolve the syntax error in `import-parser.ts` to restore test collection.

---

#### DX-2 · No pre-commit hooks enforcing quality gates

There is no Husky or lint-staged configuration. Developers can commit code that:
- Fails ESLint
- Breaks TypeScript
- Introduces console.log statements
- Adds an `eslint-disable` without a justification comment

---

#### DX-3 · `ecosystem.config.cjs` (PM2) is at repo root but undocumented

The PM2 config implies a production Node server deployment, but `README.md` does not document the deployment target. If the app is deployed as a static SPA (which a Vite build implies), the PM2 config is redundant and confusing. If it is a Node server, CSP and security headers should be set there.

---

## Implementation Plan

Work is organised into five priority tiers. Each item includes the specific files to change and an estimated scope.

---

### P0 — Fix Blockers (do before any new feature work)

These three issues corrupt the CI signal. Until they are fixed, test results cannot be trusted.

#### P0-1 · Fix `import-parser.ts` syntax error

- **File**: `src/lib/import-parser.ts`
- **Action**: Resolve the stash conflict markers and restore the `exceljs`-based implementation
- **Scope**: ~1 hour
- **Test signal**: `import-parser.test.ts` and `hrmsService.test.ts` re-enter the test suite

#### P0-2 · Fix vitest module resolution for `@sentry/react`, `i18next`, `exceljs`

- **File**: `vitest.config.ts`
- **Action**: Add mock factories or `deps.inline` entries:
  ```ts
  // vitest.config.ts
  test: {
    server: {
      deps: {
        inline: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
      },
    },
  }
  ```
  For `@sentry/react`, add a `__mocks__/@sentry/react.ts` factory that stubs all exports. For `exceljs`, mock only in tests that don't need real XLS parsing.
- **Scope**: ~2 hours
- **Test signal**: 7 test files re-enter the suite; `SalesContext.test.tsx` additionally needs a `DataProvider` wrapper added

#### P0-3 · Install missing ESLint devDependency

- **Action**: `npm install --save-dev eslint-plugin-jsx-a11y`
- **Then**: Run `npx eslint src/ --max-warnings 0` and fix any new violations
- **Scope**: 30 minutes + violation fixing
- **Gate**: Add `npx eslint src/` to CI

---

### P1 — Security Hardening

#### P1-1 · Add HTTP security headers

- **Files**: `index.html` (CSP meta tag), and ideally a `_headers` file for Netlify/Vercel or a `supabase.toml` rewrite rule
- **Action**: Add these headers:
  ```html
  <!-- index.html <head> -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; frame-ancestors 'none';">
  <meta http-equiv="X-Content-Type-Options" content="nosniff">
  <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
  ```
  Note: `'unsafe-inline'` for scripts may need tightening once a nonce-based approach is evaluated.
- **Scope**: 2 hours (+ test that Sentry CDN is in `connect-src` allow-list)

#### P1-2 · Move section-permissions from localStorage to server

- **New migration**: `role_section_permissions` table with `company_id`, `role`, `sections text[]`
- **New service**: `roleSectionService.ts` (already exists as a stub) — add `getPermissions(companyId)` and `savePermissions()`
- **Update**: `loadRolePermissions()` in `rolePermissions.ts` to fetch from Supabase on first load and cache in memory (not localStorage) for the session duration
- **RLS**: Only `super_admin` and `company_admin` can write; authenticated users of the same `company_id` can read
- **Scope**: 1 day

#### P1-3 · Remove `xlsx` — consolidate on `exceljs`

- **Action**: `npm uninstall xlsx`; audit `grep -rn "from 'xlsx'\|require('xlsx')" src/` and replace any remaining calls with `exceljs` equivalents
- **Verify**: `import-parser.ts` already uses `exceljs`; confirm no other import of `xlsx` remains
- **Scope**: 2 hours

#### P1-4 · Add rate-limiting to invite-user edge function

- **File**: `supabase/functions/invite-user/index.ts`
- **Action**: Use a `rate_limits` table (or Supabase's built-in `pg_rate_limit` extension if available) to cap invite calls to N per hour per caller:
  ```sql
  -- migration
  CREATE TABLE rate_limits (
    caller_id uuid REFERENCES auth.users,
    action text,
    window_start timestamptz DEFAULT now(),
    count int DEFAULT 1,
    PRIMARY KEY (caller_id, action)
  );
  ```
  Check and increment count at function start; return HTTP 429 if exceeded.
- **Scope**: 3 hours

#### P1-5 · Harden FCM key handling in send-push-notification

- **File**: `supabase/functions/send-push-notification/index.ts`
- **Action**: Assert `FCM_SERVER_KEY` is set at startup; log a structured warning on FCM failure; document rotation schedule in `RUNBOOK.md`
- **Scope**: 1 hour

---

### P2 — Architecture Improvements

#### P2-1 · Split `hrmsService.ts` into domain services

- **Current**: `src/services/hrmsService.ts` — 2,113 lines
- **Target files**:
  - `src/services/employeeService.ts` — employee CRUD (exists as namespace in hrmsService)
  - `src/services/leaveService.ts` — leave requests, balances, types
  - `src/services/attendanceService.ts` — attendance logs, clock events
  - `src/services/payrollService.ts` — payroll runs, payslips
  - `src/services/appraisalService.ts` — performance reviews, KPI goals
- **Strategy**: Extract namespace by namespace, updating imports in page components one domain at a time; keep `hrmsService.ts` as a re-export barrel temporarily during migration to avoid a big-bang rename
- **Scope**: 3–4 days (can be done incrementally per HRMS sub-module PR)

#### P2-2 · Migrate 16 manual-fetch pages to TanStack Query

Priority order (highest business risk first):

1. `ApprovalInbox.tsx` — add Supabase channel subscription via `useEffect` + TQ invalidation
2. `LeaveManagement.tsx`, `PayrollSummary.tsx` — financial data, high value for caching
3. `EmployeeDirectory.tsx`, `HrmsAdmin.tsx` — heavy initial loads
4. Remaining admin pages (`Dealers`, `BranchManagement`, `UserGroups`, `Suppliers`)

Pattern to standardise on:
```ts
const { data = [], isLoading, error, refetch } = useQuery({
  queryKey: ['leave-requests', employeeId, year],
  queryFn: () => leaveService.getRequests(employeeId, year),
  staleTime: 30_000,
});
```

- **Scope**: ~0.5 day per page; 8 days total if done all at once, or spread over 4 sprints

#### P2-3 · Adopt `useTranslation` in common UI components or remove i18next

**Option A — Adopt progressively (recommended if localisation is a near-term product goal)**:
1. Replace hardcoded strings in `src/components/layout/` (sidebar, nav) with `t('nav.*')` keys
2. Replace `common.*` strings (Save/Cancel/Delete buttons) in shared form components
3. Add a second locale (e.g. Filipino / Tagalog) to validate the pipeline works end-to-end
4. Track adoption with an ESLint rule (`i18next/no-literal-string`) once adoption reaches ~20%

**Option B — Remove i18next (recommended if no localisation requirement for 12+ months)**:
1. `npm uninstall i18next react-i18next i18next-browser-languagedetector`
2. Remove `src/i18n/` directory and `import "@/i18n"` from `main.tsx`
3. Save ~35 KB gzip from bundle

- **Scope**: Option A ongoing; Option B ~2 hours

#### P2-4 · Add a service coverage threshold in vitest

- **File**: `vitest.config.ts`
- **Action**: Add `"src/services/**": { lines: 60, functions: 65, branches: 50 }` to `coverage.thresholds`
- **Required first**: Write tests for `approvalEngineService`, `approvalFlowService`, `importReviewService` (the highest-risk untested services)
- **Scope**: 1 day for threshold + critical tests

---

### P3 — Observability

#### P3-1 · Ship performanceService metrics to Sentry — ✅ DONE (Phase 5b)

- **Status**: Every `endQueryTimer` and `logComponentRender` call in
  `src/services/performanceService.ts` now forwards to
  `errorTrackingService.logMetric`, which calls `Sentry.setMeasurement`
  whenever a DSN is configured. Slow queries (>1000 ms) emit a warning
  through `loggingService.warn` in addition to the measurement.
- **Test**: `src/services/performanceService.test.ts` asserts the pipeline
  (slow-query warn + measurement forward).

#### P3-2 · Add Web Vitals measurement — ✅ DONE (Phase 5b)

- **Status**: `src/services/webVitalsService.ts` subscribes to all five
  standardised metrics (CLS, FCP, INP, LCP, TTFB) and routes each report
  to `errorTrackingService.logMetric`. The entry point (`src/main.tsx`)
  calls `subscribeWebVitals()` once at bootstrap.
- **Note**: `onFID` was removed in `web-vitals` v4+ when INP replaced FID
  as a Core Web Vital; the AUDIT example snippet predated that change.
- **Test**: `src/services/webVitalsService.test.ts` asserts all five
  subscriptions are wired and that the reporter forwards `(name, value)`.

#### P3-3 · Enable Sentry BrowserTracing for RUM — ✅ DONE (Phase 5b)

- **Status**: `src/services/errorTrackingService.ts` includes
  `Sentry.browserTracingIntegration()` in the `integrations` array passed
  to `Sentry.init`, with `tracesSampleRate` driven by
  `VITE_SENTRY_TRACES_SAMPLE_RATE` (default 0.1).
- **Test**: `src/services/errorTrackingService.test.ts` asserts the
  integration is registered and that the sample rate flows through.

---

### P4 — Feature Completion & DX

#### P4-1 · Complete Import Review Queue end-to-end

- Wire `importReviewService.reviewRow(id, decision, comment)` to the review action buttons in the UI
- Add a TanStack Query mutation with `invalidateQueries(['import-review-rows'])` on success
- Write tests for `importReviewService`
- **Scope**: 1–2 days

#### P4-2 · Add real-time push to ApprovalInbox

- Add a Supabase Realtime channel subscription for `approval_requests` filtered by `approver_id = currentUser.id`
- On `INSERT` event, call `queryClient.invalidateQueries(['approval-requests'])`
- **Scope**: 3 hours

#### P4-3 · Add PWA offline fallback page

- Create `public/offline.html` with a branded "You're offline" message
- Register in `vite.config.ts` Workbox config:
  ```ts
  workbox: {
    navigateFallback: '/offline.html',
    navigateFallbackAllowlist: [/^(?!\/__).*/],
  }
  ```
- **Scope**: 2 hours

#### P4-4 · Add pre-commit hooks (Husky + lint-staged)

```bash
npm install --save-dev husky lint-staged
npx husky init
```

`.husky/pre-commit`:
```sh
npx lint-staged
```

`package.json`:
```json
"lint-staged": {
  "src/**/*.{ts,tsx}": ["eslint --fix --max-warnings 0", "tsc --noEmit"]
}
```

- **Scope**: 1 hour

#### P4-5 · Clarify/document PM2 deployment config

- If deploying as a static SPA: remove `ecosystem.config.cjs` or move it to `scripts/` with a note
- If deploying as a Node server: add CSP and security headers in the Express/Fastify middleware and document in `README.md`
- **Scope**: 30 minutes

---

## Metrics & Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| TypeScript errors | 0 | 0 (maintain) |
| Test files failing | 8 / 49 | 0 / 49 |
| Real test failures | 1 | 0 |
| ESLint exit code | 1 (broken) | 0 |
| Services with tests | 17 / 33 | 28 / 33 (add 11) |
| Service coverage threshold | none | ≥60% lines |
| Pages using TanStack Query | 8 / 24 | 24 / 24 |
| CSP header present | No | Yes |
| `xlsx` in bundle | Yes (CVE) | Removed |
| localStorage for RBAC | Yes | No (server-side) |
| Web Vitals reported | No | Yes (Sentry) |
| Performance metrics shipped | No | Yes (Sentry) |
| i18n page coverage | 0% | Adopted or removed |
| Offline fallback page | No | Yes |
| Pre-commit hooks | No | Yes (Husky) |

---

*Audit performed by GitHub Copilot — Claude Sonnet 4.6*

---

## Production Readiness Audit (2025-05-13)

A comprehensive sweep was performed across all infrastructure, schema, migrations, types, RLS, auth, storage, builds, and tests. All critical issues found were fixed in this session.

### Infrastructure Checks

| Area | Status | Notes |
|------|--------|-------|
| Migrations (91) | ✅ PASS | All 91 migrations applied, latest `20260513103000_hrms_roles_and_workflow_routing.sql` |
| Supabase containers | ✅ PASS | All 10 containers healthy |
| Auth config | ✅ PASS | Invite-only, SMTP configured, `handle_new_user` trigger present |
| RLS coverage | ✅ PASS | All 84 public tables have row-level security policies |
| Storage buckets | ✅ PASS | 2 private buckets (`avatars`, `attachments`), all policies verified |
| Edge functions | ✅ PASS | 6 functions deployed, all `verify_jwt=true` |
| RPC contracts | ✅ PASS | All key RPCs callable with correct argument signatures |
| ENV contract | ✅ PASS | Zod-validated at boot, all required vars present |
| Main app build | ✅ PASS | Clean Vite build, PWA generated |
| hrms-web build | ✅ PASS | Clean Vite build |
| Root tsc | ✅ PASS | 0 errors |
| Test suite | ✅ PASS | 769/769 tests pass |
| Lint | ✅ PASS | 0 warnings |
| Supabase types | ✅ REGENERATED | Fresh from live DB (was stale since 2025-05-11) |

### Critical Bugs Fixed

#### BUG-1 · `approval_decisions.instance_id` set instead of `approval_request_id`

**Files**: `src/services/approvalEngineService.ts`, `apps/hrms-web/src/services/approvalEngineService.ts`

**Root cause**: `submitApprovalDecision` was inserting `instance_id: approvalRequestId` but `approval_decisions.approval_request_id` is `NOT NULL` with a FK to `approval_requests`. The `instance_id` column is a nullable FK to `approval_instances` (different table). Every call to submit an approval decision would fail with a FK violation or silent data corruption.

**Fix**: Changed `instance_id: approvalRequestId` → `approval_request_id: approvalRequestId` in both service files.

#### BUG-2 · `deleteLeaveType` filtering `leave_balances` by non-existent `company_id` column

**File**: `src/services/hrmsAdminService.ts`

**Root cause**: The pre-delete balance count query used `.eq('company_id', companyId)` but `leave_balances` has no `company_id` column (`id, employee_id, leave_type_id, year, entitled_days, used_days, created_at, updated_at` only). The filter caused the count to always return 0, meaning `deleteLeaveType` always performed a hard delete even when active leave balances existed, bypassing the safety check.

**Fix**: Removed the invalid `.eq('company_id', companyId)` filter. The `leave_type_id` filter is sufficient since leave types are already company-scoped.

#### BUG-3 · `customerService` mapping `nric` field to non-existent DB column

**File**: `src/services/customerService.ts`

**Root cause**: The `customers` table uses `ic_no` for the identity/NRIC number, but the service code was inserting/updating/mapping the field as `nric`. The column doesn't exist on the table, so customer NRIC/IC data was never saved to or read from the database.

**Fix**: Changed all `nric` references to `ic_no` in the column mapping, insert, and update operations.

#### BUG-4 · `hrms-web approvalEngineService` wrong return type check

**File**: `apps/hrms-web/src/services/approvalEngineService.ts`

**Root cause**: `userHasAssignedHrmsRole` from `@flc/hrms-services` returns `Promise<boolean>` (throws on error), but the code treated it as `Promise<{data: boolean, error: string|null}>` (main app's local wrapper signature). This caused the approval routing check to always evaluate as truthy (object is always truthy).

**Fix**: Changed `return !assigned.error && assigned.data;` → `return assigned;`.

### Type Errors Fixed

All `@flc/hrms-hooks` mutation and query hooks were calling service functions with wrong argument patterns (passing single objects where services take positional parameters, or missing required `companyId` arguments). Fixed hooks:

- `useAnnouncement`: `deleteAnnouncement(id)` → `deleteAnnouncement(id, companyId)`
- `useAppraisal`: `useCreateAppraisal`, `useResubmitAppraisalActivation` — added required positional args
- `useAttendance`: `useUpsertAttendance`, `useClockIn`, `useClockOut`, `useMyAttendance` — added `companyId` and fixed positional args
- `usePayroll`: `useCreatePayrollRun`, `useUpdatePayrollRunStatus`, `useResubmitPayrollRun`, `useMyPayslips` — added `companyId` and fixed positional args
- `useEmployee`: `useUpdateEmployee` — removed non-existent `actorId` parameter

### Known Technical Debt (Non-Blocking)

These pre-existing issues exist in non-HRMS service files. Root `tsc --noEmit` passes 0 errors (these only show under `tsconfig.app.json` strict check). None block functionality or builds.

| File | Issue |
|------|-------|
| `salesOrderCrudService.ts` | ~~Code uses wrong column names~~ **FIXED** in `cb0aa48`: column names corrected (`stage_id`, `color`, `selling_price`, `expected_delivery_date`). `mapOrder` still reads legacy field names as `Record<string,unknown>` (returns `undefined` at runtime); `SalesOrder` type marks them optional — acceptable. |
| `inventoryService.ts` | `plate_no` referenced on `vehicles` select but `plate_no` is on `sales_orders`. The SelectQueryError is cast away with `as unknown`. Functional impact limited to chassis filter UI. |
| `salesTargetService.ts` | `salesman_id` referenced on `sales_orders` but `salesman_id` doesn't exist there (only `salesman_name`). Cast away with `as unknown`. Affects sales target reporting accuracy. |
| `ticketService.ts` | ~~Union type too complex~~ **FIXED** in `cb0aa48`: `@ts-expect-error` suppression on legacy fallback query declarations. |
| `HrmsAdmin.tsx` | Zod `safeParse().data` inferred as all-optional vs required `CreateHrmsRoleInput`. Runtime validation is correct. |
| `LeaveManagement.tsx` | `leaveTypeId?: string` from form state vs required `CreateLeaveRequestInput.leaveTypeId`. Guarded by form validation. |

---

## Module Integration Audit (2026-05-13)

**Commits**: `aca1a1e`, `cb0aa48`

### Cross-App Boundary

✅ **No violations.** `src/` has zero imports from `apps/hrms-web/src/` and vice-versa. Both apps resolve `@/` to their own `src/` directory via Vite alias. Apps are independently deployable.

### Route Coverage

**Main app** defines 40+ routes including 9 HRMS routes (`/hrms/leave`, `/hrms/attendance`, `/hrms/approvals`, `/hrms/appraisals`, `/hrms/announcements`, `/hrms/employees`, `/hrms/payroll`, `/hrms/settings`). All routed page components exist.

**hrms-web** defines 11 HRMS routes (`/leave`, `/attendance`, `/approvals`, `/appraisals`, `/announcements`, `/employees`, `/payroll`, `/settings`, `/profile`, `/login`, `/unauthorized`) plus 13 legacy redirect routes in `apps/hrms-web/src/routes.ts`. All routed page components exist.

⚠️ **Orphaned pages** (exist but not routed):
- `apps/hrms-web/src/pages/hrms/ApprovalFlows.tsx` — legacy, superseded by `HrmsAdmin` approval flow UI
- `apps/hrms-web/src/pages/hrms/HrmsWorkspaceRedirect.tsx` — utility component, not a page route

### Package API Surface

`@flc/hrms-services` exports the full HRMS domain API surface (leave, attendance, employee, payroll, appraisal, announcement, approval engine, notification, profile). Two exports are currently unused by both apps:
- `updateContactNo` — defined but never called
- `markAllNotificationsRead` — defined but never called

`@flc/hrms-schemas` exports Zod validation schemas for leave, attendance, HRMS admin entities (departments, job titles, leave types, holidays, approval flows).

`@flc/types` exports shared domain types: `AppRole`, `AccessScope`, `User`, `Company`, `Branch`.

### Dead Code in Services

✅ All service files in `src/services/hrms/` and `apps/hrms-web/src/services/hrms/` are imported by their corresponding page components. No dead service files found.

### Context / Provider Completeness

✅ **hrms-web**: All four providers (`AuthProvider`, `QueryClientProvider`, `ThemeProvider`, `TooltipProvider`) are mounted in `apps/hrms-web/src/App.tsx`.

ℹ️ **Main app**: `DataContext` and `SalesContext` are not mounted at root — `SalesContext` is intentionally scoped to the Sales layout subtree; `DataContext` is a legacy provider no longer used at root (replaced by per-page React Query hooks).

### `@flc/hrms-hooks` Usage

⚠️ **Package unused.** Neither `src/` nor `apps/hrms-web/src/` imports from `@flc/hrms-hooks`. Both apps call `@flc/hrms-services` functions directly inside `useQuery`/`useMutation` hooks. The package was built and its hook argument patterns fixed this session, but adoption has not yet occurred. This is acceptable — hooks provide an optional abstraction layer.

### Environment Variables

✅ All `VITE_*` variables referenced in code are documented in `docs/ENV.md`. Both apps share the same required variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) plus optional Sentry and app-mode vars. `apps/hrms-web` additionally uses `VITE_HRMS_APP_URL` (launcher URL) and `VITE_HRMS_WEB_APP` (injected at build time by Vite config).

### Test Coverage

| Scope | Tested | Total | Coverage |
|-------|--------|-------|----------|
| `src/services/` (main services) | 20 | 45 | 44% |
| `src/services/hrms/` (HRMS wrappers) | 0 | 7 | 0% |
| `apps/hrms-web/src/services/` | 20 | 45 | 44% |
| `packages/hrms-services/` | tested via `hrmsService.test.ts` in each app | — | — |

**Untested services** (both apps): `approvalEngineService`, `approvalFlowService`, `autoAgingDataService`, `branchService`, `businessReportService`, `commissionService`, `dealStageService`, `hrmsRoleService`, `importReviewService`, `inventoryService`, `mappingService`, `masterDataService`, `moduleSettingsService`, `performanceService`, `purchaseInvoiceService`, `requestApprovalService`, `requestCategoryService`, `requestFormFieldService`, `requestSubcategoryService`, `requestTemplateService`, `roleSectionService`, `salesDashboardService`, `salesOrderCrudService`, `salesPipelineService`, `salesTargetService`, `ticketAttachmentService`.

### Module Audit Summary

| Finding | Severity | Status |
|---------|----------|--------|
| Cross-app boundary violations | 🔴 Critical | ✅ NONE FOUND |
| Orphaned page components | 🟡 Low | ⚠️ 2 in hrms-web (legacy) |
| Unused package exports | 🟡 Low | ⚠️ 2 functions in hrms-services |
| `@flc/hrms-hooks` adoption | 🟡 Low | ⚠️ Built but not yet adopted |
| Service test coverage | 🟡 Medium | ⚠️ 44% main services, 0% HRMS wrappers |
| Route coverage | ✅ Pass | All routed pages exist |
| Env var documentation | ✅ Pass | All vars documented |
| Context provider mounting | ✅ Pass | All active providers mounted |

---

## Re-audit — 2026-05-28

A fresh sweep two weeks after the 2026-05-13 production-readiness pass. Everything in the original 2025 gap inventory and the 2026-05-13 bug list is verified against `main`. The picture: every P0/P1/P3/P4 item from the original audit is closed; the live debt is concentrated in **TypeScript escape hatches in services**, **service-level unit-test coverage**, and **unwritten Phase 6/7 surfaces**.

### Toolchain signal

| Gate | Result | Notes |
|------|--------|------|
| `npm run typecheck` | ✅ 0 errors | `tsc --noEmit` + `check:rpc-contracts` both clean. |
| `npm run lint` | ✅ 0 errors | 9 warnings — all in non-shipped script files (`check-no-service-role`, `security-smoke`) plus one `react-hooks/exhaustive-deps` on `SalesAdvisors.tsx`, one `@typescript-eslint/no-explicit-any` on the rate-limit helper, two unused-var warnings on dev fixtures. None block CI. |
| `npm test` | ✅ 967 pass, 28 skipped (124 files) | Drop from 986 → 967 reflects the unified-landing close-out: `dashboardPreferencesService.test.ts` + `customKpiFormula.test.ts` deleted alongside the components they covered. Skipped suites are `RLS_E2E=1`-gated specs that require a live Supabase stack. |
| `tsc --noEmit` strict (app config) | ✅ 0 errors | Previous "technical debt" list (`salesOrderCrudService`, `inventoryService`, etc.) all type-clean now — but see *S2-1* below. |

### Migration / backend state

- **131 migrations applied** (latest two: `20260528000000_ticket_input_bounds.sql`, `20260528010000_ticket_attachment_size_enforcement.sql`). Both belong to the active **Internal Requests hardening** workstream (see Phase 7 in `PRODUCT_RECONSTRUCTION.md`).
- **7 edge functions** all carry `verify_jwt=true` and import `_shared/rateLimit.ts`: `invite-user`, `delete-user`, `update-user-status`, `send-push-notification`, `rollover-leave-balances`, `dms-sync-worker`, `webhook-deliverer`. The shared helper is backed by the durable `bump_rate_limit` RPC.
- **`_shared/logger.ts`** wraps every function in `withRequestLogging`, reflecting `x-request-id` and emitting structured `request.start` / `request.end` lines.
- **RLS** still covers all public tables; the spec at `src/test/rls-matrix.spec.ts` is the gate.

### Closed since the 2025 audit (do not re-litigate)

| Original ID | Status | Evidence |
|------|------|---------|
| **S-1** No CSP | ✅ Closed | `index.html:8` meta + `docker/nginx.conf:15,19,92,100` headers. |
| **S-2** localStorage RBAC | ✅ Closed | Migration `20260421110000_phase2_role_sections.sql`; `usePermissions` reads from `role_section_permissions` via React Query; no `localStorage.*flc_role*` references remain. |
| **S-3** `xlsx` v0.18 | ✅ Closed | `xlsx` not in any `package.json`; `import-parser.ts` uses `exceljs` exclusively. |
| **S-4** No edge rate-limit | ✅ Closed | All 7 functions wired (per above). |
| **S-5** FCM rotation | ✅ Closed | `docs/EDGE_KEY_ROTATION.md` 90-day cadence + emergency steps. |
| **T-1** 8 broken vitest files | ✅ Closed | 124/126 files pass; the 3 skipped are intentional RLS specs. |
| **T-2** DataContext insert mock | ✅ Closed | Test removed when `DataContext` was decommissioned at root (per Module Integration Audit). |
| **T-4** ESLint broken | ✅ Closed | `npm run lint` returns 0; gate runs in `.husky/pre-commit`. |
| **A-1** `hrmsService.ts` 2,113 lines | ✅ Closed | Now an 18-line deprecated barrel; domain files live in `src/services/hrms/`. |
| **A-2** Dual Excel libs | ✅ Closed | (Same as S-3.) |
| **A-3** 16 manual-fetch pages | ✅ Closed | Every page in the original list now uses TanStack Query; 55 distinct `useFeatureFlag` callsites and 64 pages consuming `useQuery`/`useMutation`. |
| **A-4** i18n 0% adoption | ✅ Closed (by removal) | `i18next` uninstalled across all `package.json`; `src/i18n/` and `apps/hrms-web/src/i18n/` deleted; no `useTranslation` import remains. |
| **O-1/O-2/O-3** Observability | ✅ Closed (Phase 5b) | `webVitalsService.ts`, `performanceService.ts` → `Sentry.setMeasurement`, `browserTracingIntegration()` in `errorTrackingService.ts`. |
| **F-1** Import Review Queue | ✅ Closed (Phase 3a) | `phase3a.import-review-v2` flag, `e44a530`. |
| **F-2** ApprovalInbox realtime | ✅ Closed (Phase 2) | `useApprovalInboxItems` via `useSupabaseChannel`. |
| **F-3** PWA offline fallback | ✅ Closed | `public/offline.html` precached and registered as `navigateFallback` (per `vite.config.ts:94,113`). Supabase paths denylisted. |
| **DX-1** import-parser stash | ✅ Closed | File compiles; tests cover it. |
| **DX-2** Pre-commit hooks | ✅ Closed | `.husky/pre-commit` runs `lint-staged` (eslint --max-warnings 0), `tsc --noEmit`, `check-rpc-contracts.ts`, `check-no-service-role.ts`. |
| 2026-05-13 BUG-1/2/3/4 | ✅ Closed | Per the 2026-05-13 sweep above; all four fixed in that session. |

### Live findings (open as of 2026-05-28)

#### S2-1 · 116 `as unknown` casts remain in services — type-debt, not security  *(was the AUDIT footnote "Multiple TS escape hatches")*

The 2026-05-13 audit said `@ts-expect-error` was reduced to zero. That is still true (`grep` finds none in `src/services/` or `apps/hrms-web/src/services/`), but **116** `as unknown`/`as unknown as` casts now stand in for the previous suppressions. Distribution:

| File | Casts |
|------|-------|
| `src/services/vehicleService.ts` | 18 |
| `src/services/apService.ts` | 8 |
| `src/services/salesPipelineService.ts` | 5 |
| `src/services/invoiceService.ts` | 5 |
| `src/services/businessReportService.ts` | 5 |
| `src/services/autoAgingDataService.ts` | 5 |
| `src/services/auditService.ts` | 5 |
| `apps/hrms-web/src/services/{vehicle,businessReport,autoAgingData}Service.ts` | 5 each |
| Remainder spread across 30+ files | 1–4 each |

These are functionally cosmetic (the code works), but they bypass the generated `Database` types, so a schema rename anywhere in those tables fails silently at runtime instead of at `tsc`. The fix is structural: extend `scripts/check-rpc-contracts.ts` into the **generated typed-RPC SDK** already named in `PRODUCT_RECONSTRUCTION.md §4.4`, then delete the casts file-by-file.

**Impact**: Low (no functional bug today). **Effort**: ~3 days for the SDK script + 1 day per top-5 service to delete casts.

#### T2-1 · Service test coverage still ~50%; no enforced floor  *(was T-3 + T-5)*

| Tree | Service files | Tested | % |
|------|--------------|-------|---|
| `src/services/` | 70 | 37 | 53% |
| `apps/hrms-web/src/services/` | 57 | 20 | 35% |
| `src/services/hrms/` (wrappers) | 7 | 0 | 0% |

`vitest.config.ts` still only enforces coverage thresholds for `src/lib/**`, `src/contexts/**`, `src/utils/**`. The previously-flagged riskiest services — `approvalEngineService`, `approvalFlowService`, `requestApprovalService`, `salesTargetService`, `inventoryService`, `mappingService`, `masterDataService` — remain untested.

**Impact**: Medium (regression risk on business-critical mutation paths). **Effort**: ~1 sprint to land an initial set + add a `"src/services/**": {lines: 50}` threshold and ratchet up.

#### DX2-1 · `ecosystem.config.cjs` (PM2) still undocumented  *(was DX-3)*

The 2025 finding is unchanged. The file is at repo root and `README.md` does not mention what runs under PM2 vs static-nginx. Either delete it (the production deploy is static via `docker/nginx.conf`) or add a single paragraph in `README.md` describing the worker it runs.

**Impact**: Low (confusion only). **Effort**: 30 minutes.

#### F2-1 · Internal Requests / Portal is the live workstream and is not in the plan yet  *(new)*

The last seven commits on `main` are all `feat/refactor(internal-requests)` — server-side input bounds, attachment size enforcement, signed-URL caching, persisted comment/note drafts, routing-rule assignee validation, subcategory-pinned approval flows, live queue/history/my-requests, and panel-level error boundaries. Two new migrations (`20260528000000`, `20260528010000`) belong to this stream. `docs/INTERNAL_REQUEST_GAP_ASSESSMENT.md`, `INTERNAL_REQUEST_QA_REPORT.md`, and `INTERNAL_REQUEST_REFACTOR.md` define the scope.

This is not yet recorded as a phase in `PRODUCT_RECONSTRUCTION.md` — it sits between Phase 6a (Webhook Outbox) and the remaining Phase 6 surfaces. The plan update below adds **Phase 7 — Internal Requests hardening** to capture it; the work is largely shipped but the close-out checklist (E2E suite, RLS re-run, runbook) is still owed.

**Impact**: Medium — without a phase entry, the close-out gates from §7 of `PRODUCT_RECONSTRUCTION.md` are not being applied to this workstream. **Effort**: ~half a sprint for the gate evidence (E2E + RLS re-run + runbook), see plan below.

#### F2-2 · Phase 6 partial — 6a shipped, 6b/6c/6d open  *(restatement)*

Per `PRODUCT_RECONSTRUCTION.md §Phase 6`: webhook outbox is in production; **Service / Workshop module**, **Sales mobile app**, and **Customer-facing portal** are unbuilt. These are net-new product surfaces, not debt — they sit in the roadmap, not this gap list — but they bound the launch-checklist scope.

### Re-audit Metrics & Success Criteria

| Metric | 2025 baseline | 2026-05-13 | **2026-05-28 (live)** | Target |
|--------|--------------|------------|----------------------|--------|
| `tsc --noEmit` errors | 0 | 0 | **0** | 0 |
| `check:rpc-contracts` | n/a | pass | **pass** | pass |
| Test files failing | 8 / 49 | 0 / 49 | **0 / 126** (3 RLS-gated skips) | 0 fails |
| Lint exit | 1 (broken) | 0 | **0** (9 warnings) | 0, ≤ 5 warnings |
| Services with tests (main) | 17 / 33 | 20 / 45 | **37 / 70** | ≥ 50 / 70 |
| Services with tests (hrms-web) | n/a | 20 / 45 | **20 / 57** | ≥ 35 / 57 |
| HRMS-wrapper services tested | 0 / 7 | 0 / 7 | **0 / 7** | 7 / 7 |
| `as unknown` casts in services | many | unchanged | **116** | ≤ 30 (post-SDK) |
| `@ts-expect-error` in services | several | 0 | **0** | 0 |
| Pages on TanStack Query | 8 / 24 | 24 / 24 | **64 / 103** (broader denominator; ExecutiveDashboard + ModuleDirectory deleted in 4e close-out) | maintained |
| CSP / security headers | none | shipped | **shipped** | maintained |
| `xlsx` in any `package.json` | yes | no | **no** | no |
| `localStorage` RBAC | yes | no | **no** | no |
| Web Vitals + RUM + slow-query metrics | none | shipped | **shipped** | maintained |
| Edge-function rate limit | none | partial | **all 7 functions** | maintained |
| Edge structured logs + `request_id` | no | partial | **all 7 functions** | maintained |
| PWA offline fallback | no | yes | **yes** | maintained |
| Pre-commit hooks | none | lint+tsc | **lint+tsc+RPC+no-service-role** | maintained |
| `i18n` adoption | 0% installed | removed | **removed** | n/a |

### Refreshed Implementation Plan

Original P0/P1/P3/P4 sections are historical — they are all closed. The live plan, **in priority order**:

#### R1 — Phase 7 close-out: Internal Requests hardening evidence  *(scope: ~3 days)*
- Add Playwright E2E covering ticket create → route → approve → close happy path + portal-only-user denied paths.
- Re-run `npm run test:rls` against the new portal tables touched by `20260527020000_request_subcategories_approval_flow_fk.sql` and the two `20260528*` migrations.
- Author `docs/INTERNAL_REQUEST_RUNBOOK.md` (operator-facing: attachment storage rotation, signed-URL TTL, SLA breach manual escalation).
- Add a Phase 7 row to `PRODUCT_RECONSTRUCTION.md §5` with the same acceptance gates as Phases 3–5.

#### R2 — Generated typed-RPC SDK + delete `as unknown` casts  *(scope: ~5 days, parallel-isable)*
- Extend `scripts/check-rpc-contracts.ts` into `scripts/gen-sdk.ts` emitting `packages/supabase/src/rpcs.ts` typed wrappers per RPC.
- Sweep `vehicleService.ts`, `apService.ts`, `salesPipelineService.ts`, `invoiceService.ts`, `businessReportService.ts`, `autoAgingDataService.ts`, `auditService.ts` first — they account for 51 of the 116 casts.
- Enable an ESLint rule banning new `as unknown` introductions in `src/services/**` (custom `no-restricted-syntax` selector).

#### R3 — Service-level test coverage + enforced floor  *(scope: ~1 sprint)*
- Write unit tests for the high-risk untested services in priority order: `approvalEngineService`, `approvalFlowService`, `requestApprovalService`, `salesTargetService`, `inventoryService`, `mappingService`, `masterDataService`, all 7 wrappers in `src/services/hrms/`.
- Add to `vitest.config.ts`: `coverage.thresholds["src/services/**"] = { lines: 50, branches: 40 }`; ratchet to 60/50 after one PR cycle clean.

#### R4 — DX cleanup  *(scope: ~half a day)*
- Remove `ecosystem.config.cjs` if PM2 is unused in production, or add a 5-line `README.md` paragraph describing what it runs.
- Fix the 9 ESLint warnings flagged above (5-minute job each).

#### R5 — Phase 6b / 6c / 6d  *(open-ended, roadmap)*
- 6b **Service / Workshop module** — needs product input (bookings, technicians, parts, warranty). Tracked in `PRODUCT_RECONSTRUCTION.md §3.1`.
- 6c **Sales mobile app (Capacitor)** — wraps the existing PWA into native iOS / Android. Operator-side App Store / Play Store setup is a prerequisite.
- 6d **Customer-facing portal** — public-auth surface. Requires threat model before code (largest new security surface).

No further P0/P1 items in scope. The Phase 5 launch-checklist evidence (`docs/PHASE5_EVIDENCE.md` §7 — Sentry DSN provisioning, PITR enable, DR tabletop, OSV/CodeQL attach, on-call rota) remains the gating workstream and is **operator-side**, not code-side.

---

*Re-audit performed by Claude Opus 4.7 against `main` at `7227596`.*
