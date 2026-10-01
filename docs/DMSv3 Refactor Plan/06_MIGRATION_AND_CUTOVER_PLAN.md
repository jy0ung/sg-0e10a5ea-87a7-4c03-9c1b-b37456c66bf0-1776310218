# 06 — Migration and Cutover Plan

**Status:** TARGET DMSv3 execution contract  
**Baseline:** reconstructed business baseline + current UBS main@52d72dae reviewed 2026-10-01

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

Execution checkpoint (2026-10-01): [PR #128](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/pull/128)
implements the bounded Phase 1A Lead/Prospect source/local-follow-up regression
contract. The [source boundary evidence](../DMSV3_PHASE1_SOURCE_BOUNDARY_EVIDENCE.md)
maps LP-01–LP-10 to committed disposable assertions and records validation.
This is a **partial Phase 1 checkpoint**, pending independent review; it does not
complete the programme or the remaining rule/lifecycle acceptance below.
Successful privileged source refresh is covered separately from duplicate staging
rejection; successful worker replay remains separate ingestion work. Route/backend
access convergence, Employee responsibility and FLC Case/source provenance also
remain separate. Same-company note reattachment and `created_at` rewriting are
still possible, so the nominal 24-hour predicate guarantees neither immutable
local history nor a fixed correction window; history-control redesign is deferred.

Minimum disposable/live tests:

### Prospect

- DMS Lead/Prospect read-only source boundary;
- Prospect rating mappings;
- Hot/Warm/Cold SLA bands;
- booked classification based on Booking evidence;
- event/non-event cohort denominator;
- follow-up overdue behavior.

### FLC Booking / Proton Retail Order

- Direct Prospect is valid without a Lead;
- FLC Booking/Case receives immutable local UUID;
- local Case can exist before Proton Booking No;
- Booking with no deposit remains an FLC Booking/Case;
- Booking with deposit remains an FLC Booking/Case;
- official Proton Retail Order can later link deterministically to the existing Case;
- DMS replay does not duplicate the local Case or official Retail Order link;
- official Booking MTD is driven by the governed Master RO / Proton Retail Order population;
- FLC Cases Created MTD, if shown, is a separate metric.

### Financing/LOU

- Booking→Loan 3-day warning / 4-day max / 5+ overdue;
- LOU 0–1 / 2–3 / 4–7 / 8+ bands;
- controlled financing status/reason normalization.

### Stock Request / Reservation / Allocation

- Stock Request alone does not reserve/allocate;
- one effective Reservation per chassis;
- 3/7/3 working-day Reservation term policy;
- expiry does not auto-release;
- extension/pre-emption is explicit;
- one active Allocation per chassis;
- management controls authoritative Allocation;
- reallocation preserves displaced history;
- DMS allocation evidence recognized as source observation;
- Date Stock Requested not treated as Allocation Date;
- current post-LOU workbook linkage rule;
- pre-LOU allocation preserved + control-breach flag;
- Control Tower Allocation SLA 3/5 days remains distinct from Reservation duration;
- no Allocation SLA when allocation type missing.

### Registration

- 7-day current management SLA;
- readiness/Focus does not create Registration;
- actual Registration reconciles to authoritative Inventory REG DATE;
- Booking projection cannot rewrite actual event;
- active Allocation context is validated;
- physical IN_TRANSIT is not automatically a hard gate;
- cancellation after Registration preserves Registration/PRE-REGISTER history.

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

## 5. Phase 3 — DMS funnel → FLC Case → Proton Retail Order reconciliation

Implement **two boundaries**, not one.

### Phase 3A — create the local FLC Booking/Case

**DMS Prospect / Direct Prospect / approved local case initiation → FLC Booking/Case**

Required command behavior:

- authenticated actor;
- company and branch validation;
- canonical Customer resolution;
- Employee-backed SA resolution where deterministic;
- FLC Case business date;
- local Deal/case number;
- source links to Lead/Prospect where present;
- policy snapshot;
- workflow state = booking;
- immutable event/audit/outbox;
- idempotency.

The local Case may exist before Proton Booking No.

Correct the known V1 semantic defect:

- “New without Deposit” must not become Lead.

Do not synthesize a deposit event from missing/ambiguous historic amount data.

### Phase 3B — link the official Proton Retail Order

**Master RO / Proton Retail Order observation → existing FLC Case**

Required behavior:

- preserve source Retail Order ID and Proton Booking No;
- preserve official Proton Booking Date/status evidence;
- deterministically match to the FLC Case;
- duplicate/ambiguous links enter reconciliation;
- replay is idempotent;
- source refresh cannot silently rewrite FLC-owned history.

Exit gate:

- official Booking MTD from the new source projection exactly reconciles to the governed Master RO population by month/outlet;
- local FLC-case count is separately reportable and cannot contaminate official Booking MTD.

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

## 7. Phase 5 — Stock Control and Inventory convergence

Add or converge the distinct stock-control records:

- sales_stock_requests
- vehicle_reservations
- vehicle_reservation_terms
- sales_stock_demands / LNS
- vehicle_allocations
- vehicle_reallocation_proposals
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
- one effective Reservation per chassis;
- one active Allocation per chassis;
- 3/7/3 Reservation policy reproduced with versioned working calendar;
- expiry remains review/control, not auto-release;
- management allocation authority enforced server-side;
- reallocation is explicit and auditable;
- no permanent lifetime Vehicle.bookingId;
- pre-LOU DMS allocation preserved as control breach;
- no name-based SA/ownership inference.

Shipment and outlet receipt migrate out of Deal.stage and into Inventory-owned events/read models.

## 8. Phase 6 — Registration preparation, actual Registration and Insurance

Add/activate V2:

- financing-disposition versioning/current selection;
- Registration prerequisite history;
- EHAK event history;
- derived blockers/eligibility/readiness;
- narrowly scoped canonical override history;
- Registration readiness policy versions;
- manager forecast/history where retained;
- deal_registrations + immutable registration versions/events;
- deal_insurance_policies/events.

Migration/reconciliation must preserve the distinction:

**preparation/readiness/forecast ≠ actual Registration**

Target rules:

- financed path uses selected/current approved financing + current LOU context;
- Cash uses confirmed cash credit and no fake EHAK/LOU;
- active Allocation links Deal↔Vehicle;
- Agreement/SOLA/Special Plate/EHAK evidence remains explicit;
- UNKNOWN coverage fails closed;
- actual Registration command re-derives facts under lock;
- physical IN_TRANSIT/ON_HANDS is not automatically a hard gate;
- post-Registration cancellation preserves PRE-REGISTER/sequential-case history.

Reconcile Registration actual against the current authoritative Master Inventory REG DATE layer.

Exit gate:

- monthly/daily Registration actuals match current governed source within explained, approved reconciliation differences;
- Registration readiness/forecast populations never count as actual;
- no current Registration KPI is repointed early.

## 9. Phase 7 — Delivery

Implement authoritative Delivery readiness + command.

Delivery event must:

- reference canonical Deal and Vehicle;
- mean physical handover of vehicle/keys with signed VDO evidence;
- validate the Accounts-derived customer-payable clearance for the normal path;
- alternatively require the canonical authenticated Director exception with outstanding-balance snapshot;
- validate remaining approved non-financial prerequisites;
- preserve actor/date/source;
- update Sales state;
- publish outbox event;
- allow Inventory/Commission/Analytics reactions through owned contracts.

Do not coordinate direct multi-table cross-domain writes from the page.

## 10. Phase 8 — Documents, Invoice Submission, Settlement / Disbursement / Deposit

Add/converge:

- Deal-context deposit events linked to Accounts;
- VSO/VDO evidence/document identities;
- financed bank-submission / Invoice Submitted event;
- financing-side disbursement report/reference;
- Accounts-owned verified bank-credit event;
- invoice.deal_id;
- payment_event source linkage;
- Official Receipt linkage.

Reconcile:

- current Booking Money/deposit evidence;
- legacy VSO/VDO/Invoice evidence;
- DMS collections;
- customer invoices;
- official receipts;
- bank disbursement evidence.

Financed flow to prove:

**Delivered + signed VDO + VSO → Invoice Submitted → bank credit → Accounts verification → Disbursement**

Cash flow to prove:

- cash credit confirmed before Registration;
- no fictitious bank Invoice Submitted/Disbursement records.

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

### FLC Case / Proton Retail Order reconciliation

- FLC Case UUID uniqueness
- local case-opened business date
- Proton Retail Order source ID
- Proton Booking No uniqueness/reconciliation
- official Proton Booking Date
- official Booking MTD inclusion/exclusion state
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

### Stock/Vehicle reconciliation

- Proton RO / FLC Case ↔ Vehicle
- chassis
- Stock Request/Reservation/Allocation distinctions
- Reservation term/policy
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

### Delivery / Invoice Submission / Disbursement reconciliation

- Delivery Date + signed VDO evidence
- VSO/final Invoice identity
- bank submission / Invoice Submitted
- reported disbursement evidence
- Accounts-verified bank credit/value date
- Official Receipt where applicable
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

- Official Booking MTD from Master RO
- FLC Cases Created MTD if exposed separately
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

### Vehicle / Delivery cycle KPIs

- Free Stock parity must distinguish legacy flag from target derived availability.
- OBR/On Hands populations must be reconciled to later confirmed semantics.
- Pending Delivery / Pending Invoice Submission / Pending Disbursement must reconcile before KPI cutover.
- Disbursed MTD must move to Accounts-verified bank-credit authority.
- Do not retire BG-based metrics until BG semantics are explicitly resolved.

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
- Direct Prospect works without a Lead;
- every FLC Booking/Case has one immutable local Deal identity;
- official Proton Retail Orders reconcile explicitly to FLC Cases;
- official Booking MTD reconciles to Master RO and cannot be polluted by local-case creation;
- Booking with/without deposit behaves correctly;
- canonical Customer/Employee identity is used;
- financing state is backend-authoritative;
- LOU evidence is preserved;
- Stock Request, Reservation and Allocation are separate canonical records;
- 3/7/3 Reservation policy is preserved/versioned;
- allocation/reallocation is canonical, manager-controlled and deterministic;
- Shipment/Receipt are Inventory-owned;
- Registration actuals reconcile and PRE-REGISTER history is preserved;
- Delivery is authoritative with payment-clearance/Director-exception evidence;
- financed Invoice Submitted and Accounts-verified Disbursement are distinct from Delivery;
- Cash credit-before-Registration is enforced;
- non-financed path does not fake loan/bank events;
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


## 21. Historical KPI-guide reconciliation gate

Before replacing legacy Inventory Dashboard reporting, explicitly prove or version the definitions that changed after July 2026:

- legacy Free Stock flag versus derived Free/Reserved/Allocated;
- legacy OBR label versus allocated-before-receipt OBR;
- legacy D2D label versus external-dealer D2D;
- Forecast/Focus labels versus canonical readiness/blockers;
- legacy DISB DATE versus Accounts-verified credit/value date.

Do not claim parity when the business definition intentionally changed. Record a versioned metric transition instead.

## 22. Historical technical baseline rule

The 2026-09-16 PRD's old Fastify/Prisma repo is not a migration target.

Use it only for confirmed product/business rules and historical implementation evidence.

All new DMSv3 implementation lands in the current UBS architecture.
