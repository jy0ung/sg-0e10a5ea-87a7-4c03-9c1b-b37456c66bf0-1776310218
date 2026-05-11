# Consolidated Development Plan

Status: Active consolidated source of planning truth

Last consolidated: 2026-05-11

This document summarizes the active development plan across the repo. It does not replace the detailed phase docs, runbooks, or historical closeout notes. Use this file for current status, immediate priorities, and the next implementation direction; use the linked source documents for evidence and operational detail.

## Current Snapshot

The project is in Phase 5 planning / Stage 0 baseline stabilization. Do not restart the main UBS app from scratch. The existing app already has the right production shell, auth/RLS posture, module gating, HRMS split, Auto Aging foundations, Sales MVP, reporting surfaces, and deployment evidence. The next step is to harden the data-source boundary and then refactor the affected pages in controlled slices.

The recommended first Phase 5 implementation slice is now DMS and legacy-source integration foundation plus Auto Aging source-boundary correction. The first read-only Auto Aging source ledger and backend staging skeleton are in place, and Stage 2 Sales Pipeline vehicle linking has started with controlled existing-vehicle links.

Production launch readiness is not fully closed. Phase 2 local engineering readiness is closed, and production deployment verification has passed, but `docs/LAUNCH_CHECKLIST.md` still tracks open environment, security, observability, reliability, performance, product, and process evidence before final launch sign-off.

Top active risks:

- Production launch evidence remains incomplete across RLS sign-off, Sentry, PITR/backups, restore drills, load testing, rollback proof, and security review artifacts.
- DMS integration must be designed as an upstream sync, not as ad hoc frontend calls, so UBS can replace `fookloi.net` without breaking Proton HQ data continuity.
- Type Safety and Performance Rescue is locally closed, including generated ticket types, removed local type escape hatches in the touched services/contexts, Auto Aging summary-only route loading, and service-boundary cleanup for the target contexts.
- Auto Aging no longer fully hydrates vehicles for `/auto-aging/*`; server-side report/export contracts and the read-only DMS/UBS/legacy source ledger are in place. The remaining data risk is wiring real sync/normalizer workers before treating DMS-backed reports as authoritative.
- Sales, Inventory, Executive Dashboard, and Business Reports still have surfaces that assume UBS-local vehicle/report tables are complete enough without DMS and legacy-source reconciliation.
- Phase 5 Finance work must not be built on mutable invoice totals; payment events, audit trails, reversals, RLS tests, and reconciliation contracts are required before AR/AP/GL launch.
- Private Google Sheets ingestion and any required `.xlsx` export path still need a production-ready backend decision.
- HRMS production reset and invite redirects still need verification on `hrms.protonfookloi.com`.

Primary source docs:

- [PHASE5_SALES_PIPELINE_AUTO_AGING_FINANCE_PLAN.md](PHASE5_SALES_PIPELINE_AUTO_AGING_FINANCE_PLAN.md)
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- [AUTO_AGING_REMEDIATION_BACKLOG.md](AUTO_AGING_REMEDIATION_BACKLOG.md)
- [INTERNAL_REQUEST_GAP_ASSESSMENT.md](INTERNAL_REQUEST_GAP_ASSESSMENT.md)
- [WORKFORCE_IDENTITY_ACCESS_PLAN.md](WORKFORCE_IDENTITY_ACCESS_PLAN.md)

## UBS Target Design

UBS is the Fook Loi Group internal operating system. It should manage the full local business lifecycle: leads, customers, sales orders, vehicle stock and aging, LOU aging, delivery, collections, internal requests, HRMS, reporting, and executive KPIs.

Proton DMS remains the Proton HQ upstream system. UBS should keep a durable integration link to DMS for official HQ sales, stock, order, allocation, delivery, and finance snapshots. `fookloi.net` is legacy migration history and should be treated as a backfill source, not the future operating surface.

System roles:

| System | Role | UBS treatment |
| --- | --- | --- |
| UBS | Internal Fook Loi operating app and reporting system | Canonical place for local workflow, aging, executive KPIs, approvals, notes, and cross-module reporting. |
| Proton DMS | Live Proton HQ upstream | Synced through a server-side integration with signed API requests, raw staging, reconciliation, and durable external IDs. |
| `fookloi.net` | Legacy Fook Loi system | One-time migration/backfill source for historical customers, invoices, branches, advisors, dealers, suppliers, and finance evidence. |

Design principles:

- Do not rename the whole UBS schema to match Proton field names. Keep UBS field names readable and domain-owned, while adding DMS reference columns such as `dms_so_no`, `dms_so_no_id`, `dms_customer_id`, `dms_customer_business_id`, `dms_vs_stock_id`, and `dms_last_synced_at`.
- Store raw DMS payloads unchanged in staging tables before normalizing them into UBS records. This keeps audits possible and protects UBS from DMS API shape changes.
- Use DMS as the authority for Proton-origin facts: `soNo`, order status, VIN/chassis linkage, vehicle stock status, allocation, registration, delivery state, HQ model/config/color codes, and current collection snapshots until UBS finance becomes authoritative.
- Use UBS as the authority for Fook Loi internal facts: lead handling notes, local follow-up, approvals, LOU aging, vehicle aging, SLA status, executive KPI definitions, internal remarks, reconciliation decisions, and finance adjustments after UBS finance launch.
- Use `fookloi.net` data only to backfill historical records or fill gaps where DMS does not carry legacy local detail.

Target data flow:

1. DMS sync worker fetches signed API responses from `dcs-api.proton.com`.
2. Raw responses land in `dms_raw_*` staging tables with `sync_run_id`, source endpoint, fetched timestamp, and payload hash.
3. Normalizers map DMS records into canonical UBS shapes, preserving DMS external IDs.
4. Reconciliation jobs match DMS records with existing UBS and migrated `fookloi.net` records.
5. High-confidence matches update canonical UBS tables automatically; uncertain matches go to a reconciliation review queue.
6. UBS reporting reads canonical tables and reporting views, not raw DMS tables directly.

Initial DMS sync objects:

- Sales orders from `POST /api/2b/dms.retail/manfacturer/order/pageorders`.
- Collections from `POST /api/2b/dms.retail/vcOrder/queryList`.
- Allocation and registration context from `POST /api/2b/dms.retail/manfacturer/order/query/ordersMatchCar`.
- Delivery/outbound from `POST /api/2b/dms.retail/car/order/pageDelivery`.
- Vehicle stock from `GET /api/2b/dms.retail/vsStock/findStockList`.
- Leads and prospects from `POST /api/dms.app/pc/sales/leads/page` and `POST /api/dms.app/pc/sales/prospect/page`.
- SOA finance snapshots from `GET /api/2b/dms.finance/soaRequest/getSoaList`.
- Master data from DMS product tree, model, config, color, brand, series, and duty employee endpoints.

Reporting design:

- UBS executive reporting should not be limited to Proton HQ report definitions. Build reporting views around Fook Loi KPIs such as lead conversion, consultant performance, branch pipeline, collection aging, vehicle aging, LOU aging, registration delay, delivery delay, disbursement delay, and stock aging.
- KPI definitions should be explicit and versioned so management can change targets without rewriting source data.
- Dashboard pages should use server-side summaries or reporting views, not full client-side hydration.

## Completed Work

The `.softgen` task board shows `task-1` through `task-11` as done. Completed work includes Vite environment fixes, Excel import and KPI relocation, Vehicle Explorer Excel-like table refactors, column permission management, activity dashboard, stability foundation, utility/service test coverage, observability, server-side import validation, and validation error UI. A few deferred follow-ups remain, including bulk edit, permission edge-case testing, E2E expansion, and large-dataset performance validation.

Phase closeouts and validated milestones:

| Area | Status | Notes |
| --- | --- | --- |
| Phase 1 closeout | Closed 2026-04-27 | Excel runtime replacement, bundle budget, Vehicle Explorer RPC filtering, UAT path hardening, and auth error-handling hardening completed. |
| Phase 2 production readiness | Closed locally 2026-04-28 | Local engineering readiness closed; production launch evidence remains tracked in `docs/LAUNCH_CHECKLIST.md`. |
| Phase 3 HRMS web | Formally closed 2026-04-28 | Dedicated HRMS web app, core route tree, UAT deployment, auth redirects, approval workflow smoke, and browser tests completed. |
| Phase 3.1 HRMS launcher | UAT validated 2026-04-28 | Main app now treats HRMS as a dedicated workspace launcher; legacy HRMS route aliases hand off to `/hrms/`. |
| Phase 4 shared frontend extraction | UAT validated 2026-04-29 | Shared location-preserving redirects, page spinner, and query client defaults extracted. |
| HRMS mobile expansion | Completed 2026-04-29 | Announcements, appraisal self-review/acknowledgement, notification inbox, and profile improvements documented as shipped. |
| Internal Request first enterprise slice | Implemented | Comments, attachment visibility, expanded activity history, CSV export, SLA targets, SLA filtering, requester cancellation, and approval integration are in place. |
| Type Safety and Performance Rescue | Locally closed 2026-05-10 | Supabase types were regenerated, ticket tables/RPCs are typed, residual `as any`/`as never` casts were removed from the touched ticket/data paths, Auto Aging route loading now uses summary-only mode, Vehicle Explorer/Report Center moved toward RPC-backed data, and direct `supabase.from()` context calls were moved behind services. `npm run typecheck`, `npm run lint`, edge-function security checks, and focused ticket/vehicle/dashboard tests passed. Large browser-side Auto Aging exports remain a reporting follow-up. |
| Internal Request pagination foundation | Implemented 2026-05-10 | Company queue now uses a paginated service path with server-side status, priority, and search filters plus UI page controls. SLA filtering remains client-side on the current page until a server-side SLA summary/filter contract exists. |
| iOS push notification foundation | Implemented 2026-05-10 | `send-push-notification` now supports APNs token auth through backend secrets, keeps Android FCM behavior, and passes the edge-function security check. Production still needs APNs secret provisioning and device smoke evidence. |
| Unified gap improvement plan | Code-addressable items mostly closed 2026-05-10 | Phase 1 and Phase 2 items are closed with follow-ups for server-side Auto Aging export/report contracts and server-side SLA summaries. Phase 3 is partially closed: APNs support is implemented, but approval governance refinement remains open. Phase 4 remains open as production evidence work. |
| Phase 5 source staging foundation | Scaffolded 2026-05-10 | Backend-only migration adds `sync_runs`, raw DMS staging for sales orders, vehicle stock, collections, allocation/registration, deliveries, leads, prospects, SOA, and master data, plus legacy staging for customers, sales invoices, and reference/evidence records. It also seeds deterministic reconciliation candidates without updating canonical UBS records. No browser route consumes these tables yet. |
| Stage 1B server-side reports and export | Implemented 2026-05-10 | Report Center replaced with server-side `auto_aging_report` Postgres RPC supporting four report types with pagination. Business report CSV exports capped at 10,000 rows. StockBalance, CommissionDashboard, SalesDashboard, Sales Advisors, Vehicle Transfer, Vehicle Detail, and Vehicle Bulk Actions migrated off full vehicle hydration. Executive Dashboard now uses server-side summary/branch comparison plus a capped `searchVehicles` slice for custom widgets, and added 13 new KPI tracker presets (vehicle aging, LOU aging, OBR status, registration/disbursement delay, commission tracking) with 15 new vehicle fields in the custom KPI formula catalog. Stale workbook/Google Sheets copy reworded in AutoAgingDashboard and ImportCenter; obsolete `src/services/reportService.ts` removed. `auto_aging_source_ledger` now defines the read-only DMS/UBS/legacy source-combination contract. |

Relevant evidence:

- [PHASE1_CLOSEOUT.md](PHASE1_CLOSEOUT.md)
- [PHASE2_PRODUCTION_READINESS.md](PHASE2_PRODUCTION_READINESS.md)
- [PHASE3_HRMS_WEB.md](PHASE3_HRMS_WEB.md)
- [PHASE3_1_HRMS_WORKSPACE_LAUNCHER.md](PHASE3_1_HRMS_WORKSPACE_LAUNCHER.md)
- [PHASE4_HRMS_SHARED_FRONTEND.md](PHASE4_HRMS_SHARED_FRONTEND.md)
- [HRMS_WEB_APP_PLAN.md](HRMS_WEB_APP_PLAN.md)
- [INTERNAL_REQUEST_GAP_ASSESSMENT.md](INTERNAL_REQUEST_GAP_ASSESSMENT.md)

## Current Phase

Current phase: Phase 5 / Stage 1 backend skeleton and Stage 2 Sales Pipeline vehicle-linking foundation are in progress. Server-side report RPCs, paginated exports, dashboard migrations, KPI tracker expansion, stale copy cleanup, Google Sheets/`.xlsx` decisions, the DMS/UBS/legacy source ledger, the first DMS staging Edge Function skeleton, and controlled existing-vehicle Sales Order link/unlink are implemented.

Stage 0 goal:

- Start Phase 5 from a clean, trusted baseline.
- Treat the Type Safety and Performance Rescue slice as locally closed, but keep the remaining generated-file commit decision explicit.
- Finish, isolate, or intentionally park active Internal Request governance/analytics changes.
- Re-run focused tests for Internal Request, Sales, Auto Aging, and shared query/client behavior.
- Confirm production database migration state through the latest Auto Aging summary and Internal Request work.
- Update planning docs where implementation or DMS discovery changed the Auto Aging import/reporting boundary.
- Define the DMS, legacy, UBS, and Google Sheets source roles before building the next page.

Stage 0 transition decision:

- Move to Phase 5 foundation now instead of waiting for every Internal Request enterprise follow-up.
- Carry forward only the old improvement-plan items that overlap Phase 5 data boundaries: server-side Auto Aging report/export contracts and large-report pagination.
- Park Internal Request approval-governance refinement, saved views, analytics, requester follow-up attachments, satisfaction ratings, and notification expansion as explicit enterprise follow-ups.
- Keep APNs production provisioning, PITR/restore drills, live RLS sign-off, OSV/CodeQL evidence, and security documentation as parallel launch-readiness work.

## Phase Checklist

Use this checklist to decide the next work item without needing to ask for a broad continuation. Keep it updated whenever a slice is merged, parked, or intentionally deferred.

### Stage 0 - Baseline And Source Boundary

- [x] Close Type Safety and Performance Rescue locally: regenerated Supabase types, removed touched ticket/data-path type escape hatches, and validated typecheck/lint/focused tests.
- [x] Move direct context database calls behind services for `DataContext`, `SalesContext`, and `ModuleAccessContext`.
- [x] Add Internal Request queue pagination with server-side status, priority, and search filters.
- [x] Add APNs support to `send-push-notification` while keeping Android FCM behavior.
- [x] Remove tracked `supabase/.temp/cli-latest`; keep `supabase/.temp/` ignored as local Supabase CLI working state.
- [x] Lock the source-of-truth model: DMS for Proton HQ facts, `fookloi.net` for historical backfill, UBS for local operating facts, Google Sheets for controlled exceptions only.
- [x] Decide transition strategy: move to Phase 5 foundation now, park non-blocking Internal Request enterprise follow-ups, and carry forward only data-boundary work.
- [x] Re-run full Stage 0 baseline gates after the current working set is staged or merged: `npm run typecheck`, `npm run lint`, focused Sales/Auto Aging tests, and `npm run test -- src/services/ticketService.test.ts`. **All passed 2026-05-11. Fixed missing `subscribeToSalesOrderChanges` export in `SalesContext.test.tsx` mock (30/30 tests pass).**

### Stage 1 - DMS And Legacy Foundation

- [x] Add backend-only DMS secret/config documentation with no `VITE_DMS_*` browser exposure.
- [x] Add `sync_runs` for auditable source sync attempts.
- [x] Add raw DMS staging tables for sales orders, vehicle stock, collections, allocation/registration matches, deliveries, leads, prospects, SOA snapshots, and master data.
- [x] Add legacy staging for customers, sales invoices, and generic reference/evidence records.
- [x] Add reconciliation match and event tables with company-scoped RLS.
- [x] Add deterministic reconciliation candidate seeding for sales orders, vehicles, customers, and invoice evidence without canonical UBS writes.
- [x] Dry-run the source staging migration inside a rollback transaction against local Postgres.
- [x] Generate/update Supabase TypeScript types after the migration is applied to the intended schema. **Applied all 8 pending migrations via `supabase db push --local`; regenerated `packages/supabase/src/database.types.ts` with Phase 5 tables and RPCs (`sync_runs`, `dms_raw_*`, `legacy_staging_*`, `source_reconciliation_*`, `auto_aging_report`, `auto_aging_source_ledger`, `link_vehicle_to_sales_order`, `unlink_vehicle_from_sales_order`). Typecheck + RPC contract check passed 2026-05-11.**
- [x] Add the first backend sync worker or scheduled job skeleton that can create `sync_runs` and persist raw payloads, still read-only and not page-facing. **Implemented as `dms-sync-worker`; self-hosted Edge Runtime route config must include it before live invocation.**
- [x] Add focused migration/RLS tests for the new staging and reconciliation tables. **16 new Phase 5 staging/reconciliation RLS tests added to `src/test/rls-matrix.spec.ts` (102/102 passed 2026-05-11). Tests verify: backend-only write isolation for all 11 `dms_raw_*`/`sync_runs`/`source_reconciliation_matches` tables; cross-tenant SELECT returns empty for staging rows; `normalizer_column_authority` is readable by authenticated users but blocks direct INSERT.**
- [x] Define normalizer contracts for each DMS object before writing canonical UBS updates. **Migration `20260511000000_dms_normalizer_contracts.sql` applied 2026-05-11. Adds DMS reference columns (`dms_so_no`, `dms_so_no_id`, `dms_customer_id`, `dms_customer_business_id`, `dms_vs_stock_id`, `dms_last_synced_at`) to `sales_orders`, `vehicles`, `customers`. Creates `normalizer_column_authority` table with explicit per-column authority (`dms`/`ubs_local`/`ubs_plus_dms`) and overwrite rules (`always`/`if_null`/`if_null_or_older`/`never`/`conflict_review`) for 42 columns across the three canonical tables. Creates `dms_normalizer_eligible_records` view exposing accepted/auto_matched reconciliation rows. `database.types.ts` regenerated.**
- [x] Implement `normalize_dms_sales_order()` as a staged-data-only Postgres function (no live DMS fetch). **Migration `20260511010000_normalize_dms_sales_order.sql` applied 2026-05-11. Function reads accepted `dms_raw_sales_orders` rows, applies `normalizer_column_authority` overwrite rules, upserts canonical `sales_orders` with DMS reference columns, back-links `canonical_sales_order_id`, stamps the reconciliation match, and appends a `normalized` audit event. Extended `source_reconciliation_events.event_type` check constraint with `normalized` variant. `database.types.ts` regenerated with `normalize_dms_sales_order` RPC. Focused tests in `src/test/dms-normalizer.spec.ts` (5 tests: happy path, if_null guard, idempotency, missing-match exception, unmatched return). 107/107 total tests passed 2026-05-11.**
- [x] Implement `normalize_dms_vehicle_stock()` as a staged-data-only Postgres function (no live DMS fetch). **Migrations `20260511020000` (initial) and `20260511030000` (corrective — removes invalid DMS stage mapping; `vehicles.stage` is owned by `recompute_vehicle_stage` trigger, not the normalizer). 4 focused tests added (happy path, delivery row integration, stage_override guard, unmatched return). 111/111 tests passed 2026-05-11.**
- [x] Implement `normalize_dms_customer()` as a staged-data-only Postgres function (no live DMS fetch). **Migration `20260511040000_normalize_dms_customer.sql` applied 2026-05-11. Reads customer identity from `dms_raw_sales_orders` (structured `dms_customer_id`/`dms_customer_business_id` columns + provisional `raw_payload` JSONB paths for name/ic_no/phone/email). Requires object_type='customer' match (distinct from the sales_order match on the same raw row). Back-links `dms_raw_sales_orders.canonical_customer_id`. 4 focused tests (happy path, if_null guard, missing-match exception, unmatched return). 115/115 tests passed 2026-05-11.**

### Stage 1B - Auto Aging Source-Boundary Correction

- [x] Replace remaining large browser-side Report Center/report export fetches with server-side summaries, paginated report RPCs, or server-side export jobs.
- [x] Create Auto Aging reporting/query contracts that combine DMS stock/order/allocation/delivery facts with UBS local SLA/LOU/remarks and legacy backfill through read-only `auto_aging_source_ledger`.
- [x] Reword stale in-app/report copy that presents workbook or Google Sheets upload as the normal operating path.
- [x] Decide whether private Google Sheets ingestion remains needed as a fallback; if yes, implement it through backend service-account or scheduled sync only. **Decision: No. DMS sync from Proton HQ replaces Google Sheets. Import Center remains for manual correction/backfill only.**
- [x] Decide whether `.xlsx` output is still a business requirement; if yes, implement it server-side. **Decision: No. `.xlsx` output is not a business requirement. CSV export via server-side paginated RPCs is sufficient.**

### Stage 2 - Sales Pipeline Foundation

- [x] Add controlled `link_vehicle_to_sales_order` and `unlink_vehicle_from_sales_order` RPCs with company/RLS checks.
- [x] Add `salesOrderService.linkExistingVehicle` / `unlinkExistingVehicle` plus focused tests.
- [x] Add Sales Orders UI to link an existing vehicle by chassis number or selected vehicle result.
- [x] Add linked order context in Vehicle Detail.
- [x] Add integration/RLS coverage for create order, link vehicle, unlink vehicle, and company-scope verification. **86/86 RLS tests passed on local Supabase stack 2026-05-11. Users seeded via `npm run test:rls:seed` against local Kong (port 54321). All cross-tenant isolation and Sales Order link/unlink lifecycle assertions green.**

### Parked Enterprise Follow-Ups

- [ ] Internal Request: category/template-specific approval flow routing.
- [ ] Internal Request: escalation/delegation policies and approval history timeline.
- [ ] Internal Request: saved views, server-side SLA summaries, owner workload views, and bulk actions.
- [ ] Internal Request: requester follow-up attachments and satisfaction rating.
- [ ] Internal Request: analytics dashboards and notification expansion.
- [ ] Production APNs: provision secrets and record iOS device smoke evidence.
- [ ] Launch readiness: PITR/restore drill, live RLS sign-off, OSV/CodeQL evidence, Sentry/alerts, rollback proof, and load testing.

Current foundation slice status:

1. DMS backend sync secrets/config, `sync_runs`, and raw DMS staging tables are scaffolded.
2. Legacy staging tables for high-value `fookloi.net` extracts are scaffolded.
3. Reconciliation tables and first deterministic candidate rules for sales orders, vehicles, customers, and invoice/payment evidence are scaffolded.
4. Server-side Auto Aging report RPCs (`auto_aging_report` with four report types), paginated exports (10K cap), and dashboard migrations are implemented.
5. Executive Dashboard uses server-side summary/branch comparison and a capped `searchVehicles` slice for custom widgets; custom KPI formula catalog expanded with 15 new vehicle fields and 13 new presets.
6. Stale workbook/Google Sheets copy in AutoAgingDashboard and ImportCenter reworded; ImportCenter now frames Google Sheets import as a correction/backfill path.
7. Auto Aging source-combination query contract is defined through read-only `auto_aging_source_ledger`.
8. Stage 1 backend sync skeleton is implemented as `dms-sync-worker`, accepting caller-supplied raw payloads and persisting them into DMS staging with `sync_runs` audit rows. It does not live-fetch DMS or write canonical UBS rows.
9. Stage 2 Sales Pipeline existing-vehicle link/unlink is implemented through `link_vehicle_to_sales_order`, `unlink_vehicle_from_sales_order`, sales order service wrappers/tests, Sales Orders search/link/unlink UI, and Vehicle Detail linked order context.
10. ~~Next: run `npm run test:rls` against a seeded local or isolated staging Supabase target.~~ Done 2026-05-11 — 86/86 passed.
11. ~~Next: define DMS normalizer field-mapping contracts for each `dms_raw_*` target before writing canonical UBS updates, and add focused migration/RLS tests for the new staging and reconciliation tables.~~ Done 2026-05-11 — normalizer contracts migration applied, 102/102 RLS tests passed.
12. ~~Next: implement `normalize_dms_sales_order()` — the first normalizer worker that reads `dms_raw_sales_orders.raw_payload`, applies `normalizer_column_authority` overwrite rules, and upserts into `sales_orders` with DMS reference columns set. This is the bridge from staging skeleton to live canonical UBS writes.~~ Done 2026-05-11 — 107/107 tests pass.
13. ~~Next: implement `normalize_dms_vehicle_stock()` — the equivalent staged-data normalizer for `dms_raw_vehicle_stock` → `vehicles` using the same pattern, or add the `dms-sync-worker` Edge Function to `SUPABASE_INTERNAL_FUNCTIONS_CONFIG` so it is registered for future live invocation.~~ Done 2026-05-11 — both completed. Migration `20260511020000` + corrective `20260511030000` applied. Stage column correctly left to `recompute_vehicle_stage` trigger. `[functions.*]` sections added to `supabase/config.toml`; `SUPABASE_INTERNAL_FUNCTIONS_CONFIG` JSON documented in `docs/ENV.md`. 111/111 tests pass.
14. ~~Next: implement `normalize_dms_customer()` — the staged-data normalizer for `dms_raw_sales_orders.dms_customer_id` → `customers`, or begin live DMS fetch/signing in `dms-sync-worker` (add actual HTTP fetch + HMAC signing of Proton DMS API calls).~~ Done 2026-05-11 — `normalize_dms_customer()` implemented. Migration `20260511040000` applied. 115/115 tests pass. Stage 1 checklist closed. **Live DMS fetch/HMAC signing deferred to Stage 2 (credentials/signing format not yet confirmed).**
15. ~~Next: begin Stage 2 — Sales Pipeline foundation. Add `transition_sales_order_stage()` RPC with audit events; strengthen Sales Dashboard to load without full vehicle hydration.~~ Done 2026-05-11 — Stage 3 Sales Pipeline Foundation complete (see Stage 3 section below).

### Stage 3 - Sales Pipeline Foundation

- [x] `transition_sales_order_stage()` RPC — atomic pipeline move, company scope + target-stage scope validation, `audit_logs` write, no-op if same stage, NULL un-assigns. Migration `20260511050000` + corrective `20260511060000` applied 2026-05-11.
- [x] `get_sales_pipeline_summary()` RPC — per-stage order counts and total revenue, unassigned bucket, optional branch/date filters. Uses `sales_orders.stage_id` and `selling_price`. Migration `20260511050000/060000`.
- [x] `get_sales_dashboard_summary()` RPC — single-call server-side Sales Dashboard KPIs: MTD orders/revenue, vehicles linked, branch breakdown, 6-month trend, outstanding AR. Migration `20260511050000/060000`.
- [x] `transitionOrderStage()`, `getSalesPipelineSummary()`, `getSalesDashboardSummary()` service methods in `salesOrderService.ts` with full TypeScript interfaces.
- [x] `SalesContext.moveOrderStage` updated to call `transitionOrderStage` RPC (audited) instead of direct DB update.
- [x] `SalesDashboard` fully rewritten to server-side via `getSalesDashboardSummary` + `getVehicleKpiSummary` — no longer hydrates all sales orders/invoices client-side for KPI tiles.
- [x] Corrective column-name fix: `sales_orders` uses `stage_id` (not `deal_stage_id`) and `selling_price` (not `total_price`); no `status` column exists — RPCs updated accordingly.
- [x] 7 focused integration tests in `src/test/sales-pipeline.spec.ts` (5 `transition_sales_order_stage` + 1 `get_sales_pipeline_summary` + 1 `get_sales_dashboard_summary`). 122/122 tests pass 2026-05-11.
- [x] 4 unit tests for new service methods in `salesOrderService.test.ts`. 387/411 tests pass (4 pre-existing failures unrelated to Stage 3).

Recommended first Sales workflow slice after that:

1. ~~Add controlled `link_vehicle_to_sales_order` and `unlink_vehicle_from_sales_order` RPCs with company/RLS checks.~~ Done 2026-05-10.
2. ~~Add `salesOrderService.linkExistingVehicle` / `unlinkExistingVehicle` and focused tests.~~ Done 2026-05-10.
3. ~~Add UI in Sales Orders to link an existing vehicle by chassis number or selected vehicle result.~~ Done 2026-05-10.
4. ~~Add a linked order panel in Vehicle Detail.~~ Done 2026-05-10.
5. ~~Add integration/RLS coverage for create order, link vehicle, unlink vehicle, and context verification.~~ 86/86 live RLS tests passed 2026-05-11 on local Supabase.

Do not start Finance workflows until Sales Pipeline and Auto Aging integration contracts are reliable enough to become finance dependencies.

## Immediate Action

Decision:

- Do not start over completely for the main UBS app.
- Continue from the existing main app, but stop adding new pages until the DMS/legacy-source boundary is designed and the most exposed data consumers are corrected.
- Treat Google Sheets as a temporary/manual exception path for Auto Aging, not the future primary source.

Use the Phase Checklist above as the live tracker. The detail notes below explain the same sequence and should be updated when checklist status changes.

1. Settle the current generated-file commit boundary.
   - Keep the regenerated Supabase types if they were generated from the intended live/staging schema.
   - Do not commit generated build-info files. They were removed from the working tree.
   - Remove tracked `supabase/.temp/cli-latest`; `supabase/.temp/` is Supabase CLI local working state and is already ignored.
   - Treat current local validation as green: `npm run typecheck`, `npm run lint`, focused ticket/vehicle/dashboard tests, and `npm run security:edge-functions` passed on 2026-05-10.

2. Lock the source-of-truth model before new UI pages.
   - Proton DMS is the live upstream for HQ facts: sales orders, stock, VIN/chassis linkage, allocation, registration, delivery, collection snapshots, SOA, and Proton master data.
   - `fookloi.net` is historical migration/backfill: customers, invoices, purchase invoices, dealer invoices, branches, advisors, staff, suppliers, dealers, banks, finance companies, models, and colors.
   - UBS is the canonical Fook Loi operating layer: local workflow, local approvals, LOU aging, internal remarks, SLA definitions, executive KPI definitions, reconciliation decisions, and future finance adjustments.
   - Google Sheets remains only a fallback/import exception until the DMS and legacy sync path can feed Auto Aging directly.

3. Build the server-side DMS sync and staging foundation.
   - Store DMS credentials, token refresh, signing inputs, and request code only in backend services or scheduled jobs.
   - Add `sync_runs` and `dms_raw_*` staging tables for sales orders, vehicle stock, collections, allocation/registration, delivery, leads/prospects, SOA, and master data.
   - Persist endpoint name, request filters, page/cursor, fetched timestamp, record count, status, error details, and payload hash for every sync run.
   - Keep the first sync read-only; no UBS write-back to DMS.

4. Build legacy staging before live data merge.
   - Stage `fookloi.net` customers, sales invoices, purchase invoices, dealer invoices, staff, branches, advisors, banks, suppliers, dealers, models, colors, finance companies, and payment types.
   - Do not insert legacy invoice rows directly into finance-grade canonical tables until invoice/payment models support source evidence, reconciliation status, and audit history.
   - Preserve legacy document numbering and branch/dealer codes because Finance may need continuity.

5. Create the reconciliation contract.
   - Match orders by `soNo`/`soNoId`, vehicles by `vin`/chassis, customers by IC/company registration plus phone/email/TIN, and invoice/payment evidence by invoice number, `soNo`, VIN/chassis, amount, and branch.
   - Add reconciliation tables for match decisions, conflicts, ignored records, source priority, review owner, reviewed timestamp, and notes.
   - Define overwrite rules before normalizing into canonical UBS tables. DMS fields should overwrite only official Proton-origin facts; UBS local fields should not be overwritten silently.

6. Correct Auto Aging source boundaries before building the next Auto Aging page.
   - Auto Aging should consume DMS stock/order/allocation/registration/delivery facts plus UBS local SLA/LOU/remarks and legacy backfill where DMS does not carry old local detail.
   - Replace the current Google Sheets-first operating assumption with DMS/legacy sync as the primary feed.
   - Keep the Import Center for controlled manual correction, exception uploads, and temporary backfill only.
   - ~~Finish the rescue follow-up by replacing remaining large browser-side report/export fetches with server-side summaries, paginated report RPCs, or server-side export jobs.~~ Done 2026-05-10.
   - ~~Reword stale in-app/report copy that still describes workbook or Google Sheets upload as the normal operating path.~~ Done 2026-05-10.

7. Apply the same source-boundary correction to similar modules.
   - ~~Sales Dashboard, Sales Advisors, Executive Dashboard, Inventory Stock Balance, and Vehicle Transfer currently depend on full vehicle context or UBS-local assumptions and must move toward server-side summaries backed by reconciled DMS plus UBS data.~~ Closed 2026-05-10 for current UBS-local data: StockBalance, SalesDashboard, CommissionDashboard, Sales Advisors, Vehicle Transfer, Vehicle Detail, Vehicle Bulk Actions, and Executive Dashboard now use server summaries/RPCs or targeted service calls instead of full vehicle context.
   - Business Reports currently read direct UBS tables such as `vehicles`, `sales_orders`, `purchase_invoices`, `vehicle_transfers`, and `sales_invoices`; reports must be redesigned around reconciled reporting views before executives treat them as authoritative.
   - Accounts/Finance must distinguish DMS collection snapshots, legacy invoice/payment evidence, and future UBS finance events instead of mixing them into one mutable invoice total.
   - Workforce identity already has a similar transition: HRMS `employees` should become staff truth, while `profiles` remains account state and module assignments drive Sales Advisor/module participation.

8. Re-run baseline gates after the source-boundary documentation and first staging migrations are ready.
   - `npm run typecheck`
   - `npm run lint`
   - Focused Sales/Auto Aging tests
   - `npm run test -- src/services/ticketService.test.ts`
   - Migration verification for Auto Aging summary, Internal Request, and new staging/reconciliation tables

Only after those seven items are in motion should the next product page be built. The next page should reuse the new source/reconciliation services instead of reading raw DMS, raw legacy files, or full client-side vehicle context directly.

Production launch evidence:

- Populate and verify production `.env`.
- Confirm production host bootstrap and reverse-proxy routes with HSTS and CSP headers.
- Complete RLS matrix sign-off and attach `npm run test:rls` evidence against an isolated target.
- Review OSV and CodeQL findings.
- Confirm production auth signup is disabled.
- Attach evidence that edge functions validate JWTs and same-company access.
- Pin CORS to production origins only and confirm service-role secrets are set through Supabase secrets.
- Create and wire Sentry, source-map upload, alert routing, and synthetic error verification.
- Enable production PITR, configure nightly logical dumps with production secrets, and record a restore-to-staging drill.
- Configure uptime monitoring and fill the live on-call rota.
- Run expected-volume load testing: 100,000 vehicles, 10,000 sales orders, Vehicle Explorer p95 below 2 seconds.
- Resolve or rescope the coverage target for `services/`, `contexts/`, and `lib`.
- Test rollback and record backup/DR drill, RLS pen-test notes, and enterprise CLA/DPA needs where applicable.

Phase 5 baseline gates:

- Re-run `npm run typecheck`.
- Re-run `npm run lint` and confirm there are no new errors.
- Re-run focused Sales and Auto Aging tests.
- Re-run `npm run test -- src/services/ticketService.test.ts` after Internal Request changes are settled.
- Confirm production migrations include latest Auto Aging summary and Internal Request work.
- Confirm product rules for order lifecycle, payment lifecycle, commission eligibility, and finance approval authority.

DMS integration and reconciliation:

- Add DMS sync credentials and token handling to the backend only; do not expose DMS tokens in the React app.
- Create staging tables for DMS raw sales orders, stock, collections, deliveries, leads, prospects, SOA, and master data.
- Create reconciliation tables for matches, conflicts, ignored records, and manual review decisions.
- Define matching keys by object: `soNo`/`soNoId` for orders, `vin` for vehicles, IC/company registration and phone/email for customers, invoice number/`soNo`/VIN for invoice/payment evidence.
- Decide which DMS fields are allowed to overwrite UBS fields automatically and which require manual review.

Auto Aging and reporting:

- Keep dashboard and report summaries on server-side summary/paginated paths; current UBS-local full vehicle context cleanup is closed.
- Keep dashboard drilldowns honest when server summaries replace capped samples or report exports.
- Replace Google Sheets as the assumed primary Auto Aging source with DMS/legacy/UBS reconciliation. Keep import tooling only for exception import, one-off correction, or temporary backfill.
- Google Sheets fallback decision is closed: DMS sync from Proton HQ replaces it as the normal feed.
- `.xlsx` output decision is closed: CSV export via server-side paginated paths is sufficient for the current business requirement.

HRMS production:

- Verify password reset and invite redirect behavior on `hrms.protonfookloi.com`.
- Keep standalone HRMS as the canonical HRMS web surface while the main app remains a launcher.

Internal Request:

- Pagination foundation is implemented for the company queue; extend it with server-side SLA filters, saved views, owner workload views, and bulk actions before high-volume rollout.
- Add saved views, bulk assignment/status actions, requester follow-up attachments, satisfaction rating, analytics, and notification expansion.
- Decompose `RequestSetup.tsx` before adding more governance complexity.

Push notifications:

- APNs support is implemented in the edge function, but production is not complete until `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, and sandbox/production mode are provisioned and an iOS device smoke test is recorded.

Workforce identity:

- Continue the transition toward HRMS as the workforce master, with auth in `auth.users`, account state in `profiles`, staff truth in `employees`, and module participation in `employee_module_assignments`.
- Derive Sales Advisors and future module staff from assignments instead of separate staff stores.

## Active Roadmap

Phase 5 should proceed in controlled stages.

| Stage | Focus | Exit condition |
| --- | --- | --- |
| Stage 0 | Baseline stabilization and source-boundary confirmation | Typecheck, lint, focused Sales/Auto Aging tests, ticket service baseline, migration state, and source-of-truth rules are trusted. |
| Stage 1 | DMS and legacy sync foundation with reconciliation | DMS signed fetches run server-side, legacy extracts are staged, raw staging is populated, and high-confidence matching is available for sales orders, vehicles, customers, and collections. |
| Stage 2 | Sales Pipeline foundation | Pipeline transitions are audited, branch/company scoped, server-backed, linked to DMS order IDs where present, and no longer rely on unreconciled vehicle context. |
| Stage 3 | Auto Aging and Sales integration | Existing vehicles can be linked to sales orders through controlled RPC/service paths, with DMS/UBS linked context visible in Vehicle Detail and pipeline cards. |
| Stage 4 | Accounts Receivable foundation | Payments become immutable events with allocation, receipt reference, reversal behavior, reconciliation status, AR aging, and clear separation from DMS collection snapshots. |
| Stage 5 | Accounts Payable and purchasing integration | Purchase invoice lifecycle, supplier payments, AP aging, and approval controls are auditable and company-scoped. |
| Stage 6 | General Ledger and financial reporting | Balanced immutable journal entries, chart of accounts, posting rules, accounting periods, and financial reports reconcile to AR/AP. |
| Stage 7 | Cross-module launch hardening | End-to-end order-to-cash tests, RLS tests, load tests, bundle checks, migration/rollback plans, observability, and business sign-off are complete. |

Finance guardrails:

- Use services as the API boundary for pages.
- Use transactional RPCs for cross-module writes.
- Treat every financial mutation as auditable and reversible through explicit events.
- Add RLS matrix rows and RLS tests with each finance table.
- Keep dashboards and reports server-side summarized and paginated.

DMS integration guardrails:

- DMS API calls must run through backend services or scheduled jobs, not direct browser calls, even though CORS currently permits UBS-origin requests.
- DMS tokens and signing secrets must be stored as secrets and rotated outside the client bundle.
- Every sync run must record endpoint, page/filter parameters, count, timing, success/failure, and payload hash.
- Sync should be additive and idempotent. Canonical UBS updates should be keyed by durable DMS identifiers and should never duplicate orders or vehicles.
- Any destructive or mutating DMS endpoint is out of scope. UBS reads from DMS; UBS does not write back to Proton HQ unless Proton explicitly provides and approves a write integration.

## Domain Backlogs

Auto Aging:

- Maintain the server-side overview, Report Center, dashboard, detail, and branch-list paths now that current UBS-local full-context cleanup is closed.
- Add LOU aging and vehicle aging views that combine DMS stock/order facts with UBS internal SLA rules and local remarks.
- Replace the Google Sheets-only operating path with DMS and legacy-source sync as the primary feed, leaving manual import as a controlled exception/backfill path.
- Expand coverage for dashboard drilldowns, direct detail route access, SLA save behavior, mapping CRUD, and commission transitions.
- Improve Data Quality, Import History, and SLA Admin for filtering, pagination, audit/history visibility, and empty/error states.

DMS and legacy reconciliation:

- Backfill `fookloi.net` customers, invoices, purchase invoices, dealer invoices, staff, branches, advisors, banks, suppliers, dealers, models, and colors into legacy staging.
- Build DMS staging for sales orders, collections, allocation/registration, delivery, vehicle stock, leads/prospects, SOA, and Proton master data.
- Match records using durable keys first: `soNo`, `soNoId`, `vin`, IC/company registration, TIN, phone, email, invoice number, and branch/dealer codes.
- Create a reconciliation review queue for fuzzy customer matches, duplicate VINs, invoice amount differences, payment conflicts, and missing DMS links.
- Preserve source evidence on canonical records through source IDs, sync timestamps, raw payload snapshots, and reconciliation decision history.

Internal Request:

- Refine approval governance by linking categories/templates to specific approval flows.
- Add escalation/delegation policies for overdue approval steps.
- Add approval history display in request detail.
- Add pagination, server-side filters, saved views, bulk actions, follow-up attachments, satisfaction rating, analytics, and notification expansion.
- Decompose Request Setup into focused catalog, forms, routing, attachments, SLA, and approval governance sections.

Workforce identity and access:

- Keep the additive workforce model as the target: `employees`, `profiles.employee_id`, and `employee_module_assignments`.
- Refactor HRMS Employee Directory to use `employees` as the primary store.
- Rebuild Sales Advisor selection from employee module assignments.
- Convert User & Roles into account linking plus module assignment management.
- Move permission checks away from depending only on `profiles.role`.

HRMS:

- Dedicated HRMS web is closed through Phase 4 shared frontend extraction and production domain work is mostly complete.
- Remaining production follow-up is password reset and invite verification on the HRMS hostname.
- Keep future shared frontend extraction incremental and only extract code where both shells already depend on the same behavior.

Production readiness:

- Keep `docs/LAUNCH_CHECKLIST.md` as the owner-approved gate list.
- Update `docs/SECURITY_SIGNOFF.md`, `docs/RLS_MATRIX.md`, `docs/DR_DRILLS.md`, and release notes as evidence is collected.

## Validation Gates

Before Phase 5 implementation starts:

```bash
npm run typecheck
npm run lint
npm run test -- src/services/salesOrderService.test.ts src/contexts/SalesContext.test.tsx src/services/vehicleService.test.ts src/pages/auto-aging/AutoAgingDashboard.test.tsx
npm run test -- src/services/ticketService.test.ts
```

Before closing any Sales/Auto Aging integration slice:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:budget
```

Before launching new Finance workflows:

```bash
npm run test:rls
bash scripts/security-check.sh
npm run build:budget
```

Required non-command evidence:

- Product owner confirms lifecycle semantics for sales orders, payments, commissions, and finance approvals.
- RLS/security sign-off evidence is attached for new tables, RPCs, and edge-function behavior.
- Migration and rollback plan is documented for staging/UAT data.
- Performance evidence shows server-side summaries and pagination meet agreed production volumes.
- Business owner signs off on finance workflow semantics before AR/AP/GL launch.

## Source Index

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [AUDIT.md](../AUDIT.md)
- [CHANGELOG.md](../CHANGELOG.md)
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- [PHASE1_CLOSEOUT.md](PHASE1_CLOSEOUT.md)
- [PHASE2_PRODUCTION_READINESS.md](PHASE2_PRODUCTION_READINESS.md)
- [PHASE3_HRMS_WEB.md](PHASE3_HRMS_WEB.md)
- [PHASE3_1_HRMS_WORKSPACE_LAUNCHER.md](PHASE3_1_HRMS_WORKSPACE_LAUNCHER.md)
- [PHASE4_HRMS_SHARED_FRONTEND.md](PHASE4_HRMS_SHARED_FRONTEND.md)
- [PHASE5_SALES_PIPELINE_AUTO_AGING_FINANCE_PLAN.md](PHASE5_SALES_PIPELINE_AUTO_AGING_FINANCE_PLAN.md)
- [AUTO_AGING_REMEDIATION_BACKLOG.md](AUTO_AGING_REMEDIATION_BACKLOG.md)
- [AUTO_AGING_GOOGLE_SHEETS_IMPORT_RUNBOOK.md](AUTO_AGING_GOOGLE_SHEETS_IMPORT_RUNBOOK.md)
- [HRMS_WEB_APP_PLAN.md](HRMS_WEB_APP_PLAN.md)
- [INTERNAL_REQUEST_GAP_ASSESSMENT.md](INTERNAL_REQUEST_GAP_ASSESSMENT.md)
- [INTERNAL_REQUEST_REFACTOR.md](INTERNAL_REQUEST_REFACTOR.md)
- [WORKFORCE_IDENTITY_ACCESS_PLAN.md](WORKFORCE_IDENTITY_ACCESS_PLAN.md)
- [RLS_MATRIX.md](RLS_MATRIX.md)
- [SECURITY_SIGNOFF.md](SECURITY_SIGNOFF.md)
- [DR_DRILLS.md](DR_DRILLS.md)
