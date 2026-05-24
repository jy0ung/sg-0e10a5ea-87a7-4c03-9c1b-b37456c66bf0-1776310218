# Product Reconstruction — Fook Loi UBS (FLC BI App)

**Author:** CTO / Principal product engineer review
**Branch:** `claude/product-reconstruction-cto-FUocp`
**Repository state:** main app + dedicated HRMS web + HRMS mobile + Supabase backend (109 migrations) already in production at `ubs.protonfookloi.com` / `hrms.protonfookloi.com`.

This document does not refactor. It reverse-engineers the product, restates intent, fixes the model, and lays out a phased reconstruction that preserves the valid business logic already proven in production.

---

## 1. Reverse engineering — what this app actually is

### 1.1 Surface read
Marketing surface calls it "FLC BI." That's a misnomer carried over from an early KPI/BI prototype. What is actually shipped is an **internal operating system (UBS — Unified Business Suite) for an automotive dealer group**. The schema, RPC catalog, route map, and edge functions all describe a vehicle dealer ERP, not a BI tool.

### 1.2 Product category
**Multi-tenant, multi-branch dealer operations platform** for an automotive distributor (Proton dealer — Fook Loi Corp / `fookloi.net` legacy). It sits in the same category as DealerSocket, Reynolds & Reynolds, CDK Drive, AutoMate, except:

- it is internal/single-customer (Fook Loi group), not SaaS;
- it integrates *downstream* from Proton's DMS (`dcs-api.proton.com`) rather than being the DMS;
- it adds local-only workflows the DMS does not own (LOU aging, internal requests, HRMS, KPI tracker).

### 1.3 Who uses it (personas observed in `profiles.role` / route guards / RLS / HRMS roles)
- **Super admin** (group IT / Claude-the-deployer) — cross-tenant.
- **Company admin** — per-legal-entity controller (Sabah Sdn. Bhd. etc).
- **Director / General manager** — executive dashboards, margin, audit.
- **Manager** — branch-level sales/inventory/aging operations.
- **Sales / sales advisor** — deal pipeline, customer entry, OR/invoice verify.
- **Accounts** — AR/AP ledger, GL, periods, journal entries.
- **Creator/updater** (default for new invites) — data entry.
- **Portal users** (`portal_admin|portal_manager|portal_staff` + `portal_access_only`) — internal-request portal only.
- **HRMS-roled employees** — orthogonal `hrms_roles` system (executive/hr/department/line_management/staff/payroll/attendance), governs HRMS workspace access independently of app role.

### 1.4 Functional surface that already exists
Eight functional modules + portal:

| Module | Routes | Real workflow |
|---|---|---|
| **Executive Dashboard** | `/` | KPI tracker, custom widgets, branch summary RPCs. |
| **Auto Aging** | `/auto-aging/*` | Vehicle lifecycle (free stock → register → disburse → deliver), SLA policies, branch+payment-method mappings, commission rules, import center, review queue, source ledger across DMS/UBS/legacy. **This is the original product.** |
| **Sales** | `/sales/*` | Deal pipeline, sales orders, customers (22k seeded), invoices, AR aging, official receipts, dealer invoices, sales advisors (195 seeded), margin analysis, salesman performance. |
| **Inventory** | `/inventory/*` | Stock balance, chassis movement, vehicle transfer, advanced search. |
| **Purchasing** | `/purchasing/*` | Purchase invoices with AP lifecycle (received→verified→approved→scheduled→paid), immutable `supplier_payment_events` ledger. |
| **Accounts (GL)** | `/accounts/*` | Chart of accounts, accounting periods, trial balance, journal entries. **Stage 7 UI is missing.** |
| **Reports** | `/reports` | Cross-module CSV (capped 10k rows). |
| **HRMS** | dedicated `hrms.protonfookloi.com` | Dashboard, employees, leave (with half-day + attachments + quota rules), attendance, payroll, appraisals, announcements, approval inbox, HRMS admin. Mobile companion via Capacitor. |
| **Portal (Internal Requests)** | `/portal/*` | Tickets/requests with categories, templates, condition-routed approval flows, SLA, comments, attachments, history, announcements, documents. |

### 1.5 Backend posture (real strengths to preserve)
- Supabase Postgres with **RLS on all 84 public tables**, `get_my_access_scope()`/`can_access_row()` helpers.
- Invite-only auth (`enable_signup=false`), PKCE, server-verified roles in edge functions, archive-safe deletion (`deleted+<id>@archived.local` tombstone).
- **Immutable financial ledgers** (`payment_events`, `supplier_payment_events`) with `REVOKE` on direct DML and `AFTER INSERT/DELETE` triggers recomputing `paid_amount`/`payment_status`. AP lifecycle state machine enforced server-side via `transition_pi_lifecycle()`.
- Source-of-truth contract: **DMS** is authority for Proton HQ facts, **UBS** for local workflow, **`fookloi.net`** is historical backfill, **Google Sheets is explicitly rejected as fallback**. Raw DMS payloads land in `dms_raw_*` staging, then per-object normalizers (`normalize_dms_sales_order`, `normalize_dms_vehicle_stock`, `normalize_dms_customer`) populate canonical UBS tables using a `normalizer_column_authority` matrix.
- Concurrency: `pg_advisory_xact_lock(hashtext(id))` in batch RPCs; CTE-based N+1 elimination.
- Observability: Sentry init, Web Vitals → Sentry RUM via `logMetric`, route + chunk-load error recovery, per-route `RouteErrorBoundary`.
- Deploy: GHCR image + Cloudflare Access SSH; static nginx; PWA with Supabase paths denylisted from navigation fallback.

### 1.6 What the codebase already admits is wrong
Documented in `AUDIT.md`, `UI-UX-IMPLEMENTATION-PLAN.md`, `docs/DEVELOPMENT_PLAN.md`, and `.softgen/tasks/*`:
- **CSP / security headers missing** at SPA level (S-1).
- **RBAC stored in localStorage** for section visibility (S-2) — UI bypass possible.
- **Dual Excel libs**: `xlsx` (CVE-laden) lingering alongside `exceljs`.
- **`hrmsService.ts` was 2,113 lines** — split partially started.
- **16 pages still use manual fetch** instead of TanStack Query (no cache, no realtime).
- **i18n installed but 0% adopted** — bundle cost without benefit.
- **`performanceService` metrics never shipped** — only in-memory.
- **Import Review Queue half-built**; **ApprovalInbox not realtime**.
- **No PWA offline fallback page** beyond the browser default.
- **GL Stage 7 UI not built**.
- **DMS sync worker is staging-only** — no live fetch.
- **Multiple TS escape hatches** (`as unknown`, `@ts-expect-error`) in `inventoryService`, `salesTargetService`, `ticketService` fallback, `HrmsAdmin.tsx` parse boundary.
- **Two parallel app trees**: `src/` (main) and `apps/hrms-web/src/` duplicate a lot of layout/access logic. `@flc/hrms-hooks` was built but neither app adopted it.
- **`update-user-status` edge function exists but is unrouted in the self-hosted Edge Runtime** — clients still call `delete-user` with `action='update_status'`.

### 1.7 What this app appears intended to become
Reading the gap docs and Phase 5 plan as intent:

> Replace `fookloi.net` entirely. Become the **single internal operating surface** for the Fook Loi dealer group across deal origination, vehicle lifecycle, AR/AP/GL, HRMS, and internal services — synced *downstream* of Proton DMS but authoritative for local KPIs, aging, and finance.

The next intended step (Stage 7) is **financial reporting UI on top of the GL foundation already migrated**. After that, the implicit roadmap is: live DMS sync worker, KPI definitions versioning, executive command center, reconciliation review queue UI, and reporting views replacing capped client-side samples.

---

## 2. Target product definition (first-principles restatement)

### 2.1 Product
**Fook Loi UBS (Unified Business Suite)** — the internal operating system for an automotive dealer group: lead → sale → registration → delivery → collection → service, with HR, internal request management, and finance as first-class peers, anchored to Proton DMS as the upstream authority for HQ facts.

### 2.2 Job stories
1. *When a vehicle arrives in stock,* a branch operator gets it through the registration/disbursement/delivery milestones with SLA visibility and exception alerts.
2. *When a deal closes,* a sales advisor produces a Sales Order linked to a real vehicle, generates an invoice, collects payment via OR, posts to AR ledger, and the GM sees margin & commission impact within minutes.
3. *When a supplier invoice arrives,* AP records it, verifies, approves, schedules, and pays, with the ledger event posted atomically to GL.
4. *When an employee needs leave,* they request from web or mobile, balances and quota rules gate it, the right HRMS-roled approver receives a real-time inbox notification, and payroll consumes the result.
5. *When an internal team needs IT/admin/maintenance help,* they file a ticket against a category that auto-routes to the correct approval flow with SLA tracking.
6. *When executives review the business,* they see KPIs computed on the server with explicit, versioned definitions — never on capped client samples.
7. *When data sources disagree,* operations decides through a reconciliation review queue with side-by-side DMS / UBS / legacy evidence.

### 2.3 Non-goals (explicit)
- Not a public SaaS, not a multi-customer marketplace.
- Not a replacement for Proton DMS upstream.
- Not a CRM lead-marketing tool (DMS owns lead/prospect feeds).
- Not a `.xlsx` reporting product (decision already made — CSV via server-side RPCs).
- Not a Google Sheets ingestion pipeline (rejected).

### 2.4 Quality bars
| Dimension | Bar |
|---|---|
| Security | RLS on every table; CSP + security headers shipped; no client RBAC; service-role never on client; edge-function rate-limit + audit. |
| Correctness | Financial ledgers immutable; AP lifecycle a state machine; no client-side total recompute; reconciliation events for every cross-source change. |
| Performance | All list pages server-paginated; dashboards via summary RPCs; client samples never presented as full truth; React Query as the cache boundary. |
| Reliability | Per-route error boundary; chunk-reload guard; PWA offline fallback; Sentry RUM; PITR + restore drill evidence. |
| Accessibility | WCAG 2.0 AA axe-clean on public + authenticated routes across 3 viewports (already configured in `e2e/`). |
| Observability | Web Vitals + custom metrics to Sentry; structured request_id correlation through edge functions. |
| DX | One layout shell shared by main + HRMS apps; one service barrel per domain; pre-commit hooks enforced; ESLint + typecheck + RPC contract check green. |

---

## 3. Missing or necessary modules and features

### 3.1 New modules to add
| Module | Why | Notes |
|---|---|---|
| **DMS Sync Operations** (`/admin/integrations/dms`) | Live sync worker exists only as staging skeleton. Need run history, cursor state, retry, manual replay, and credential rotation UI. | Backend-only env (`DMS_*`); UI shows `sync_runs` + `dms_raw_*` counts. |
| **Reconciliation Review Queue** (`/admin/reconciliation`) | `source_reconciliation_matches` already exists; no UI yet. Operations must resolve uncertain matches with DMS/UBS/legacy side-by-side. | Reuse the `auto_aging_source_ledger` contract. |
| **Financial Reporting (Stage 7)** (`/accounts/reports/*`) | GL migrations applied, no UI. P&L, balance sheet, AR/AP aging by branch, cash position, period-close drilldown. | Server-side report RPCs; CSV export same 10k cap. |
| **KPI Definition Studio** (`/admin/kpi-definitions`) | Today KPIs are hard-coded; intent is versioned, role-curated KPI definitions. | Persist to `kpi_definitions` table; preset library; "curated default per role." |
| **Service / Workshop module** (`/service/*`) | Dealer group has after-sales service; today only Internal Requests covers it loosely. | Service orders, technician assignments, parts, warranty claims. |
| **Lead intake & qualification** (`/sales/leads`) | DMS already streams `dms_raw_leads`/`dms_raw_prospects`; no UBS surface. | Local follow-up notes + conversion path into Sales Orders. |
| **Notifications Center v2** | Today only inbox + push; no real-time channel binding for ApprovalInbox / Reconciliation. | Single Supabase realtime fan-out hook used everywhere. |
| **Search v2 — global Cmd+K** | Partial (vehicles/customers/orders/users) — extend to invoices, tickets, employees, journal entries. | Already a foundation in `mainShellConfig.ts`. |
| **Audit Explorer** | `audit_logs` exists; admin/audit page is read-only list — needs faceted filters, diff view, export. | Same pattern as Activity Dashboard. |
| **Mobile parity for Sales** | Mobile app is HRMS-only today. | Sales advisor on the lot: lookup vehicle, capture OR, capture customer signature. |

### 3.2 Features missing inside existing modules
| Module | Missing |
|---|---|
| Auto Aging | Real-time vehicle stage change feed; exception alert rules; SLA breach notifications; mappings versioning; commission accrual ledger (today only `commission_records`). |
| Sales | Quote → SO conversion; deposit handling; trade-in capture; salesman target progress on dashboard; deal margin breakdown by line. |
| Inventory | Cycle-count workflow; physical-vs-system reconciliation; warehouse zone/bin location; reservation against an SO. |
| Purchasing | **Purchase orders** (only PIs exist today — flagged in `UI-UX-IMPLEMENTATION-PLAN.md`); 3-way match (PO/GRN/Invoice); supplier statement reconciliation. |
| GL | Bank reconciliation; intercompany journals; FX revaluation (group spans Sabah + likely other entities); year-end close. |
| HRMS | Shift planning; OT calculation; performance goal cascade; e-signature on payslips; document storage per employee; expense claims. |
| Portal | Customer-facing portal (today only internal). |
| Admin | Feature flags / kill-switches; rate-limit policy editor; webhook outbox for downstream consumers. |
| Observability | Slow-query Sentry shipping (`performanceService` is dead-end today); RUM dashboards; alert routing. |

### 3.3 Cross-cutting platform features
- **Tenant lifecycle**: company onboarding wizard, branding (already migrated), module activation per company.
- **API surface**: typed RPC contract layer (`scripts/check-rpc-contracts.ts` exists — extend with auto-generated SDK).
- **Backup & DR proof**: PITR drill, rollback drill, OSV/CodeQL evidence (open in launch checklist).
- **i18n decision**: adopt OR remove. Today it's a 35 KB stub.
- **PWA**: branded offline fallback, install banner, background sync for queued OR/attendance writes.

---

## 4. Architecture redesign

### 4.1 Repository topology — target
```
/                                  ← root workspace, no app code
  apps/
    main/         ← was src/. UBS web shell + non-HRMS pages
    hrms-web/     ← unchanged (dedicated workspace)
    hrms-mobile/  ← unchanged (Capacitor)
    sales-mobile/ ← new
  packages/
    shell/        ← AppShell + nav primitives shared by main & hrms-web (today duplicated)
    ui/           ← shadcn primitives, StandardTable, ExcelTable, FilterBar, EmptyState
    auth/         ← AuthProvider, RequireRole, RequireActiveModule, useHrmsAccess
    types/        ← unchanged barrel
    supabase/     ← typed client + generated types
    hrms-schemas/ ← unchanged
    hrms-services/← unchanged
    finance/      ← AR/AP/GL service + types (new — extract from src/services)
    auto-aging/   ← Auto Aging service + types (new)
    sales-domain/ ← Sales service + types (new)
    dms-sync/     ← DMS staging + normalizer service contracts
    i18n/         ← keep only if adopted (decision below)
  supabase/
    migrations/   ← unchanged ordering, additive only
    functions/    ← unchanged + new: dms-sync-cron, reconcile-worker
  scripts/        ← unchanged + new: gen-sdk.ts, kpi-baseline.ts
```
**Migration tactic:** create `packages/shell` and move app-shell into it, then re-export from each app. No rename of `src/` until phase 4 (to avoid a big-bang merge conflict with running production).

### 4.2 Layering rules (hardened)
1. **Pages/components must not call `supabase.from()` or `supabase.rpc()`.** Already an ESLint rule — extend to forbid `@/integrations/supabase` outside `services/` and `packages/*`.
2. **One service per domain. Services own SQL shape.** Split `hrmsService.ts` final remnants. Use the `*CrudService.ts` / `*PipelineService.ts` / `*DashboardService.ts` triplet from the Sales reference.
3. **Contexts compose services via React Query only.** Eliminate the manual-fetch pattern across the 16 known pages.
4. **Routes gate on roles; RLS is the security boundary.** No new client-side RBAC logic; section permissions move server-side (S-2 fix).
5. **Errors bubble to the nearest route boundary.** Every route already has one — keep this rule.
6. **Realtime is a single hook.** `useSupabaseChannel(table, filter, onChange)` — used by ApprovalInbox, Notifications, ReconciliationQueue, and SalesContext.
7. **No client-side recompute of authoritative totals.** Ledger triggers compute `paid_amount`; client only renders.

### 4.3 Data model additions (incremental, additive only)
```
kpi_definitions(id, company_id, code, label, formula_jsonb, version, is_active)
kpi_role_defaults(role, kpi_codes text[], company_id)
service_orders(...)
service_order_lines(...)
purchase_orders(...)
purchase_order_lines(...)
goods_receipt_notes(...)
employee_documents(...)
expense_claims(...)
reconciliation_decisions(...)            ← UI write target for the queue
audit_log_diffs(...)                     ← redacted before/after JSONB
notification_preferences(...)
feature_flags(...)
```
All with `company_id` + RLS + audit triggers. All editable only through `SECURITY DEFINER` RPCs for cross-tenant safety.

### 4.4 API contracts
- **Server-only edge functions** (`verify_jwt=true`) for: invite/delete user, push notifications, leave rollover, **dms-sync-cron** (new), **reconcile-worker** (new). All gain rate-limit headers + `request_id`.
- **Generated SDK**: extend `scripts/check-rpc-contracts.ts` into a `gen-sdk.ts` that emits typed wrappers per RPC into `packages/supabase/src/rpcs.ts`. Eliminates the residual `as unknown` casts.
- **Search RPC**: one `global_search(company_id, q, limit)` returning union rows tagged by entity — replaces the ad-hoc 5 queries in `mainShellConfig.ts`.

### 4.5 Security redesign
- Ship CSP + `X-Frame-Options` + `X-Content-Type-Options` + `Referrer-Policy` via `docker/nginx.conf` (already split per host).
- `role_section_permissions` table + RLS; `usePermissions` reads from a single React Query key; localStorage usage deleted.
- `xlsx` removed; `exceljs` only.
- Per-edge-function rate limits in a `rate_limits` table (`invite-user`'s 10/hr is the precedent — extend to all).
- FCM/APNs key rotation runbook + startup assertion.
- Service-role usage audit: confirm no `import.meta.env.*SERVICE_ROLE*` outside `supabase/functions/`.

### 4.6 Observability redesign
- `performanceService` records every query > 500 ms → emits `Sentry.metrics.distribution('query.duration', …)`.
- Web Vitals already shipped → add `BrowserTracing` integration with `tracesSampleRate=0.1` on prod.
- Edge functions log `{request_id, caller_id, action, latency_ms, outcome}` structured lines.
- Slow-query dashboard becomes a Sentry alert, not a `getReport()` that nobody calls.

### 4.7 UX redesign
- **Single shell** (`@flc/shell`) used by main and HRMS apps. Today's two parallel `AppShell.tsx` trees collapse into one.
- **Role-aware Home**: replace `/` with a per-role landing chosen from a curated default plus the user's saved layout. Sales advisor gets pipeline; manager gets aging+collection; accounts gets AR/AP aging; executives get KPI command center.
- **Command palette** (`Cmd+K`) becomes the primary global navigator + entity finder.
- **Inbox-first workflows** (Approvals, Reconciliation, Tickets, Notifications) all converge into a single `/inbox` with tabs — same shell, same realtime hook, same StandardTable.
- **Branded shell + per-company theming** (`company_branding` already migrated).
- **Mobile-first list views**: every page with a table gets a card view < md breakpoint.
- **CSV export everywhere** with the same 10k cap and a clear "showing N of M" indicator.
- **No emoji, no decorative chrome** — utilitarian, dense, keyboard-driven.

---

## 5. Phased reconstruction plan

Each phase is **independently shippable, behind feature flags, and additive**. No phase begins until the previous one is merged, validated against the production smoke suite, and the launch checklist row is checked.

### Phase 0 — Safety net (1 sprint) — IN PROGRESS

| Task | Reality |
|---|---|
| CSP + security headers | **Already shipped** in `docker/nginx.conf` (both hosts) and `index.html`. No work needed. |
| `xlsx` removal | **Already done.** `xlsx` is no longer in any `package.json`; `import-parser.ts` already uses `exceljs`. |
| Pre-commit hooks | **Existed** (Husky + lint-staged + `tsc --noEmit`). Extended in this PR with `scripts/check-rpc-contracts.ts`. |
| Remove i18n | **Done in this PR.** 0% adoption; uninstalled `i18next` / `react-i18next` / `i18next-browser-languagedetector` from both apps, deleted `src/i18n/` + `apps/hrms-web/src/i18n/`, replaced 4 `t()` callsites in `PageSpinner` + `PageState` with the seeded English strings. |
| `feature_flags` table + `useFeatureFlag` hook | **Done in this PR.** Migration `20260524000000_feature_flags.sql` with company + global resolution, percentage rollouts via stable-hash bucketing, RLS gated to super/company admin writes. `featureFlagService.ts` + `useFeatureFlag.ts` + unit tests. Ten seed flags pre-populate Phase 1–4 surface codes (default disabled). |
| Acceptance | 0 typecheck errors, 0 lint warnings, RPC contracts pass, all existing tests still green, **flag table dry-runs cleanly against local Supabase.** |

### Phase 1 — Security & RBAC hardening (1 sprint)
- `role_section_permissions` table + RLS + `roleSectionService` server-backed; delete `localStorage` RBAC.
- `rate_limits` table + edge-function middleware; backfill `invite-user`'s 10/hr to all functions.
- Rotate FCM/APNs documentation; startup assertion in `send-push-notification`.
- Audit `service-role` usage; add CI rule that fails on `SERVICE_ROLE` in `src/` or `apps/`.
- Acceptance: penetration smoke (curl edge fns without JWT, with stale JWT, with wrong-company JWT) returns expected 401/403/429.

### Phase 2 — Architecture cleanup (2 sprints)
- Extract `packages/shell` from `src/components/layout/app-shell` and `apps/hrms-web/src/layout`; rewire both apps to consume it.
- Extract `packages/auth` (`AuthContext`, `RequireRole`, `RequireActiveModule`, `useHrmsAccess`).
- Migrate the 16 manual-fetch pages to TanStack Query (priority order in `AUDIT.md` A-3).
- Single `useSupabaseChannel` hook; wire ApprovalInbox + Notifications to it. ApprovalInbox becomes realtime.
- Finalize `hrmsService.ts` split into `employeeService` / `leaveService` / `attendanceService` / `payrollService` / `appraisalService`.
- Adopt `@flc/hrms-hooks` in both apps (built but never used).
- Replace ad-hoc Cmd+K queries with a `global_search` RPC.
- Acceptance: bundle budget unchanged or smaller; zero new escape hatches; all tests green; Web Vitals LCP < 2.5s on the executive dashboard.

### Phase 3 — Module completion (3 sprints, parallelizable)
Each sub-phase is a separate PR series:

- **3a — Import Review Queue completion**: wire `importReviewService.reviewRow` end-to-end, write tests, add to e2e smoke. Feature-flag `importReview.v2`.
- **3b — Financial Reporting UI (Stage 7)**: P&L, balance sheet, AR/AP aging by branch, cash position, period-close drilldown. Server-side RPCs only.
- **3c — DMS Sync Ops UI**: `sync_runs` list, raw payload counts, manual replay (admin-only), credential rotation guidance.
- **3d — Reconciliation Review Queue UI**: side-by-side DMS/UBS/legacy evidence; writes `reconciliation_decisions`; updates canonical via SECURITY DEFINER RPCs only.
- **3e — Purchase Orders + 3-way match**: `purchase_orders`, `goods_receipt_notes`, link to existing `purchase_invoices`; AP lifecycle now spans PO → GRN → PI → payment.
- **3f — Lead intake**: surface `dms_raw_leads`/`dms_raw_prospects`; local follow-up notes; conversion → SO.
- Acceptance per sub-phase: feature flag default-off in prod, on for one pilot branch, full e2e + RLS matrix re-run; rollback drill recorded.

### Phase 4 — UX unification (2 sprints)
- One shared `@flc/shell` (already extracted in Phase 2).
- **Role-aware Home** + KPI Definition Studio.
- **/inbox** consolidating Approvals + Reconciliation + Tickets + Notifications.
- Mobile-first list views across all StandardTables.
- Branded shell with `company_branding`.
- PWA offline fallback (`public/offline.html`).
- Acceptance: WCAG 2.0 AA on all primary routes; LCP/INP/CLS budgets enforced; Lighthouse > 90 across PWA categories.

### Phase 5 — Observability & reliability close-out (1 sprint)
- Ship `performanceService` metrics to Sentry; enable `BrowserTracing`.
- Edge function structured logs with `request_id` + alert rules.
- PITR + restore drill evidence; rollback drill evidence; OSV/CodeQL evidence — close the launch checklist.
- DR runbook tabletop.
- Acceptance: launch checklist 100% green.

### Phase 6 — New product surfaces (open-ended)
- Service/workshop module.
- Sales mobile app (Capacitor, reuses `@flc/shell`).
- Customer-facing portal.
- Webhook outbox for downstream consumers.

---

## 6. What to preserve (do not touch)

These are working business invariants. Reconstruction must inherit them as-is:

1. **RLS posture and helper functions** (`get_my_access_scope`, `can_access_row`).
2. **Immutable AR/AP ledgers + state machine**. New finance work extends the pattern, never bypasses it.
3. **DMS / UBS / fookloi.net source-of-truth contract** + `normalizer_column_authority` matrix.
4. **Invite-only auth + archive-safe deletion tombstones**.
5. **Per-route error boundary + chunk-reload guard + PWA navigation denylist**.
6. **Bundle budget enforcement + route-level code splitting**.
7. **Standard table / form / toast / Zod helpers** — the design system is already coherent.
8. **HRMS organisational role system** distinct from app role.
9. **Edge function `verify_jwt=true` + same-company checks**.
10. **Migrations are additive and ordered.** No drops. No renames in-place. Compatibility re-export barrels during transitions (Sales service pattern is the template).

---

## 7. Acceptance gates between every phase

A phase is not done until ALL of:
- `npm run typecheck` clean
- `npm run lint` zero warnings
- `npm run test` all green, no skips added
- `npm run test:rls` re-run against local stack
- `npm run build` succeeds with budget
- `npm run verify:production` + `npm run smoke:production` passing
- New rows in `docs/DEVELOPMENT_PLAN.md` Phase Checklist
- A rollback PR pre-approved on the branch protection rules

---

## 8. Decision register (resolved)

| # | Decision | Resolution | Affects |
|---|---|---|---|
| 1 | i18n | **Remove entirely.** 0% adoption today; uninstall packages, delete `src/i18n/`, drop ~35 KB. | P0 |
| 2 | Feature flags | **Own table + hook.** `feature_flags(company_id, code, enabled, rollout_pct, updated_by)` + RLS + `useFeatureFlag`. No vendor. | P0 |
| 3 | Sales mobile | **In scope, Phase 6.** Capacitor app reusing `@flc/shell`. | P6 |
| 4 | Customer portal | **In scope, Phase 6.** Separate origin, strict RLS, anonymous role. | P6 |
| 5 | FX / currency | **Single MYR.** GL schema stays single-currency, no FX revaluation. | P3b |
| 6 | Service / workshop | **In scope, Phase 6.** `service_orders`, technicians, parts, warranty. | P6 |
| 7 | DMS live sync | **Constrained.** Operator confirmed: prod credentials exist for **all 7 branches**, but each is a **normal admin user account (not a service account)** and the DMS login is **captcha-gated**. This rules out a vanilla headless `dms-sync-cron` edge function. Phase 3c is re-scoped to a **human-in-the-loop sync** (see §9). | P3c |
| 8 | GL authority | **After Stage 7 UI ships + parallel-run quarter.** Finance runs UBS alongside current books for one quarter, then cutover. | P3b |

---

## 9. DMS sync — re-scoped for captcha + per-user admin creds

**Constraint recap.** Seven branch-scoped admin accounts. No service account. Login interactively gated by captcha. Sessions are cookie/JWT-bound and expire.

**What this rules out**
- Vanilla `dms-sync-cron` Supabase edge function calling `dcs-api.proton.com` on a schedule. The captcha breaks any unattended HTTP client.
- Storing the seven passwords in any client-reachable surface (env var visible to browser, public `feature_flags`, etc.).

**Viable patterns, ranked**

1. **Ask Proton for a service / OAuth client account.** (Best, slowest.) Submit the request, document the use case (read-only sync into UBS staging only). All of §3.1's DMS Sync Ops module collapses into a normal scheduled edge function the moment this lands. Track as a separate operations workstream — do not block Phase 3c on it.

2. **Operator-assisted browser sync.** A controlled internal worker (Playwright in a dedicated container, NOT in Supabase Edge Runtime — Deno cannot drive Chromium) navigates DMS, prompts the on-call operator via UBS to solve the captcha, completes login, exports the seven Proton endpoints, and POSTs raw JSON into `dms_raw_*` via a privileged edge function. Sessions are cached for their natural lifetime; the operator is only re-prompted on expiry.
   - Worker runs on the existing nginx/Supabase host (PM2 process) — no new infrastructure.
   - Credentials live in `/etc/flc-bi/dms.env`, root-readable only, never in browser env.
   - The UBS UI hosts a "Sync now" + "Captcha pending" inbox in `/admin/integrations/dms`.
   - All HTTP traffic still passes the existing `dms-sync-worker` edge function as the only write path into `dms_raw_*`, so RLS and audit stay intact.

3. **Manual export + upload.** Operator runs the existing DMS exports per branch (CSV/XLSX), uploads to UBS. Reuses the existing Import Center pattern (`commit_import_batch`). Lowest engineering cost, highest operational cost, but it's already mostly built and is the realistic fallback if (2) slips.

**Decision (default, revisable):** Build (3) as the default Phase 3c surface — extend Import Center with a "DMS branch export" template per endpoint, route uploads into `dms_raw_*` staging via the existing normalizer pipeline. Build the Sync Ops + Reconciliation Review UIs against the same staged data. Begin a parallel ops request to Proton for a service account; when it lands, swap path (3) for path (1) without UI rework. Path (2) is only built if Proton denies the service account AND manual upload becomes operationally untenable.

**Implications for the blueprint**
- §3.1's "DMS Sync Operations" surface stays, but the live `dms-sync-cron` edge function moves from "build in Phase 3c" to "build when Proton issues a service account."
- The seven branches imply seven `dms_branch_sessions` records — one per branch admin — if path (2) is built. Captured here so the data model is ready when needed.
- Reconciliation Review Queue (§3.1) is unaffected; it reads from `dms_raw_*` regardless of how data got there.

---

*Execution begins at Phase 0. One PR per phase, behind feature flags.*
