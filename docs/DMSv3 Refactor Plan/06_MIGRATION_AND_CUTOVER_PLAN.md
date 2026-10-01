# 06 — Migration and Cutover Plan

**Status:** TARGET DMSv3 execution contract  
**Baseline:** main@e0c2da3 reviewed 2026-10-01

DMSv3 is a convergence programme, not a rewrite. Existing evidence and working domain foundations are retained until the replacement is proven.

## 1. Non-negotiable migration rules

1. No big-bang table replacement.
2. No production mutation merely to test a theory.
3. Add canonical relationships/events first.
4. Preserve upstream IDs and legacy source lineage.
5. Reconcile before repointing callers.
6. Repoint callers before retiring compatibility fields.
7. Keep rollback/read compatibility until exit evidence exists.
8. No name-based identity migration.
9. No chassis-text-only canonical relationship where vehicle_id exists.
10. No metric definition changes hidden inside technical migrations.
11. Historical snapshots stay historical.
12. DMS/Inventory source conflicts remain visible until resolved.
13. Existing Accounts/Finance immutable-ledger controls are preserved.

## 2. Phase 0 — SOT and baseline freeze

Deliverables:

- this DMSv3 SOT folder;
- current workflow and KPI definitions;
- current business-rule thresholds;
- current source-ownership map;
- target schema contract;
- open-policy list;
- evidence register.

Create an explicit baseline report before any lifecycle mutation work:

- current DMS Lead count;
- current DMS Prospect count;
- current Booked Prospect cohorts;
- current Booking Register population;
- current open lifecycle partition;
- current monthly Booking MTD;
- current LOU opening and current LOU events;
- current Registration actual;
- current Delivery/Disbursement evidence;
- current source/canonical/report parity;
- unresolved SA identity cases;
- unresolved RO↔Inventory cases;
- current KPI snapshot definitions.

## 3. Phase 1 — Current-behavior regression harness

Before changing the model, automate the governed rules that should remain true.

Minimum disposable/live tests:

### Prospect

- DMS Lead/Prospect read-only source boundary;
- Prospect rating mappings;
- Hot/Warm/Cold SLA bands;
- booked classification based on Booking evidence;
- event/non-event cohort denominator;
- follow-up overdue behavior.

### Booking

- Booking No uniqueness;
- Booking with no deposit remains Booking;
- Booking with deposit remains Booking;
- Booking Date drives Booking daily/MTD events;
- DMS replay does not duplicate Booking.

### Financing/LOU

- Booking→Loan 3-day warning / 4-day max / 5+ overdue;
- LOU 0–1 / 2–3 / 4–7 / 8+ bands;
- controlled financing status/reason normalization.

### Allocation

- DMS allocation evidence recognized;
- Date Stock Requested not treated as Allocation Date;
- post-LOU linkage rule;
- pre-LOU allocation preserved + control-breach flag;
- 3/5-day SLA;
- no SLA when allocation type missing.

### Registration

- 7-day SLA;
- Registration actual reconciles to authoritative Inventory REG DATE;
- Booking projection cannot rewrite actual event.

### Queue/data quality

- one action identity per open Booking;
- date/control breach signals;
- SA identity exception preserved without rewriting outlet;
- source freshness separated by source.

These tests are the safety net for refactoring.

## 4. Phase 2 — Additive schema foundation

Add, without changing existing UI authority yet:

- deal_workflow_state
- deal_status_events
- deal_source_links
- sales_workflow_policies
- deal_workflow_requirements
- domain_outbox_events
- deal_number_sequences.

Also add required indexes, RLS and command-only write boundary.

No current V1 fields are removed.

## 5. Phase 3 — DMS funnel → Booking boundary

Implement the canonical conversion boundary:

**DMS Prospect / Retail Order evidence → canonical Booking/Deal**

Required command behavior:

- authenticated actor;
- company and branch validation;
- canonical Customer resolution;
- Employee-backed SA resolution where deterministic;
- Booking business date;
- Deal number;
- source links to Lead/Prospect/RO;
- policy snapshot;
- workflow state = booking;
- immutable event/audit/outbox;
- idempotency.

Correct the known V1 semantic defect:

- “New without Deposit” must not become Lead.

Do not synthesize a deposit event from missing/ambiguous historic amount data.

## 6. Phase 4 — Financing convergence

Add:

- deal_financing_applications
- deal_financing_events
- deal_financing_disbursements.

Migrate existing deal_loan and governed manual workflow evidence additively.

Reconcile:

- bank;
- submission;
- decision;
- LOU;
- selected financing;
- rejection reason;
- disbursement.

Do not lose multiple-bank attempts by collapsing them into one mutable row if source history exists.

Cut client/direct status writes only after commands + tests are ready.

## 7. Phase 5 — Vehicle allocation and Inventory convergence

Add:

- deal_vehicle_assignments
- vehicle_lifecycle_events as needed.

Reconcile:

- DMS order_vehicle_matches;
- canonical Vehicle;
- current Inventory;
- current Booking/Deal;
- historical chassis evidence.

Required gates:

- deterministic unique Vehicle match;
- ambiguous match goes to review;
- pre-LOU allocation preserved as control breach;
- no name-based SA/ownership inference.

Shipment and outlet receipt migrate out of Deal.stage and into Inventory-owned events/read models.

## 8. Phase 6 — Registration and Insurance

Add/activate V2:

- deal_registrations
- deal_registration_events
- deal_insurance_policies/events.

Reconcile Registration actual against the current authoritative Master Inventory REG DATE layer.

Exit gate:

- monthly/daily Registration actuals match current governed source within explained, approved reconciliation differences;
- no current Registration KPI is repointed early.

## 9. Phase 7 — Delivery

Implement authoritative Delivery readiness + command.

Delivery event must:

- reference canonical Deal and Vehicle;
- validate policy prerequisites;
- preserve actor/date/source;
- update Sales state;
- publish outbox event;
- allow Inventory/Commission/Analytics reactions through owned contracts.

Do not coordinate direct multi-table cross-domain writes from the page.

## 10. Phase 8 — Settlement / Disbursement / Deposit

Add:

- Deal-context deposit events linked to Accounts;
- verified bank-disbursement evidence;
- invoice.deal_id;
- payment_event source linkage.

Reconcile:

- current Booking Money/deposit evidence;
- DMS collections;
- customer invoices;
- official receipts;
- bank disbursement evidence.

Money remains Accounts-owned.

Journal remains Finance-owned.

## 11. Phase 9 — Cancellation and rebooking

Introduce:

- deal_cancellation_reasons
- deal_cancellations
- deal_relationships.

Reconcile historical Cancel/Deleted/Passed/Car Out semantics before mapping.

Do not represent cancellation as generic Completed.

Cancellation workflow must account for:

- deposit resolution;
- Vehicle release;
- financing cancellation;
- approval if policy requires;
- rebooking relationship.

## 12. Phase 10 — Canonical analytics/read models

Build:

- deal_current_state_v
- deal_timeline_v
- sales_funnel_daily_v
- deal_cycle_times_v
- deal_blockers_v.

Repoint KPI surfaces only after parity tests.

### KPI cutover rule

For every metric being migrated, record:

- old source;
- new source;
- old business definition;
- new business definition;
- expected parity;
- intentional definition changes;
- approval date/version.

No dashboard should silently “improve” the formula while claiming continuity.

## 13. Phase 11 — UI/workspace convergence

Replace the overloaded Deal pipeline with a Deal workspace that shows:

- Booking/Customer
- Sales Advisor
- Commercial terms
- Payment/Deposit
- Financing
- Vehicle
- Registration
- Insurance
- Delivery
- Settlement/Disbursement
- Documents
- Activity/Timeline
- Blocker / next action.

The top-level status is a current blocker/phase; milestone history remains separate.

## 14. Phase 12 — compatibility cutover

Only after successful reconciliation:

- new V2 Deals stop writing legacy stage/subworkflow fields;
- old read APIs use compatibility views/adapters where required;
- legacy Sales Order workflow becomes read-only;
- legacy Deal stage caller writes are blocked;
- old mutable lifecycle columns become compatibility-only.

Do not drop columns yet unless a later dedicated retirement PR proves:

- zero active callers;
- historical reconciliation complete;
- rollback plan;
- backup/recovery evidence appropriate to release.

## 15. Required reconciliation packs

### Funnel reconciliation

- DMS Leads
- DMS Prospects
- Lead→Prospect relationships
- Prospect→Booking relationships
- event/campaign cohorts
- SA assignment.

### Booking reconciliation

- Booking No uniqueness
- Booking Date
- Outlet
- Customer
- SA Employee
- model/variant/colour intent
- payment type
- deposit presence (without manufacturing receipt history).

### Financing reconciliation

- current loan status
- submission date
- LOU date
- bank
- rejection reason
- multiple-bank attempt evidence
- selected facility.

### Vehicle reconciliation

- RO/Booking ↔ Vehicle
- chassis
- allocation date
- outlet receipt
- transfer/location
- data-quality conflicts.

### Registration reconciliation

- Deal
- Vehicle
- REG DATE
- registration number/plate
- current authoritative monthly totals.

### Delivery/disbursement reconciliation

- Delivery Date
- Disbursement Date
- Accounts receipt
- current Auto Aging/report values.

## 16. KPI parity gates

Before repointing management dashboards:

### Prospect

- New Prospects
- Booked Prospects
- conversion %
- open/unbooked
- follow-up metrics
- event/campaign metrics
- rating SLA.

### Booking/Control Tower

- Booking MTD
- Pending Loan
- Loan overdue
- Pending LOU
- LOU 4–7
- LOU 8+
- Pending Allocation
- Cash Review
- Pending Registration
- Data/Control Issues
- SA Exceptions
- daily Booking/LOU/Registration events.

### Registration

- current month actual by outlet
- company total
- source reconciliation.

### Vehicle cycle KPIs

Do not retire BG-based metrics until BG semantics are explicitly resolved.

## 17. Daily snapshot cutover

Current historical snapshot rows are immutable evidence.

DMSv3 may replace future snapshot mechanics with event-derived historical queries.

During transition:

- never recalculate old snapshots;
- retain snapshot_type;
- retain source/trust context;
- document the date of canonical switch.

## 18. Source cutover

Current Sheets can remain operational during UAT.

Cutover requires:

- equivalent read model;
- source freshness visibility;
- deterministic DMS sync;
- parity;
- staff workflow replacement;
- role/RLS UAT;
- rollback path.

After cutover, Sheets become reference/archive/report outputs as decided; they must not silently continue as a second writable authority.

## 19. Acceptance criteria for DMSv3 lifecycle convergence

DMSv3 is not complete until:

- Lead and Prospect remain DMS-owned without duplicate UBS lifecycle states;
- every active Booking has one canonical Deal;
- Booking with/without deposit behaves correctly;
- canonical Customer/Employee identity is used;
- financing state is backend-authoritative;
- LOU evidence is preserved;
- vehicle allocation is canonical and deterministic;
- Shipment/Receipt are Inventory-owned;
- Registration actuals reconcile;
- Delivery is authoritative;
- financed Disbursement is distinct from Delivery;
- non-financed path does not fake loan events;
- cancellation is first-class;
- lifecycle commands are server-owned;
- event history supports cycle-time KPIs;
- current management KPIs have parity or approved version changes;
- RLS/tenant tests pass;
- no production mutation was required to prove the design.

## 20. Rollback principle

Every migration phase must be deployable without requiring immediate deletion of V1 data.

Rollback means:

- V1 reads can continue while V2 is disabled;
- source evidence remains untouched;
- V2 events can be audited/ignored if feature disabled;
- no irreversible backfill is required merely to test the slice.

Physical retirement is a later programme decision.
