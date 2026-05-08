# Phase 5: Sales Pipeline, Auto Aging Integration, Accounts, and Finance

Status: Planning  
Assessment date: 2026-05-08  
Decision: Conditionally ready to start the next stage after the current worktree is stabilized and validation is green.

## Executive Assessment

The platform can move into the next stage, but the next stage should be treated as a controlled product phase rather than a broad feature sprint. The strongest path is to begin with Sales Pipeline and Auto Aging integration, then layer Accounts and Finance once the operational order-to-vehicle flow is reliable.

The repo has a strong production baseline: deployed auth/profile flows, module gating, Auto Aging import/search/report foundations, Sales order/invoice MVP surfaces, HRMS split, production verification scripts, and RLS documentation. The next stage is feasible because the main business records already exist: `vehicles`, `sales_orders`, `customers`, `invoices`, `deal_stages`, `purchase_invoices`, `dealer_invoices`, `official_receipts`, `commission_rules`, and `commission_records`.

The main caution is that Accounts and Finance should not be built directly on top of the current Sales invoice MVP without first tightening integration contracts, audit trails, payment records, and server-side reporting paths. Finance data becomes a system of record; it needs stronger invariants than dashboard-only features.

## Go / No-Go

Recommendation: Go, with gates.

Start Phase 5 discovery and Sales Pipeline integration work now, but do not launch Finance workflows until the gates below pass.

Required gates before heavy implementation:

- Current dirty Internal Request work is completed, reverted by its owner, or intentionally parked on a branch. Do not mix it with Phase 5 work.
- `npm run typecheck` passes.
- Focused Sales and Auto Aging tests pass: `npm run test -- src/services/salesOrderService.test.ts src/contexts/SalesContext.test.tsx src/services/vehicleService.test.ts src/pages/auto-aging/AutoAgingDashboard.test.tsx`.
- Existing terminal history shows a recent failed `npm run test -- src/services/ticketService.test.ts`; re-run it after the current Internal Request changes are settled so the baseline is known.
- Product rules are confirmed for order lifecycle, payment lifecycle, commission eligibility, and finance approval authority.

## Current Baseline

### Auto Aging

Strengths:

- Vehicle import, review, search, dashboard, SLA, commission, and report surfaces exist.
- Vehicle Explorer is RPC-backed through `search_vehicles`.
- Auto Aging overview has moved toward server-side summaries through `auto_aging_dashboard_summary` and a capped `searchVehicles` sample.
- Vehicle permissions, RLS posture, and operational docs already exist.

Remaining risks:

- Import Center is now browser-lightweight, but it depends on public or published Google Sheets URLs; private sheets still need a backend connector or service-account path.
- Manual workbook upload and browser XLSX export were retired to remove the Excel vendor chunk, so any teams still operating from native Excel files now need an explicit conversion or server-side export workflow.
- Auto Aging Reports still use full `useData().vehicles` hydration in `ReportCenter`.
- Several sibling Auto Aging routes still trigger full `DataContext` vehicle loading because only exact `/auto-aging` uses summary-only mode.
- Some operational pages remain thin for large data: Data Quality, Import History, SLA Admin, Commission dashboards.
- Dashboard drilldowns use a capped 2,000-row sample, so detailed charts can differ from the full fleet at scale.

### Sales

Strengths:

- Sales pages exist for overview, deal pipeline, orders, invoices, dealer invoices, sales advisors, and performance.
- `SalesContext` uses React Query and branch-scoped query keys.
- Sales orders include `vehicle_id`, `chassis_no`, VSO, deposit, loan, outstanding, finance company, insurance company, plate number, and deal stage fields.
- `createVehicleFromSalesOrder` already creates a linked Auto Aging vehicle from a confirmed/booked order.
- `moveSalesOrderStage` and invoice payment recording exist as service methods.

Remaining risks:

- Deal Pipeline is an MVP kanban: drag/drop updates stage but does not yet drive order status, vehicle stage, finance checkpoints, or approval/audit workflows beyond a generic user action log.
- Sales Dashboard still reads Auto Aging totals from full `DataContext` vehicles.
- Vehicle linking is order-to-new-vehicle only; there is no robust link-existing-vehicle workflow or transactional RPC that enforces company scope and chassis uniqueness.
- Invoice payment is stored as cumulative `paid_amount`; there is no payment event ledger, receipt reference, reversal flow, or reconciliation status.
- Sales services are serviceable, but cross-module workflows still need stronger contract tests and RLS tests.

### Accounts and Finance

Strengths:

- The `accounts` role exists and defaults to company scope.
- Basic invoice, purchase invoice, dealer invoice, payment type, bank, supplier, finance company, official receipt, and commission concepts exist.
- Reports already have some finance-adjacent data sources.

Current gap:

- There is no dedicated Accounts/Finance module yet.
- There is no AR ledger, AP workflow, GL journal, chart of accounts, reconciliation workflow, payment events table, credit note/debit note model, bank statement import, or period close process.
- Existing Sales invoices are useful for MVP tracking but are not yet a finance-grade subledger.

## Phase 5 Principles

1. Keep services as the API boundary. New pages should call service methods, not direct `supabase.from()` calls.
2. Prefer transactional RPCs for cross-module writes such as order-to-vehicle linking, invoice posting, payment allocation, and GL posting.
3. Treat Finance as a system of record. Every financial mutation needs audit entries, actor identity, timestamps, reversal behavior, and RLS tests.
4. Use server-side pagination and summaries for high-volume data. Avoid adding new dashboards that depend on full client-side table hydration.
5. Preserve production safety. Schema migrations must be additive first, with backfills and cutovers separated where practical.

## Legacy Discovery Snapshot - 2026-05-08

Purpose: Use read-only legacy extraction to model Phase 5 modules against real field names, record shapes, and volumes before designing new Sales, Accounts, or Finance workflows.

What was executed:

- Ran the Playwright legacy extractor in read-only mode only; no database seed, migration, deploy, delete, update, export, or remote mutation was performed.
- Patched `e2e/proton-extract.spec.ts` with verified live routes discovered from the authenticated legacy navigation.
- Added `EXTRACT_ONLY` support so future discovery runs can target specific legacy tables instead of crawling every module.
- Re-ran the extractor for the high-value discovery routes and wrote local JSON artifacts under `test-results/extract/`.
- Ran `npx tsx scripts/seed-from-extract.ts --dry-run`; this mapped rows locally and wrote no database data.

Verified extraction counts:

| Extract | Rows | Discovery value |
|---|---:|---|
| `customers` | 22,328 | Complete customer grid from `viewCustomerInfo.php`; includes name, IC/company registration, TIN, address lines, postcode, email, phone, e-invoice validation, uploaded IC filename, and status. |
| `invoices` | 806 | Sales invoice report from `invoiceReport.php`; includes customer identity, chassis, engine, color, registration, finance company, selling price, OTR price, loan amount, insurance, booking/deposit, bank/finance due, customer due, and handling fee fields. |
| `purchase-invoices` | 336 | Purchase invoice grid from `invoiceList.php`; includes supplier, chassis number, CBU invoice number, invoice date, and amount. |
| `dealer-invoices` | 78 | Dealer sales invoice grid; includes branch, dealer, car model/color, chassis, sales price, paid/outstanding amounts, payment status, and invoice status. |
| `sales-advisors` | 227 | Advisor master data from `viewSalesAdvisor.php`; includes advisor ID/code, IC, contact, join/resign dates, description, and status. |
| `staff` | 94 | User/staff master data from `viewStaff.php`; includes name, group/role label, branch scope, email, contact, and status. |
| `finance-companies` | 98 | Finance company/bank-like master data with names and address fields. |
| `branches` | 11 | Branch master data, including operational series numbers for receipts, invoices, VDO, VSO, transfers, refunds, and credit notes. |
| `vehicle-models` | 54 | Model master data with code, model name, amount, approved SA amount, and status. |
| `vehicle-colours` | 16 | Color master data with status. |
| `insurance-companies` | 14 | Insurance company master data. |
| `banks` | 15 | Bank/payment account master data. |
| `suppliers` | 12 | Supplier master data. |
| `dealers` | 19 | Dealer master data. |
| `payment-types` | 3 | Payment type master data. |

Known gaps from discovery:

- `sales-orders` remains empty because `viewSalesBooking.php` is a filter-driven page rather than a direct listing table. The next discovery pass must inspect filter combinations or related report endpoints rather than treating it as a plain grid.
- `vehicles` and `official-receipts` still contain old placeholder files from the first extraction pass; the patched mapper now drops those raw-only placeholder rows during dry-run.
- `commission-records` still has no verified extract route.
- The latest `_manifest.json` reflects the targeted extractor run, not every previously extracted file. Use individual JSON file counts for the full discovery inventory until the next full extractor run is performed.

Dry-run mapping result:

- The mapper processed 23,886 extracted records and identified 23,884 rows with mapped business fields; the two excluded rows were legacy placeholder rows.
- `--dry-run` no longer requires `SUPABASE_SERVICE_ROLE_KEY`, so mapping inspection can be run without service-role credentials.
- Sales invoices, purchase invoices, dealer invoices, customers, vehicle models, colors, and staff now map enough fields to be useful for schema design.

Schema implications before any live seed:

- Do not run live seed yet. The dry-run proves extraction shape, not finance-grade insert readiness.
- Current `invoices` require `sales_order_id` and constrained `payment_status`, but legacy sales invoice rows are report-style records keyed by invoice/customer/chassis and have status values such as `Invoice`. A staging/import table or richer sales invoice model is needed before inserting them.
- Current `purchase_invoices` requires `model`, but the legacy purchase invoice grid exposes supplier, chassis, invoice number, date, and amount only. Model should be derived from vehicle/chassis context or made nullable/staged during import.
- Customer address and e-invoice identity data are richer than the current `customers` table. Consider `address_line_1`, `address_line_2`, `address_line_3`, `postcode`, `tin_no`, `tin_type`, `e_invoice_validation`, and uploaded identity document metadata before final import design.
- Branch records include document numbering series that should not be lost if Finance uses legacy numbering continuity.
- Dealer invoices include paid amount, outstanding amount, and payment status, but the current table only models invoice-level basics. Payment allocation or reconciliation tables are needed before this becomes finance-grade.

Immediate safe next discovery actions:

1. Add a route/selector strategy for sales booking by branch and customer filters, or find a direct booking report endpoint that returns a complete order table.
2. Find verified routes for commission records and official receipts.
3. Design staging tables for legacy sales invoices and purchase invoices before considering any live seed.
4. Update the Sales/Finance schema plan from the extracted fields before building UI screens.

## Delivery Roadmap

### Stage 0 - Baseline Stabilization

Goal: Start Phase 5 from a clean, trusted baseline.

Scope:

- Finish or isolate the current Internal Request changes.
- Re-run focused tests for Internal Request, Sales, Auto Aging, and shared query/client behavior.
- Update `docs/AUTO_AGING_REMEDIATION_BACKLOG.md` to mark the overview summary RPC as implemented while keeping Report Center/full hydration as open.
- Confirm whether the production database has all migrations through the latest Auto Aging summary and Internal Request work.

Acceptance gates:

- `npm run typecheck` passes.
- `npm run lint` has no new errors.
- Focused Sales and Auto Aging tests pass.
- Any failing Internal Request tests are resolved or explicitly scoped out before Phase 5 branches start.

### Bundle Growth Improvement Plan

Goal: Keep Phase 5 dashboards and finance/reporting surfaces from making initial web bundles materially worse.

Current signal:

- The recent production build passes, but Vite warns that some chunks are larger than the default 500 kB threshold after minification.
- The browser Excel runtime path has now been removed from the production bundle; `vendor-excel` no longer appears in the current `npm run build:budget` output.
- The main watch items are now `vendor-charts` at roughly `432.9 kB raw / 114.6 kB gzip`, `index` at roughly `269.2 kB raw / 86.4 kB gzip`, and `vendor-ui` at roughly `258.9 kB raw / 75.1 kB gzip`.
- This closes the earlier Excel parse-cost issue, but it shifts the remaining risk toward workflow coverage, large-data hydration, and whether Finance users still require first-class XLSX interoperability.

Observed contributors:

- Chart-heavy pages and shared UI dependencies are accumulating into large vendor bundles that can grow as more Phase 5 dashboards are added.
- `ReportCenter` still shapes exports from full client-side vehicle hydration, so bundle cleanup did not solve the large-data memory path.
- The new Import Center path is operationally lighter, but it only supports public or published Google Sheets CSV export and does not yet support private Google Workspace sources.
- The runtime UX and operating model now depend on upstream Google Sheets publishing discipline, while some surrounding runbooks and tests still reflect the older workbook mental model.

Post-change gap assessment:

- Gap closed: browser-side workbook parsing and XLSX generation no longer inflate the production bundle, and the Excel-specific vendor chunk has been removed from runtime output.
- Gap closed: Auto Aging import and reporting no longer preload Excel code on user interaction because the browser no longer offers native Excel import/export actions.
- Gap opened: private Google Sheets access is still unsupported. Enterprise usage will need an authenticated backend fetch path, service account, or controlled sync job.
- Gap opened: native XLSX export capability is gone from the browser. If leadership, Finance, or downstream partners still require `.xlsx`, the export should move server-side rather than reintroducing browser Excel dependencies.
- Gap opened: operational onboarding now depends on a documented Excel-to-Google-Sheets conversion path for teams that still originate data in spreadsheets.
- Gap still open: Report Center and other analytics surfaces continue to depend on full `DataContext` hydration, so dataset scale remains a performance constraint even after the bundle win.
- Gap still open: import and reporting test coverage should be expanded to cover the new Google Sheets-only runtime path rather than assuming workbook upload remains the canonical browser flow.

Improvement plan:

1. Establish a hard baseline before new Phase 5 feature work.
	- Record the current `npm run build` and `npm run build:budget` output as the baseline.
	- Treat any meaningful growth in `index`, `vendor-ui`, or `vendor-charts` as a review item in PR validation. Track `vendor-excel` only if an intentional server/client reintroduction is proposed.

2. Keep heavy libraries out of the browser unless they are strictly required.
	- Do not reintroduce browser-side Excel parsing or XLSX generation unless there is a validated business requirement that CSV or Google Sheets cannot satisfy.
	- If XLSX returns, prefer a server-side export job or download endpoint over reviving client bundle weight.
	- Apply the same rule to any future PDF, spreadsheet, or chart export libraries.

3. Split reporting and dashboard code paths more aggressively.
	- Keep Sales dashboards, Finance dashboards, Report Center, and import/reconciliation workflows in separate lazy route chunks.
	- Avoid importing export helpers, report builders, or reconciliation tooling into shared dashboard shells.
	- Where a page contains both overview and export/report logic, move the export/report logic into a secondary lazy panel or action-triggered module.

4. Use server-side summaries to reduce dashboard dependency weight.
	- Prefer summary RPCs and scoped service methods over large client-side data hydration.
	- This does not directly reduce bundle size, but it prevents the common pattern where one dashboard pulls in both heavy code and heavy data paths.

5. Add measured chunk controls only after route boundaries are tightened.
	- If route-level lazy loading is still not enough, introduce explicit `manualChunks` in Vite for charts and finance/reporting tooling.
	- Do this only after measurement so chunk splitting follows real usage patterns instead of arbitrary bucket names.

6. Make bundle size part of launch hardening.
	- Run `npm run build:budget` in Phase 5 validation, not only `npm run build`.
	- Keep the current custom bundle-budget script aligned with actual performance goals rather than using the Vite warning threshold alone.
	- Require review when any lazy route chunk materially exceeds the current route budget or when shared vendor chunks trend upward release over release.

Implementation checklist:

- [x] Capture the current baseline from `npm run build` and `npm run build:budget`, then record the raw and gzip sizes for `index`, `vendor-ui`, and `vendor-charts` in the Phase 5 work log.
- [x] Remove browser-side Excel import/export from the runtime path so `vendor-excel` no longer ships in the current production bundle.
- [ ] Decide whether the business still needs native `.xlsx` output. If yes, define a server-side export path instead of restoring browser Excel dependencies.
- [ ] Define the authenticated/private Google Sheets import architecture for production companies that cannot publish sheets publicly.
- [x] Add an operational runbook for converting Excel-origin source files into the supported Google Sheets import path: [AUTO_AGING_GOOGLE_SHEETS_IMPORT_RUNBOOK.md](AUTO_AGING_GOOGLE_SHEETS_IMPORT_RUNBOOK.md).
- [x] Add focused unit coverage for Google Sheets import success, inaccessible/private-sheet failures, HTML responses, unsupported CSV shapes, and standard hash-based sheet tab URLs.
- [ ] Audit Sales, Auto Aging, and future Finance overview pages for direct imports of report builders, export helpers, or reconciliation logic from the main route component.
- [ ] Move any heavy export/report code found in overview routes into action-triggered dynamic imports or secondary lazy panels.
- [ ] Check whether chart-heavy pages are pulling shared chart code into unrelated routes, and isolate any chart/report helpers that do not need to live in a common shell.
- [ ] Review `src/main.tsx` and any Phase 5 route additions to keep Sales dashboards, Finance dashboards, Report Center, and import/reconciliation flows in separate lazy route boundaries.
- [ ] Review high-hydration dashboard surfaces such as `src/contexts/DataContext.tsx`, Sales summary pages, and Auto Aging overview queries so new Phase 5 work uses summary RPCs instead of expanding client-side dashboard dependencies.
- [ ] Rebuild after each refactor slice and compare chunk output to the original baseline before taking the next slice.
- [ ] Only if route and feature boundaries are still insufficient, add measured `manualChunks` rules in `vite.config.ts` for charts or finance/reporting code based on observed build output.
- [ ] If `manualChunks` is introduced, update `scripts/check-bundle-budget.ts` only where the expected chunk names or budget envelopes genuinely changed.
- [ ] Re-run `npm run build` and `npm run build:budget` as the final validation gate and attach the before/after numbers to the Phase 5 rollout evidence.

Suggested acceptance gates:

- `npm run build` passes with no new unexpected chunk spikes.
- `npm run build:budget` passes.
- No Sales or Finance overview page statically imports Excel/export code.
- New report/export features load on demand rather than from the main dashboard entry path.
- Any reintroduction of `.xlsx` capability is implemented server-side or otherwise justified with a measured bundle tradeoff.
- Private Google Sheets support is not considered complete until it avoids public sharing and uses an authenticated backend path.
- Any new chunk-splitting config is backed by a before/after size comparison.

### Stage 1 - Sales Pipeline Foundation

Goal: Make the Sales Pipeline operationally reliable before it becomes the driver for Auto Aging and Finance.

Scope:

- Define canonical order lifecycle: enquiry, quoted, confirmed, booked, delivered, cancelled, plus any business-specific hold states.
- Decide whether `deal_stages` are purely visual pipeline columns or authoritative workflow states.
- Add stage transition rules and audit records for pipeline movement.
- Add server-side filtering/pagination for sales orders before high-volume rollout.
- Strengthen Sales Dashboard to use server-side summaries instead of full Sales and Auto Aging context hydration.
- Improve Sales Orders UX for edit, view detail, status transition, duplicate checks, and validation.

Suggested implementation:

- Add RPC/service method: `get_sales_pipeline_summary`.
- Add RPC/service method: `transition_sales_order_stage`.
- Extend `salesOrderService` with transition-specific methods rather than overloading generic update.
- Add tests for allowed/disallowed transitions and branch/company scoping.

Acceptance gates:

- Pipeline move creates an audit event with before/after stage.
- Branch-scoped users cannot move or view other branch orders.
- Sales Dashboard loads without full vehicle hydration.
- Pipeline and Sales Orders focused tests pass.

### Stage 2 - Auto Aging and Sales Integration

Goal: Create a reliable operational bridge from vehicle aging to sales execution.

Scope:

- Link existing vehicles to sales orders by company-scoped `vehicle_id` or unique chassis number.
- Keep `sales_orders.vehicle_id` and `sales_orders.chassis_no` synchronized through a controlled service/RPC path.
- Add linked order visibility on Vehicle Detail.
- Add vehicle aging badges on Deal Pipeline cards: BG age, delivery status, registration delay, disbursement delay.
- Add sales order drilldown from Auto Aging vehicle views.
- Add workflow for order status changes that optionally update vehicle stage or milestone fields.
- Add commission eligibility checks using invoice/payment/vehicle data.

Suggested implementation:

- Add RPC: `link_vehicle_to_sales_order(p_order_id, p_vehicle_id)`.
- Add RPC/view: `sales_order_vehicle_context` for order, vehicle, latest invoice, payment status, and commission status.
- Add service methods in `salesOrderService`: `linkExistingVehicle`, `unlinkVehicle`, `getOrderVehicleContext`.
- Add service method in `vehicleService`: `getVehicleSalesContext`.

Acceptance gates:

- A sales order can link to an existing vehicle without duplicate vehicle creation.
- Invalid cross-company links are blocked by RLS/RPC checks.
- Vehicle Detail shows linked order, invoice, payment, and commission status.
- Pipeline card badges are backed by server-side context, not full fleet hydration.
- Integration tests cover create order -> link vehicle -> move stage -> verify vehicle context.

### Stage 3 - Accounts Receivable Foundation

Goal: Turn invoice/payment tracking into a finance-grade AR workflow.

Scope:

- Introduce payment events instead of only updating cumulative invoice `paid_amount`.
- Track receipt reference, payment method, bank/account, payment date, collector, notes, and reversal status.
- Add AR aging summary: current, 1-30, 31-60, 61-90, 90+ days.
- Add invoice detail with payment history and outstanding amount.
- Add reconciliation status: unreconciled, partially reconciled, reconciled, disputed.
- Add permission gates for accounts role and management roles.

Suggested schema:

- `invoice_payments`
- `payment_allocations`
- `finance_accounts` or `bank_accounts`
- `ar_reconciliation_items`
- Optional view: `accounts_receivable_aging`

Suggested services:

- `accountsReceivableService.ts`
- `paymentService.ts`
- `reconciliationService.ts`

Acceptance gates:

- Recording payment creates an immutable payment event and updates invoice status through a controlled path.
- Reversals create compensating entries; they do not silently edit history.
- AR aging report loads in under 2 seconds for the agreed staging dataset.
- Accounts users can see company AR but not cross-company data.
- Sales users can see customer/order payment status only at the allowed detail level.

### Stage 4 - Accounts Payable and Purchasing Integration

Goal: Build AP around existing purchase invoice and supplier data.

Scope:

- Normalize purchase invoice lifecycle: received, verified, approved, scheduled, paid, cancelled.
- Add supplier statement/payment records.
- Connect vehicle procurement costs to inventory and gross margin reporting.
- Add approval flow for AP payment release if required by business process.
- Add AP aging dashboard and export.

Suggested schema:

- `supplier_payments`
- `purchase_invoice_payment_allocations`
- `ap_reconciliation_items`
- Optional view: `accounts_payable_aging`

Acceptance gates:

- AP payment cannot exceed approved outstanding amount unless an override permission is present.
- AP aging is company-scoped and exportable.
- Supplier payment history is auditable.
- Purchase invoice changes are covered by RLS and service tests.

### Stage 5 - General Ledger and Financial Reporting

Goal: Add GL only after AR/AP events are stable.

Scope:

- Define chart of accounts and account mapping rules.
- Post journal entries from invoice creation, payment receipt, supplier invoice, supplier payment, commission accrual/payment, and adjustments.
- Add trial balance, revenue summary, gross margin, and reconciliation reports.
- Add period lock/close controls.
- Add export format expected by accounting review.

Suggested schema:

- `chart_of_accounts`
- `journal_entries`
- `journal_lines`
- `posting_rules`
- `accounting_periods`
- `financial_report_runs`

Acceptance gates:

- Every posted journal entry balances debit and credit.
- Posted entries are immutable; corrections use reversals/adjustments.
- Closed periods block normal edits.
- RLS tests cover accounts, managers, company admins, and cross-company isolation.
- Finance reports reconcile to AR/AP subledger totals.

### Stage 6 - Cross-Module Launch Hardening

Goal: Make the whole order-to-cash path production-ready.

Scope:

- End-to-end tests for order -> vehicle -> invoice -> payment -> reconciliation -> reporting.
- Load tests for Sales Dashboard, Auto Aging dashboard, AR aging, AP aging, and GL trial balance.
- Update `docs/RLS_MATRIX.md`, `docs/SECURITY_SIGNOFF.md`, `docs/LAUNCH_CHECKLIST.md`, and user/admin runbooks.
- Add observability around failed RPCs, payment reversals, posting failures, and reconciliation mismatches.

Acceptance gates:

- `npm run typecheck`, `npm run lint`, `npm run test`, and relevant Playwright tests pass.
- `npm run test:rls` passes for new finance tables.
- `npm run build` passes without new unacceptable bundle growth.
- Staging/UAT data migration and rollback plan are documented.
- Business owner signs off on finance workflow semantics.

## First Implementation Slice

The best first slice is not GL. Start with Sales Pipeline plus robust vehicle linking.

Recommended first branch:

1. Add `link_vehicle_to_sales_order` RPC with company/RLS checks.
2. Add `salesOrderService.linkExistingVehicle` and tests.
3. Add UI in Sales Order detail/table to link an existing vehicle by chassis number or selected vehicle result.
4. Add linked order panel in Vehicle Detail.
5. Add focused integration tests for link/create/unlink behavior.

Why this slice first:

- It directly supports Sales Pipeline and Auto Aging integration.
- It reduces duplicate vehicle creation risk.
- It creates a reliable data contract that Finance can later depend on.
- It is valuable even before full Accounts/Finance exists.

## Key Risks to Track

| Risk | Impact | Mitigation |
|---|---|---|
| Finance built on mutable invoice totals | Audit and reconciliation failures | Add payment events and reversal model before AR launch |
| Pipeline stages conflict with order status | Confusing workflow and unreliable automation | Define status vs visual stage semantics before coding transitions |
| Full vehicle hydration leaks into Sales/Finance dashboards | Poor performance at production scale | Add server-side summaries and scoped context queries |
| Large shared/vendor chunks keep growing during Phase 5 | Slower first load and degraded dashboard responsiveness | Enforce `build:budget`, keep heavy libraries lazy, and split report/export code from overview routes |
| Cross-module writes split across client calls | Partial updates and data drift | Use transactional RPCs for link/post/reconcile operations |
| RLS added late | Security regressions | Add RLS matrix and tests with each new table |
| Commission rules depend on incomplete payment semantics | Wrong payout status | Gate commission automation behind payment event model |

## Documentation Updates Needed During Phase 5

- Update `docs/AUTO_AGING_REMEDIATION_BACKLOG.md` after confirming which summary/report items are complete.
- Add Finance rows to `docs/RLS_MATRIX.md` with explicit access rules.
- Add Finance launch evidence to `docs/SECURITY_SIGNOFF.md`.
- Add Accounts/Finance env, smoke, and support notes to `docs/DEPLOY.md` or `docs/RELEASE.md` only if runtime behavior changes.
- Add user-facing operating runbooks for AR payment entry, reversal, reconciliation, AP payment, and period close.

## Open Business Questions

- Should `deal_stages` be configurable per company, or should some stages become fixed system states?
- When a sales order is marked delivered, should Auto Aging `delivery_date` be updated automatically, suggested for review, or left manual?
- What exact event makes commission payable: delivery, invoice issued, full payment, disbursement, or manager approval?
- Are dealer sales, customer sales, and purchase invoices financially separate ledgers or invoice types in one ledger?
- Do Accounts users need branch restrictions, company-wide visibility, or separate approval limits?
- Is GL required in Phase 5, or is AR/AP with export to external accounting software enough for the first release?

## Reference Surfaces

- Auto Aging overview: `src/pages/auto-aging/AutoAgingDashboard.tsx`
- Auto Aging reports: `src/pages/auto-aging/ReportCenter.tsx`
- Data hydration boundary: `src/contexts/DataContext.tsx`
- Sales context: `src/contexts/SalesContext.tsx`
- Sales pipeline: `src/pages/sales/DealPipeline.tsx`
- Sales orders: `src/pages/sales/SalesOrders.tsx`
- Sales invoices: `src/pages/sales/Invoices.tsx`
- Sales services: `src/services/salesOrderService.ts`, `src/services/invoiceService.ts`
- Vehicle services: `src/services/vehicleService.ts`
- Existing Auto Aging backlog: `docs/AUTO_AGING_REMEDIATION_BACKLOG.md`
- Architecture conventions: `docs/ARCHITECTURE.md`
- RLS posture: `docs/RLS_MATRIX.md`