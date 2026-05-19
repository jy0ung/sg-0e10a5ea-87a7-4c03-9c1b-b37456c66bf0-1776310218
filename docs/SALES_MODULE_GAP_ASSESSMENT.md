# Sales Module — Full GAP Assessment

> **Prepared by:** Senior Full-Stack Architect / Sales Operations Analyst / DB Architect / Workflow Engineer / RBAC Reviewer / Enterprise UI/UX Auditor
> **Assessment Scope:** All Sales submodules, routes, services, DB tables, RLS policies, workflows, and UI/UX patterns
> **Overall Readiness:** ~38% — functional shells exist, but critical workflow, data-model, relationship, and UI/UX gaps block production viability at scale.

---

## A. Executive Summary

The Sales Module has a solid technical foundation: Supabase RLS, React Query, a dedicated `SalesContext`, audited pipeline transitions via SECURITY DEFINER RPCs, and an event-sourced AR ledger. However, the module is missing the majority of the business-workflow scaffolding required for a dealership to operate end-to-end.

### Critical Blockers (Production Risk Today)

| # | Blocker | Severity |
|---|---------|----------|
| 1 | **Broken `sales_advisors` RLS write policy** — role values `'admin','manager','finance_manager','accountant'` do not exist in `profiles.role`. No authenticated user can write to this table. | CRITICAL |
| 2 | **Dual Sales Advisor architecture** — `salesAdvisorService.ts` reads from `employee_module_assignments → employees`. A separate `sales_advisors` table (195 legacy rows) is completely unused by the service layer. | CRITICAL |
| 3 | **`dealer_invoices` orphaned** — not linked to `sales_orders` via FK; represents a shadow parallel ledger with no referential integrity. | CRITICAL |
| 4 | **`official_receipts` orphaned** — not linked to `payment_events` or `invoices` via FK; receipt verification has no traceability to the AR ledger. | CRITICAL |
| 5 | **No order detail page** — there is no `/sales/orders/:id` route. Users cannot view a full order record, edit it, or see its history. | CRITICAL |
| 6 | **`salesman_name` string-match fragility** — `salesman_targets` joins to `sales_orders` by free-text `salesman_name` only. Typos silently break performance calculations. | HIGH |
| 7 | **`order_no` has no UNIQUE constraint** in the DB. Duplicate order numbers are silently permitted. | HIGH |
| 8 | **`SalesContext` bulk-loads** all customers, orders, invoices, and targets for the company on every mount. At 10 k+ orders this will cause visible page-load degradation. | HIGH |

### Summary Ratings by Submodule

| Submodule | Route | Readiness | Verdict |
|-----------|-------|-----------|---------|
| Dashboard | `/sales` | 45% | Partial — KPIs exist, conversion/funnel missing |
| Pipeline (Kanban) | `/sales/pipeline` | 55% | Partial — drag works, no filter/detail |
| Sales Orders | `/sales/orders` | 35% | Partial — list works, no detail/edit/filter |
| Customers | `/sales/customers` | 30% | Partial — basic CRUD, hard-delete risk |
| Invoices | `/sales/invoices` | 50% | Partial — AR works, no detail/print/edit |
| Salesman Performance | `/sales/performance` | 40% | Partial — broken name-matching |
| Sales Advisors | `/sales/advisors` | 15% | Not Ready — wrong source, broken RLS |
| Margin Analysis | `/sales/margin` | 45% | Partial — fallback margin, no drill-down |
| Outstanding Collection | `/sales/outstanding` | 45% | Partial — client-side aging, no drill-down |
| Dealer Invoices | `/sales/dealer-invoices` | 20% | Not Ready — orphaned, no order FK |
| Verify OR | `/sales/verify-or` | 20% | Not Ready — orphaned, no invoice FK |

---

## B. Sales Module Map

### B1. Routes

All routes live under a `SalesLayout` (thin Suspense wrapper) that is gated by `withModuleAccess('sales', ...)` at the module level.

```
/sales                  → SalesDashboard           [no role gate]
/sales/pipeline         → DealPipeline              [MANAGER_AND_UP]
/sales/orders           → SalesOrders               [no role gate]
/sales/customers        → Customers                 [no role gate]
/sales/invoices         → Invoices                  [MANAGER_AND_UP]
/sales/performance      → SalesmanPerformance        [no role gate]
/sales/advisors         → SalesAdvisors             [MANAGER_AND_UP]
/sales/margin           → MarginAnalysis            [EXECUTIVE]
/sales/outstanding      → OutstandingCollection     [no role gate]
/sales/dealer-invoices  → DealerInvoices            [MANAGER_AND_UP]
/sales/verify-or        → VerifyOR                  [MANAGER_AND_UP]
```

**Missing routes (no detail pages anywhere):**
- `/sales/orders/:id` — order detail / edit / history
- `/sales/customers/:id` — customer detail / linked orders / documents
- `/sales/invoices/:id` — invoice detail / line items / payment timeline
- `/sales/pipeline/stages` — deal stage management

### B2. Services

| Service File | Purpose |
|---|---|
| `salesOrderCrudService.ts` | CRUD + soft-delete for `sales_orders` |
| `salesPipelineService.ts` | Stage transitions (RPC), pipeline summary |
| `salesDashboardService.ts` | MTD KPI RPC, branch breakdown, monthly trend |
| `salesAdvisorService.ts` | Queries `employee_module_assignments` → `employees` (**wrong source**) |
| `salesTargetService.ts` | CRUD for `salesman_targets` + `computeSalesmanActuals()` |
| `customerService.ts` | CRUD + soft-delete for `customers` |
| `invoiceService.ts` | CRUD for `invoices` + `recordPaymentEvent()` AR RPC |
| `masterDataService.ts` | Manages `dealer_invoices` and `official_receipts` |

### B3. Database Tables (Existing)

| Table | Migration | Notes |
|---|---|---|
| `customers` | 20260416000002 | soft-delete via `is_deleted` |
| `deal_stages` | 20260416000002 | per-company kanban columns |
| `sales_orders` | 20260416000002 | core booking record |
| `invoices` | 20260416000002 | AR invoice, `sales_order_id NOT NULL` FK |
| `salesman_targets` | 20260416000002 | free-text `salesman_name` match only |
| `sales_advisors` | 20260518040000 | 195 legacy rows; write RLS broken |
| `dealer_invoices` | — | orphaned; not FK-linked to `sales_orders` |
| `official_receipts` | — | orphaned; not FK-linked to `payment_events` |
| `payment_events` | — | event-sourced AR ledger for `invoices` |

### B4. Key RPCs

| RPC | Purpose |
|---|---|
| `transition_sales_order_stage` | Audited kanban stage move (SECURITY DEFINER) |
| `get_sales_pipeline_summary` | Per-stage count/value with branch/date filters |
| `get_sales_dashboard_summary` | MTD KPIs, branch breakdown, monthly trend |
| `link_vehicle_to_sales_order` | Links chassis/vehicle to order |
| `unlink_vehicle_from_sales_order` | Unlinks vehicle from order |

---

## C. Module/Submodule GAP Matrix

| Submodule | What Exists | What's Missing | Severity |
|---|---|---|---|
| **SalesDashboard** | MTD orders, revenue, outstanding AR, BG-linked KPIs; monthly bar chart; branch breakdown | Conversion rate, lost-lead rate, pipeline funnel visualization, advisor ranking, model mix breakdown, booking-to-delivery timeline, cancellation rate | MEDIUM |
| **DealPipeline** | Kanban drag-drop with HTML5 API; stage columns from DB; unassigned orders section; RPC-audited stage moves | Date range filter, branch filter, search/filter bar, click-through to order detail, stage management UI (add/edit/reorder stages), WIP limits, bottleneck highlighting | HIGH |
| **SalesOrders** | List table with VSO, model, chassis; Create Order dialog; Link/Unlink Vehicle; Create Invoice CTA | Detail page (`/orders/:id`), Edit Order, Cancel Order flow, order audit history, date range filter, branch filter, salesman filter, status filter, server-side pagination, order document attachments | CRITICAL |
| **Customers** | CRUD dialog with name, phone, email, NRIC; soft-delete (service has `is_deleted`) | Customer detail page (`/customers/:id`), linked orders list, customer type (individual vs corporate), IC/NRIC deduplication enforcement, pagination, status (active/blacklisted), document storage | HIGH |
| **Invoices** | Tabbed (customer/dealer/purchase); AR summary cards; Pay button via event-sourced RPC; pre-fill from order CTA | Invoice detail page, invoice edit, line-item breakdown, tax/SST display, print/PDF export, reconciliation status UI, credit note support, partial payment history timeline | HIGH |
| **Salesman Performance** | Period picker; table with orders, revenue, targets, achievement %; target CRUD | Branch filter, trend sparklines, ranking view, YTD toggle, advisor-level (vs free-text salesman) performance, name-matching defect fix | HIGH |
| **Sales Advisors** | List from `employee_module_assignments`; creates via `createEmployee()` | Fix data source to `sales_advisors` table, edit SA, resign flow with `resign_date`, performance link, branch assignment | CRITICAL |
| **Margin Analysis** | Model-grouped margin; estimated 8% fallback; actual cost from `purchase_invoices` | Per-order drill-down, per-advisor contribution, date range comparison, orders missing invoice warning, margin trend charts | MEDIUM |
| **Outstanding Collection** | Aging buckets (0–30, 31–60, 61–90, 90+); client-side calculated | Per-customer drill-down, collection notes / follow-up tracking, CSV export, branch filter, bulk action (write-off, escalate), due-date aging at DB level | MEDIUM |
| **Dealer Invoices** | CRUD table (invoice no, dealer, model, chassis, price, status) | FK link to `sales_orders`, status-to-order sync, payment tracking, dealer registration | CRITICAL |
| **Verify OR** | CRUD table; Quick Verify sets `status = 'Verified'` | FK link to `payment_events`, verifier audit trail, receipt image viewer, bulk verify, mismatch alert | CRITICAL |

---

## D. Missing Tables and Schema Gaps

### D1. Tables That Must Be Created

| Table | Purpose | Blocking |
|---|---|---|
| `sales_order_status_history` | Immutable audit log of every status/stage change with actor and timestamp | Order audit trail, legal compliance |
| `sales_activities` | Follow-up calls, site visits, notes per order/customer; drives CRM workflow | Pipeline management, lost-lead analysis |
| `loan_applications` | Finance/HP application records per order: lender, amount, status (pending/approved/rejected/disbursed) | Loan status tracking |
| `registration_records` | JPJ/road-tax registration records per order: registration no, expected date, status | Delivery lifecycle completion |
| `insurance_cover_notes` | Cover note / policy per order: insurer, policy no, expiry, premium | Delivery lifecycle completion |
| `sales_cancellation_reasons` | Structured cancellation reason per cancelled order: reason_code, narration, approved_by | Cancellation analytics, refund workflow |
| `sales_documents` | File attachments per order or customer: type, storage path, uploaded_by | Document management |
| `sales_quotations` | (Optional) Pre-booking quote records: model, variant, price, expiry — enables quote-to-order funnel | Quotation conversion analytics |

### D2. Schema Gaps in Existing Tables

| Table | Column | Gap | Fix |
|---|---|---|---|
| `sales_orders` | `order_no` | No `UNIQUE (order_no, company_id)` constraint — duplicate order numbers possible | `ALTER TABLE sales_orders ADD CONSTRAINT uq_order_no_company UNIQUE (order_no, company_id);` |
| `sales_orders` | `customer_id` | Nullable — orders can exist with no customer link | Enforce at application layer or add DB `NOT NULL` after backfill |
| `sales_orders` | `salesman_id` | TypeScript type has `salesmanId?` but DB column does not appear in original migration — no FK to any user/advisor table | Add `salesman_id uuid REFERENCES sales_advisors(id)` |
| `sales_orders` | `status` | Only 6 values: `enquiry/quoted/confirmed/booked/delivered/cancelled`. Missing sub-statuses for loan_status, registration_status, insurance_status | Add sub-status columns or separate status tables |
| `salesman_targets` | `salesman_name` | Free-text, no FK to sales_advisors or employees — breaks performance matching on any name edit | Add `salesman_id uuid REFERENCES sales_advisors(id)`, make `salesman_name` computed |
| `dealer_invoices` | `sales_order_id` | Missing FK to `sales_orders` — completely orphaned | `ALTER TABLE dealer_invoices ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id);` |
| `official_receipts` | `payment_event_id` | Missing FK to `payment_events` — official receipts cannot be reconciled to AR ledger | `ALTER TABLE official_receipts ADD COLUMN payment_event_id uuid REFERENCES payment_events(id);` |
| `invoices` | `subtotal` | Original migration uses `amount` column. Service maps `subtotal → amount` and `totalAmount → total_amount`. The `discountAmount` field exists in the TypeScript type but has no corresponding DB column in the original migration. | Add `discount_amount` column if not present in a later migration |
| `customers` | `customer_type` | No distinction between individual (IC buyer) and corporate (company buyer) | Add `customer_type text CHECK (IN ('individual','corporate'))` |
| `customers` | `ic_no` | No UNIQUE constraint per company — same IC can be inserted multiple times | `ADD CONSTRAINT uq_customer_ic_company UNIQUE (ic_no, company_id) WHERE ic_no IS NOT NULL` |
| `sales_advisors` | `branch_id` | Stores UUID but display in `SalesAdvisors.tsx` shows raw UUID instead of human-readable branch code | Requires JOIN to `branches` table or denormalized `branch_code` column |

### D3. Missing Indexes

| Table | Recommended Index | Reason |
|---|---|---|
| `sales_orders` | `(customer_id, company_id)` | Customer order lookup |
| `sales_orders` | `(status, company_id)` | Status-filtered list views |
| `sales_orders` | `(booking_date DESC, company_id)` | Date-sorted order list |
| `invoices` | `(sales_order_id)` | Invoice lookup per order |
| `payment_events` | `(invoice_id, payment_date DESC)` | Payment timeline per invoice |
| `salesman_targets` | `(salesman_name, company_id, period_year, period_month)` | Performance match (existing partial from upsert conflict target) |

---

## E. Missing Relationships and Integration Gaps

### E1. Broken FK Chains

```
dealer_invoices  ──✗──  sales_orders       (no FK — orphaned records)
official_receipts ──✗── payment_events      (no FK — receipts can't reconcile to AR)
official_receipts ──✗── invoices            (no FK — second path also missing)
salesman_targets  ──✗── sales_advisors      (string match only — no FK)
sales_orders      ──✗── sales_advisors      (salesman_id column absent or unenforced)
```

### E2. Cross-Module Integration Gaps

| Integration | Current State | Gap |
|---|---|---|
| **HRMS → Sales Advisors** | `salesAdvisorService` reads `employee_module_assignments → employees` (HRMS data) to populate the Sales Advisors list | The new `sales_advisors` table (migration 20260518040000) is completely disconnected from the service. Creates a dual-source conflict: HRMS employees ≠ Sales Advisors table |
| **Vehicles → Sales Orders** | `link_vehicle_to_sales_order` RPC exists and works | Vehicle detail page has no back-link to the linked sales order |
| **Invoices → Sales Orders** | `invoices.sales_order_id NOT NULL` enforces the link | No "view invoice" CTA from order detail (order detail page doesn't exist) |
| **Purchase Invoices → Margin** | `fetchChassisCostMap` joins `purchase_invoices` by chassis | If a purchase invoice is missing for a delivered vehicle, the margin falls back silently to estimated 8% with no UI warning |
| **Payment Events → Official Receipts** | `PaymentEvent.officialReceiptId` field exists in the TypeScript type | `official_receipts` table has no `payment_event_id` FK going the other way — unidirectional orphaned |
| **Sales Orders → Loan/Registration** | No tables exist for loan applications or registration records | No way to track financing or JPJ status within the Sales module |

---

## F. Workflow and Business-Logic Gaps

### F1. Booking Lifecycle — Incomplete State Machine

The current `SalesOrderStatus` enum covers only 6 states:

```
enquiry → quoted → confirmed → booked → delivered → cancelled
```

A real automotive dealership booking lifecycle requires sub-statuses and parallel tracks:

```
enquiry
  └→ quoted
       └→ confirmed (deposit paid)
            ├→ [loan_status: pending → approved → disbursed → rejected]
            ├→ [insurance_status: pending → cover_note_issued → policy_active]
            ├→ [registration_status: pending → submitted → registered → plate_received]
            └→ booked (all tracks green)
                 └→ delivered
                      └→ [post_delivery: pending_documents → completed]
  └→ lost (new status needed for dropped enquiries — currently no way to mark an order as lost without cancellation)
  └→ cancelled (needs cancellation_reason FK)
```

**Missing:** `lost` status, sub-status columns (`loan_status`, `insurance_status`, `registration_status`), `cancellation_reason_id` FK.

### F2. No Cancellation Workflow

Cancelling an order currently sets `status = 'cancelled'` via direct update. There is no:
- Structured reason capture (`cancellation_reason_id` + free-text `narration`)
- Approval workflow for cancellations (director sign-off)
- Automatic refund/deposit-recovery tracking
- Analytics on cancellation rate by salesman/model/branch

### F3. No Follow-Up / CRM Activities Tracking

The pipeline shows orders in kanban columns but there is no:
- Activity log per order (call logged, visit scheduled, test drive done)
- Next follow-up date / reminder
- Time-in-stage tracking (how long has an order been in "quoted"?)
- Lead aging alerts

### F4. `computeSalesmanActuals()` — Broken by Design

The function in `salesTargetService.ts` joins `salesman_targets` to `sales_orders` purely by `salesman_name` string equality (after `trim()`). Any of the following silently breaks the join:
- Salesman name changed in the order after creation
- Different casing (`"Ahmad Bin Ali"` vs `"ahmad bin ali"`)
- Nickname vs full name mismatch
- Salesman re-assigned orders across name spellings

**Fix required:** migrate `salesman_targets` to use `salesman_id uuid` FK.

### F5. Invoice Creation — No Order Status Guard

`SalesOrders.tsx` shows the "Create Invoice" CTA only when `status === 'booked' || status === 'delivered'`. However:
- The DB has no trigger enforcing this — an invoice could be inserted by anyone with a direct DB write (or API call) regardless of order status.
- There is no check preventing two invoices from being created for the same order (the `invoices` table has `UNIQUE (invoice_no, company_id)` but not `UNIQUE (sales_order_id, invoice_type)`).

### F6. No Margin Fallback Warning

`MarginAnalysis.tsx` uses an estimated 8% margin when no purchase invoice is linked. This silent fallback produces misleading margin totals if a significant portion of delivered vehicles have no corresponding purchase invoice.

### F7. SalesContext Performance Time-Bomb

`SalesContext.tsx` fetches **all** customers, orders, invoices, and targets for the company at mount time. With a growing dealership:
- 5 k orders × 12 months = 60 k rows
- Full `invoices` table load is used for client-side AR aging calculations
- No pagination, no date-range scope, no reactive slice

This will cause visible load degradation and is architecturally incompatible with the Supabase free-tier row-count limits in a multi-branch company.

---

## G. UI/UX and Information Hierarchy Gaps

### G1. Missing Detail Pages (Universal Gap)

Every entity in the Sales module lacks a detail/profile page:

| Entity | Missing Route | Impact |
|---|---|---|
| Sales Order | `/sales/orders/:id` | Cannot view full order, edit, add notes, see history |
| Customer | `/sales/customers/:id` | Cannot see customer's order history, documents, contact log |
| Invoice | `/sales/invoices/:id` | Cannot see payment timeline, line items, credit notes |

### G2. No Editing on Order Table

`SalesOrders.tsx` provides only: Create, Link Vehicle, Unlink Vehicle, Create Invoice. There is no "Edit Order" action on any row. To change a booking detail (e.g., correcting a model code or variant, updating bank name), there is no UI path.

### G3. Filtering and Pagination Absent

| Page | Missing Filters | Impact |
|---|---|---|
| SalesOrders | Date range, branch, salesman, status | Users scroll through all orders |
| Customers | Name search, branch | Users scroll through all customers |
| OutstandingCollection | Branch filter, customer search | No way to drill to a specific customer |
| DealPipeline | Date range, branch, salesman, model | Kanban shows all open orders |
| SalesmanPerformance | Branch filter | Cannot isolate a single branch's team |

All list views load data through `SalesContext` (no server-side pagination). The order table, customer table, and invoice table all render every record in the company with no virtual scrolling.

### G4. Branch Display Issue in Sales Advisors

`SalesAdvisors.tsx` renders `branch_id` (a raw UUID) in the Branch column because `sales_advisors.branch_id` is never joined to the `branches` table. Users see: `"3f8d22e1-…"` instead of `"KCH"`.

### G5. No Export from Any Sales Page

There is no CSV/Excel/PDF export on:
- Sales Orders table
- Outstanding Collection
- Salesman Performance
- Margin Analysis
- Invoices list

### G6. No Print / PDF Generation

The Invoices page has no print layout. There is no `InvoicePDF` component. Users cannot generate a customer-facing invoice PDF from the system.

### G7. Breadcrumb / Back-Navigation Absent

The `SalesLayout` is a thin Suspense wrapper — no breadcrumbs, no back navigation, no secondary sidebar. Users have no visual context of where they are in the module hierarchy.

### G8. Empty-State Design Missing

Most list pages (SalesOrders, Customers, DealPipeline) do not have meaningful empty-state illustrations or call-to-action prompts when data is empty (new company with no orders yet).

### G9. Dashboard Conversion Funnel Missing

The `SalesDashboard` shows only 4 static KPI tiles. There is no:
- Booking funnel (enquiry → quoted → confirmed → delivered)
- Conversion rate percentage
- Lost / cancelled breakdown
- Top-performing salesman card
- Model sales mix chart

---

## H. Permission/RLS Gaps

### H1. Critical: `sales_advisors` Write Policy Broken

```sql
-- CURRENT (BROKEN):
CREATE POLICY "sales_advisors_write" ON public.sales_advisors
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','manager','finance_manager','accountant')
    )
  );
```

The role values `'admin'`, `'manager'`, `'finance_manager'`, `'accountant'` do **not** exist in the `profiles.role` column. Valid role values are: `super_admin`, `company_admin`, `director`, `general_manager`, `manager`, `sales`, `accounts`, `analyst`, `creator_updater`.

**Impact:** No authenticated user can insert, update, or delete from `sales_advisors`. The table is read-only for all users.

**Fix required:**
```sql
DROP POLICY "sales_advisors_write" ON public.sales_advisors;
CREATE POLICY "sales_advisors_write" ON public.sales_advisors
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','company_admin','director','general_manager','manager')
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','company_admin','director','general_manager','manager')
    )
  );
```

### H2. `sales_orders` SELECT — Scope Too Broad for `sales` Role

```sql
CREATE POLICY "sales_orders_select" ON sales_orders
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );
```

A user with `role = 'sales'` can see ALL orders for their company, including orders created by other salesmen. A dealership typically requires salesmen to see only their own orders (or their branch's orders).

**Gap:** No salesman-scoped row filter. The route has no `roles` guard, so any authenticated user with module access can view all orders.

### H3. `sales_orders` Route Gating — Inconsistent

| Route | Role Gate | RLS Protection |
|---|---|---|
| `/sales` (Dashboard) | None | RLS: company-scoped |
| `/sales/orders` | None | RLS: company-scoped (no salesman filter) |
| `/sales/customers` | None | RLS: company-scoped |
| `/sales/performance` | None | RLS: company-scoped |
| `/sales/pipeline` | MANAGER_AND_UP | RLS: company-scoped |
| `/sales/invoices` | MANAGER_AND_UP | RLS: company-scoped |
| `/sales/margin` | EXECUTIVE | RLS: company-scoped |

Performance and financial data (salesman targets, margin, outstanding) should require at minimum `MANAGER_AND_UP` gating. The current setup allows `sales` role users to see the Performance page and possibly revenue-sensitive data.

### H4. `sales_orders` DELETE Policy — Insufficient Protection

```sql
CREATE POLICY "sales_orders_delete" ON sales_orders
  FOR DELETE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );
```

This allows hard-delete of sales orders by any `manager`-level user. Given that orders are financial records, hard-delete should be prohibited at the DB level — only soft-delete (`is_deleted = true`) should be permitted.

### H5. `invoices` — No Role Restriction on INSERT

```sql
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
```

Any authenticated user (including `sales` role) can directly insert invoices. Invoice creation should be restricted to at least `MANAGER_AND_UP` at the RLS level.

### H6. `invoices` — No Role Restriction on UPDATE

```sql
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
```

Same issue — any company member can update an invoice record. This is a financial data integrity risk.

### H7. Missing RLS on Future Required Tables

The following tables, which must be created per Section D, will require RLS policies:
- `sales_order_status_history` — INSERT allowed for all roles, DELETE never, SELECT company-scoped
- `sales_activities` — CRUD for sales role (own activities), read for managers
- `loan_applications`, `registration_records`, `insurance_cover_notes` — manager-gated writes
- `sales_cancellation_reasons` — director-gated approval writes
- `sales_documents` — creator-owns, manager can read all

---

## I. Recommended Improvement Plan

### Phase 0 — Critical Fixes (Do Now, Zero New Features)

> Timeline estimate: 1–2 engineer-days. No schema migrations required except the RLS fix and two ALTER TABLE statements.

| Task | Type | File(s) |
|---|---|---|
| Fix `sales_advisors` write RLS policy (Section H1) | Migration | New migration file |
| Add `UNIQUE (order_no, company_id)` constraint to `sales_orders` | Migration | New migration file |
| Add `UNIQUE (sales_order_id, invoice_type)` constraint to `invoices` (prevent double-invoice) | Migration | New migration file |
| Fix `SalesAdvisors.tsx` branch display — JOIN to `branches` table or resolve `branch_code` | Service + UI | `salesAdvisorService.ts`, `SalesAdvisors.tsx` |
| Add `NOT NULL` guard to `sales_orders.customer_id` at application layer (make `customerId` required in the create form) | UI + Service | `salesOrderCrudService.ts`, `SalesOrders.tsx` |
| Restrict `/sales/performance` route to at least `MANAGER_AND_UP` | Route guard | `src/main.tsx` |

### Phase 1 — Data Model: Missing Tables and FKs

> Timeline estimate: 3–5 engineer-days. All migrations. No UI yet.

| Task | Type |
|---|---|
| Create `sales_order_status_history` (id, order_id FK, from_status, to_status, changed_by FK, changed_at, notes) | Migration |
| Create `sales_activities` (id, order_id FK, customer_id FK, activity_type, subject, notes, due_date, completed_at, created_by FK, company_id) | Migration |
| Create `loan_applications` (id, order_id FK, lender, applied_amount, approved_amount, status, applied_date, approved_date, disbursed_date, company_id) | Migration |
| Create `registration_records` (id, order_id FK, jpj_ref, plate_no, submitted_date, registered_date, status, company_id) | Migration |
| Create `insurance_cover_notes` (id, order_id FK, insurer, policy_no, cover_note_no, premium, start_date, expiry_date, status, company_id) | Migration |
| Create `sales_cancellation_reasons` (id, order_id FK, reason_code, narration, approved_by FK, approved_at, company_id) | Migration |
| Add `salesman_id uuid REFERENCES sales_advisors(id)` to `sales_orders` | Migration |
| Add `salesman_id uuid REFERENCES sales_advisors(id)` to `salesman_targets` | Migration |
| Add `sales_order_id uuid REFERENCES sales_orders(id)` to `dealer_invoices` | Migration |
| Add `payment_event_id uuid REFERENCES payment_events(id)` to `official_receipts` | Migration |
| Add `discount_amount numeric(12,2)` to `invoices` if not already present | Migration |
| Add `customer_type text CHECK IN ('individual','corporate')` to `customers` | Migration |
| Create trigger to insert into `sales_order_status_history` on `sales_orders.status` UPDATE | Migration |
| Write RLS policies for all new tables | Migration |
| Update `computeSalesmanActuals()` to join by `salesman_id` when available, fall back to name | `salesTargetService.ts` |
| Update `salesAdvisorService.ts` to read from `sales_advisors` table instead of `employee_module_assignments` | `salesAdvisorService.ts` |

### Phase 2 — Lifecycle: Sub-Status and Order State Machine

> Timeline estimate: 3–4 engineer-days.

| Task | Type |
|---|---|
| Add `sales_order_sub_status` columns: `loan_status`, `registration_status`, `insurance_status` with enum CHECK constraints | Migration |
| Add `lost` value to `SalesOrderStatus` enum and `sales_orders.status` CHECK constraint | Migration |
| Add `cancellation_reason_id uuid REFERENCES sales_cancellation_reasons(id)` to `sales_orders` | Migration |
| Build Order Detail page (`/sales/orders/:id`) with status history timeline, sub-status panels, linked invoice, linked vehicle | New page |
| Build Edit Order dialog/page with field-level permissions | New component |
| Build Cancel Order flow with reason capture and approval routing for directors | New workflow |
| Add activity log panel to Order Detail page | New component |
| Add follow-up date + next action field to `sales_activities` service and UI | New feature |

### Phase 3 — Dashboard and Reporting Improvements

> Timeline estimate: 2–3 engineer-days.

| Task | Type |
|---|---|
| Add booking funnel chart (enquiry → quoted → confirmed → delivered) to SalesDashboard | UI |
| Add conversion rate and cancellation rate KPI tiles | UI |
| Add top-performing salesman card by MTD revenue | UI |
| Add model sales mix donut chart | UI |
| Add trend line comparison (current month vs prior month) to branch breakdown | UI |
| Add salesman ranking view to SalesmanPerformance | UI |
| Add branch filter to SalesmanPerformance | UI |
| Add YTD toggle to SalesmanPerformance | UI |
| Add per-order drill-down to MarginAnalysis | UI |
| Add "no invoice linked" warning to MarginAnalysis | UI |
| Add branch filter to OutstandingCollection | UI |
| Add CSV export to OutstandingCollection, SalesmanPerformance, MarginAnalysis, SalesOrders | UI |

### Phase 4 — UI/UX: Detail Pages, Filtering, Pagination

> Timeline estimate: 5–7 engineer-days.

| Task | Type |
|---|---|
| Build Customer Detail page (`/sales/customers/:id`): contact info, order history, document list | New page |
| Build Invoice Detail page (`/sales/invoices/:id`): line items, payment timeline, reconciliation status | New page |
| Add server-side pagination to SalesOrders table (React Query `useInfiniteQuery` or page-number approach) | Refactor |
| Add date range filter, branch filter, salesman filter, status filter to SalesOrders | UI |
| Add name/phone search and pagination to Customers | UI |
| Add search and date filter to DealPipeline kanban | UI |
| Add Deal Stage management UI (create/edit/reorder stages) | New page/dialog |
| Add invoice print/PDF export (headless print layout or react-pdf) | New feature |
| Add breadcrumb navigation to all Sales pages | UI |
| Add meaningful empty-state illustrations to all list pages | UI |
| Refactor `SalesContext` to use scoped, paginated queries rather than full-company bulk load | Architecture |

### Phase 5 — RLS Hardening

> Timeline estimate: 2 engineer-days.

| Task | Type |
|---|---|
| Add `sales` role row-level scoping to `sales_orders` SELECT (own orders only, or branch-scoped) | Migration |
| Restrict `invoices` INSERT to `MANAGER_AND_UP` at RLS level | Migration |
| Restrict `invoices` UPDATE to `MANAGER_AND_UP` at RLS level | Migration |
| Replace `sales_orders` DELETE RLS with soft-delete-only enforcement (revoke hard-delete permission entirely) | Migration |
| Add `role IN ('super_admin','company_admin','director','general_manager','manager')` check to `sales_orders` INSERT for review | Migration |
| Add RLS policies for all Phase 1/2 new tables | Migration |
| Validate `access_scope = 'global'` bypass on all Sales tables — ensure it is only used by super_admin | Audit |

### Phase 6 — Testing and QA

> Timeline estimate: 3–4 engineer-days.

| Task | Type |
|---|---|
| E2E Playwright test: full booking lifecycle (create order → link vehicle → create invoice → record payment) | `e2e/` |
| E2E test: order cancellation with reason capture | `e2e/` |
| E2E test: RLS — salesman can only see own orders | `e2e/` |
| Unit test: `computeSalesmanActuals()` name-match edge cases | `vitest` |
| Unit test: `mapOrder()` column alias mapping (`color` → `colour`, `selling_price` → `totalPrice`) | `vitest` |
| Unit test: aging bucket calculation in OutstandingCollection | `vitest` |
| RLS matrix test coverage for all Sales tables | `vitest.rls.config.ts` |
| Load test: SalesContext with 10 k orders (Playwright + Supabase seed) | Performance |

---

## J. Implementation Recommendations

### J1. Resolve the Dual Sales Advisor Architecture First

Before any new features are built, the Sales Advisor data source must be consolidated. The options are:

**Option A (Recommended):** Make `sales_advisors` the authoritative source.
- Fix the `sales_advisors` write RLS (Phase 0).
- Rewrite `salesAdvisorService.ts` to query `sales_advisors` directly.
- Build a one-time migration to populate `sales_advisors` from `employee_module_assignments` for existing records.
- Deprecate the `employee_module_assignments` + `employees` path for Sales Advisor lookups.
- Add `salesman_id` FK on `sales_orders` pointing to `sales_advisors.id`.

**Option B (Higher complexity, avoid):** Merge `sales_advisors` into `employee_module_assignments`.
- This would require HRMS module changes and is out-of-scope for the Sales GAP fix.

### J2. Add the `sales_order_status_history` Table Immediately

This is the most impactful single data model fix. Every status transition currently leaves no audit trail — this is a compliance risk for a dealership where booking contracts are legal documents. The Supabase trigger approach (auto-insert on `UPDATE status`) means zero application-layer changes are required.

### J3. Decouple SalesContext from Bulk Load

Introduce React Query pagination and scope-aware queries:
- Use `useInfiniteQuery` with `booking_date DESC` cursor pagination for `sales_orders`.
- Move AR aging calculation to a DB-level RPC (`get_ar_aging_summary`) instead of client-side computation over all invoices.
- Retain `SalesContext` for lightweight reference data only (deal stages, branch list, advisors).

### J4. Link `dealer_invoices` and `official_receipts` Before Any More Data Is Entered

Every new dealer invoice or official receipt entered before the FK migration is applied will need to be manually reconciled afterward. The migration to add `sales_order_id` and `payment_event_id` FKs (with `NULL` allowed initially for backfill) should be applied as early as possible and backfilled with a data-wrangling script.

### J5. Enforce `invoice_type` Uniqueness Per Order

Add a partial unique index:
```sql
CREATE UNIQUE INDEX uq_invoice_customer_order
  ON invoices (sales_order_id, invoice_type)
  WHERE invoice_type = 'customer_sales' AND is_deleted = false;
```
This prevents double-invoicing a single order without blocking dealer/purchase invoice types.

### J6. Prioritize the Order Detail Page Over All Other UI Work

All other UI improvements (better dashboard, more filters, export) deliver incremental value. The Order Detail page delivers disproportionate value because:
- It unblocks order editing (currently impossible via UI).
- It provides the surface for sub-status tracking (loan, registration, insurance).
- It provides the natural home for order documents, activity logs, and cancellation history.
- It enables navigational coherence from pipeline kanban cards.

### J7. Fix `SalesOrderStatus` Before Any Loan/Registration Feature Is Built

Adding `loan_status`, `registration_status`, and `insurance_status` columns to `sales_orders` requires a migration that changes the data model. Do this as part of Phase 1/2 (before the UI for those features is built) to avoid a second disruptive migration later.

### J8. Do Not Hard-Delete Financial Records

Both `sales_orders` and `invoices` currently permit hard-delete at the DB level (for manager+ role). This is inconsistent with accounting best practices and legal record-keeping requirements. The recommended approach:
- Revoke the `sales_orders_delete` RLS policy entirely.
- Ensure `is_deleted = true` soft-delete is the only available path at both the service layer and DB layer.
- Apply the same pattern to `invoices` (add `is_deleted` column + corresponding policy change).

---

*End of Sales Module GAP Assessment.*
