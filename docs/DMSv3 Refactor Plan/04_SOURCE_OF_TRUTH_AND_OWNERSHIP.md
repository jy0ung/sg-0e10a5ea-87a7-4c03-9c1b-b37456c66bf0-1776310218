# 04 — Source of Truth and Data Ownership

**Status:** AUTHORITATIVE DMSv3 ownership contract  
**Evidence date:** 2026-10-01

## 1. Core principle

A field being visible in several systems does not make all systems co-authoritative.

DMSv3 uses:

**one authoritative owner per business fact + explicit source provenance + reconciliation for upstream evidence.**

## 2. Domain ownership matrix

| Business fact | Current evidence/source | DMSv3 authoritative owner |
|---|---|---|
| Lead | DMS Lead | Proton DMS |
| Prospect | DMS Prospect | Proton DMS |
| Prospect rating/status | DMS + approved mapping layer | DMS evidence; approved mapping in Integration/Sales |
| Prospect follow-up | DMS fields + local notes | Sales CRM local workflow |
| FLC Booking / local commercial case | local workflow + Prospect/Customer evidence | Sales / Deal |
| Official Proton Booking / Retail Order | Master RO / Proton DMS | Proton source observation linked to Deal |
| Proton Booking No | Master RO / Proton DMS | Proton source identifier linked to Deal |
| Official Booking MTD population | Master RO / Proton Retail Orders | Proton source / governed analytics read model |
| Customer | DMS + UBS customer records | Sales/CRM canonical Customer |
| Sales Advisor person | DMS SA code + reference roster | HRMS Employee |
| Deal ownership | current Deal/SA reconciliation | Sales relationship to Employee |
| Deposit/receipt | booking money / manual evidence / Accounts | Accounts financial event |
| Financing application | current manual/Control Tower loan fields | Sales Financing |
| LOU | current manual/Control Tower | Sales Financing |
| Vehicle | DMS stock + Master Inventory + UBS vehicles | Inventory |
| Chassis | DMS/Inventory business identifier | Inventory attribute; vehicle_id is internal FK |
| Stock Request | local Sales/Stock workflow | Inventory / Stock Control command |
| Reservation | local stock-control transaction | Inventory / Stock Control |
| Allocation | local stock-control transaction + DMS allocation evidence | Inventory / Stock Control, reconciled from DMS |
| Reallocation | local stock-control transaction | Inventory / Stock Control |
| Shipment | Auto Aging/DMS evidence | Inventory |
| Outlet receipt | Auto Aging/DMS/Inventory | Inventory |
| Registration workflow | Control Tower + Inventory facts | Sales Fulfilment / Registration |
| Enterprise registration actual | Master Inventory (OUTLET) REG DATE | target canonical Registration/Inventory event |
| Insurance | current Deal sub-workflow/manual evidence | Sales Fulfilment / Insurance |
| Delivery/handover | DMS/Auto Aging/local evidence | Sales Deal delivery event |
| Bank submission / Invoice Submitted | signed VDO + VSO submission evidence | Sales Financing / document workflow |
| Bank disbursement operational evidence | bank/DMS evidence | Sales Financing |
| Verified bank credit / receivable settlement | bank statement + payment evidence | Accounts |
| Customer receivable/payment | invoices/payment_events | Accounts |
| GL posting | journal entries | Finance |
| Commission | Auto Aging/commission tables | Commission domain |
| Employee target | salesman_targets Employee identity | Sales target contract |
| Approval | approval_instances/decisions | Workflow |
| Audit | audit_logs + domain event history | owning domain + Platform Audit |

## 3. Source-system hierarchy

### Proton DMS

Authoritative for upstream Proton/HQ facts and external IDs.

Examples:

- Lead
- Prospect
- official Retail Order / Booking evidence
- source status codes
- upstream customer references
- stock/allocation evidence
- deliveries
- collections snapshots
- SOA snapshots
- DMS master/reference values.

DMS raw payloads land in dms_raw_* staging.

Authenticated browser users do not directly write DMS raw staging.

### UBS

Authoritative for:

- local FLC commercial workflow;
- local follow-up;
- Deal state;
- Employee-backed responsibility;
- approvals;
- local exception handling;
- Accounts settlement;
- Finance journals;
- management analytics/read models;
- audit and FLC-owned business decisions.

### Legacy fookloi.net

Historical/backfill evidence only.

It must not become a new operational authority.

### Google Sheets

Current operational/governance evidence and migration source.

The live workbooks document valuable FLC rules and current workflow, but in the DMSv3 target they are **not a fallback authority**.

During migration they may be read for:

- approved baselines;
- current rules;
- manual workflow history;
- reconciliation;
- acceptance evidence.

After cutover, new workflow truth should live in the owning UBS/DMS domain.

## 4. Current DMS normalizer authority pattern

The repository already contains normalizer_column_authority.

This is an important pattern to preserve:

- authority: dms
- authority: ubs_local
- authority: ubs_plus_dms

with overwrite rules such as:

- always
- if_null
- if_null_or_older
- never
- conflict_review.

### Examples already encoded

DMS-owned or upstream identifiers:

- DMS Sales Order IDs
- DMS Customer IDs
- DMS Vehicle Stock IDs
- DMS sync timestamp.

UBS-local / never overwrite examples:

- local notes
- Vehicle LOU
- OBR
- manual stage override
- commission paid state.

Conflict-review examples:

- BG date
- full-payment date.

This pattern should be extended to DMSv3 events/relationships rather than replaced by direct “last writer wins.”

### Bounded legacy Sales Order write precondition (2026-10-02)

`normalize_dms_sales_order(uuid)` remains a service-only staged raw-DMS→legacy-SO
operation. Exactly one approved (`accepted`/`auto_matched`) decision must match
company, raw UUID, source system `dms`, object kind `sales_order` and table
`dms_raw_sales_orders`. Other object/source evidence cannot authorize the write.
Multiple core decisions fail 21000, even if one has a malformed declaration;
zero fails 42501. The sole canonical table must be `sales_orders`, with legacy
NULL/NULL unresolved evidence allowed; other shapes fail 22023.

Explicit UUID must be own-company and locally nondeleted (P0002 otherwise,
without fallback). Otherwise use one nonblank exact external-ID candidate, then
one nonblank exact text candidate: ambiguity fails 21000 and genuine absence
returns the existing unmatched JSON without writes. Original nonblank strings
are compared literally. All checks precede canonical/backlink/decision/event
writes; column authority above is retained. Same-source calls serialize and
existing locked rows are requalified after waits. Arbitrary privileged phantom
inserts/retargets across reconciliation writers are not globally serialized.

[Committed NR/CP evidence](../DMSV3_SALES_ORDER_NORMALIZER_EVIDENCE.md) distinguishes
this protective prerequisite from target Case provenance (§7), full Phase 3B
reconciliation and official Booking eligibility. Local SO soft deletion is a
storage guard; SOT 08 official Proton inclusion/creator/attester policies remain
OPEN. No candidate winner, history repair or new capability is supplied.

## 5. DMS raw → canonical flow

Required flow:

**DMS raw row**
→ deterministic reconciliation candidate
→ accepted/auto-matched relationship
→ owning-domain command/normalizer
→ canonical state/event
→ source backlink / reconciliation event.

A DMS sync must never silently overwrite a conflicting local business decision where the authority matrix says review is required.

## 6. Lead and Prospect boundary

Do not create local canonical Lead/Prospect tables merely to mirror DMS.

Use DMS source identity + local CRM follow-up.

A local Booking/Deal may link to:

- source Lead;
- source Prospect;
- source Retail Order.

The provenance must survive conversion.

## 7. FLC Booking / Proton Retail Order boundary

The local FLC Booking/Case and the official Proton Retail Order are different authorities.

### FLC Booking / Case

Sales owns the local commercial case.

It may be created before Proton creates the official Booking No when genuine purchase intent and sufficient information/documents exist.

Required local-case command outcomes:

- canonical Customer resolved/created under Customer rules;
- Deal/FLC Case created once with immutable UUID;
- Employee-backed Sales Advisor resolved where deterministic;
- Lead/Prospect source links preserved;
- applicable workflow policy snapshotted;
- immutable case/Booking event written.

### Official Proton Retail Order

Proton owns the official Booking/Retail Order fact.

Master RO is the current operational source mirror.

When Proton later creates the Retail Order:

- link it to the existing FLC Case using deterministic evidence;
- preserve Proton Booking No as external business key;
- do not create a duplicate local case;
- ambiguous links enter reconciliation.

Official Booking MTD is computed from the governed Proton Retail Order population, not from the local-case table alone.

## 8. Inventory / Stock Control boundary

Inventory owns Vehicle and stock-control state.

Sales may request stock but may not directly mutate stock authority.

Distinct owned records:

- Stock Request;
- Reservation;
- Reservation Terms;
- Allocation;
- Reallocation / proposal;
- Waiting-for-Stock demand;
- Transfer.

Confirmed baseline:

- one effective Reservation per chassis;
- one active Allocation per chassis;
- Reservation expiry does not auto-release stock;
- authorized management controls Allocation;
- reallocation is explicit and auditable;
- no permanent Vehicle.bookingId is authoritative.

Current Control Tower business rule restricts normal stock linkage until confirmed LOU.

Pre-LOU DMS allocation remains source evidence and a control breach; it must not be deleted or rewritten to make the process look compliant.

## 9. Registration boundary

Current enterprise Registration actual comes from Master Inventory (OUTLET) REG DATE.

DMSv3 must create a canonical Registration event/workflow that reconciles:

- Deal;
- Vehicle;
- DMS/Inventory registration evidence;
- registration number/date;
- actor/source lineage.

The new event/read model becomes the future Registration MTD source after reconciliation proves parity with the current authoritative fact layer.

## 10. Delivery boundary

Delivery is Sales-owned customer handover.

Inventory owns the Vehicle state change/reaction.

The Delivery command should publish a domain event; Inventory/Commission/Analytics react through their own contracts rather than a page updating multiple tables.

## 11. Bank submission / Disbursement boundary

Sales Financing owns operational financing progression, including the financed **Invoice Submitted** milestone based on signed VDO + VSO submission evidence.

Accounts owns recognition of actual money received.

Confirmed Disbursement authority:

- actual bank-statement credit is verified by Accounts;
- Disbursement Date is the actual credit/value date;
- Official Receipt follows confirmed credit according to Accounts rules.

Finance owns the GL.

Financing status, Accounts settlement and Finance posting may be correlated but must not be collapsed into one mutable “Disbursed=true” field.

## 12. Deposit boundary

Booking deposit is optional.

The Deal may display net deposit balance, but actual money movement is Accounts-owned.

Target behavior:

- Sales initiates/associates the business context;
- Accounts records immutable receipt/refund/application;
- Deal read model derives deposit status;
- Finance posts through Finance contracts.

## 13. Employee boundary

HRMS owns Employee.

Sales stores Employee FK for responsibility/attribution.

DMS SA code, legacy sales_advisors IDs and names are reconciliation/display evidence.

Never use a unique-looking name as a cross-domain FK.

## 14. Current spreadsheet manual/system split

Current workbook governance distinguishes:

### Staff-owned/manual workflow

Loan/status/reason/bank/LOU dates/follow-up/owner/allocation type and related remarks.

### DMS/system projection

Booking and source-system facts refreshed by Booking No.

DMSv3 should map this distinction into explicit column/event authority, not copy the spreadsheet mechanism literally.

## 15. Business date versus created_at

For every important event preserve:

- occurred/business date;
- source-fetched date where relevant;
- record created_at;
- actor/source.

Examples:

- Prospect Created At
- FLC Case Created At
- official Proton Booking/Retail Order Date
- Loan Submitted At
- LOU Approved At
- Allocation At
- Registration Date
- Delivery At
- Disbursement At.

Analytics must use the correct business event date.

## 16. Canonical analytics rule

Analytics never writes back into operational truth.

Canonical read models may combine:

- DMS source evidence;
- Deal;
- Employee;
- Vehicle;
- Registration;
- Accounts;
- Finance;
- Commission

using stable IDs and explicit reconciliation relationships.

No report should manufacture identity by joining names.

## 17. Source freshness model

Each domain/source carries independent freshness evidence.

Target examples:

- latest DMS Lead/Prospect sync;
- latest DMS Retail Order sync;
- latest allocation sync;
- Inventory publisher/update;
- staff local workflow update;
- Accounts settlement state;
- Finance posting state.

Management health can aggregate these, but the underlying source-specific timestamps/statuses must remain visible.

## 18. Read sharing versus write ownership

Read access does not transfer ownership.

Examples:

- Sales can read Vehicle readiness; it does not edit Inventory state.
- Sales can read payment state; it does not mutate Accounts ledger.
- Commission can read Delivery/Disbursement facts; it does not edit Sales/Finance.
- Analytics can read everything authorized; it never becomes transactional authority.

## 19. RLS

Every canonical new table must carry company scope and enforce tenant/data scope server-side.

Routes are UX.

RLS + domain command authorization are authoritative.

Global/admin scope must not silently bypass business-state invariants.

## 20. Reconciliation principle

When source systems disagree:

- preserve both evidence values;
- classify authority by field/event;
- auto-apply only deterministic allowed cases;
- put conflicts into review;
- record reviewer decision;
- never hide disagreement by overwriting the weaker source.

This is the required approach for DMSv3 cutover.


## 21. Read-model-only legacy classifications

The following are not independent owners:

- S1/S2/S3;
- Focus Register labels;
- sequential dashboard lifecycle labels;
- legacy FREE STOCK flag;
- Forecast YES/50-50/NO;
- OBR dashboard shorthand.

They may remain reconciliation/reporting inputs during migration, but canonical ownership comes from the underlying source facts and domain transactions.

## 22. Stock terminology ownership

For DMSv3:

- ON_HANDS comes from physical receipt evidence.
- OBR is a derived allocated-before-receipt projection.
- Free / Reserved / Allocated are derived from stock-control transactions.
- D2D means external-dealer transfer/evidence boundary, not Door-to-Door delivery.

## 23. Historical technical architecture

The 2026-09-16 PRD's old Fastify/Prisma repository is business/product evidence only.

Current UBS technical architecture remains authoritative for implementation.

Do not use the historical repo as a write-path or persistence authority.
