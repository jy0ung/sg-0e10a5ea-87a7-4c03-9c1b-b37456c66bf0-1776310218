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
| P2 — Architecture | 4 | 2,113-line service monolith, dual Excel libs, manual fetch pattern in 16 pages, orphaned i18n |
| P3 — Observability | 3 | Performance metrics never shipped, no Web Vitals, no RUM |
| P4 — Feature Debt | 3 | Import-review queue incomplete, i18n 0% coverage, approval inbox partially wired |

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

#### F-2 · ApprovalInbox exists but uses manual fetch — no real-time updates

`ApprovalInbox.tsx` loads approval requests with `useCallback` and `useEffect`. Approval workflows are inherently push-driven (a manager should see new requests in real time), but there is no Supabase channel subscription in the inbox page. `Notifications.tsx` has a working channel pattern that could be replicated.

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

#### P3-1 · Ship performanceService metrics to Sentry

- **File**: `src/services/performanceService.ts`
- **Action**: On each slow query (>500 ms already tracked), emit a Sentry custom metric:
  ```ts
  import * as Sentry from '@sentry/react';
  // inside recordQuery():
  if (durationMs > SLOW_THRESHOLD_MS) {
    Sentry.metrics.distribution('query.duration', durationMs, {
      tags: { queryKey: key },
      unit: 'millisecond',
    });
  }
  ```
- **Scope**: 2 hours

#### P3-2 · Add Web Vitals measurement

- **File**: `src/main.tsx`
- **Action**:
  ```ts
  import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
  const reportVital = ({ name, value, id }: Metric) => {
    Sentry.metrics.distribution(`web_vitals.${name.toLowerCase()}`, value, { tags: { id } });
  };
  onCLS(reportVital); onINP(reportVital); onLCP(reportVital);
  onFCP(reportVital); onTTFB(reportVital);
  ```
- **Scope**: 1 hour

#### P3-3 · Enable Sentry BrowserTracing for RUM

- **File**: `src/main.tsx` (Sentry `init()` call)
- **Action**: Add `Sentry.browserTracingIntegration()` and set `tracesSampleRate: 0.1` (10% in prod)
- **Scope**: 30 minutes

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
