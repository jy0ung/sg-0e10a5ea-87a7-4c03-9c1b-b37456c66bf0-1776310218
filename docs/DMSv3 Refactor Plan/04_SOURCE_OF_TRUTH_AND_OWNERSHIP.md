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
| Booking / local commercial case | DMS RO/Booking + current Control Tower | Sales / Deal |
| Booking external number | DMS/Booking workbooks | DMS source identifier linked to Deal |
| Customer | DMS + UBS customer records | Sales/CRM canonical Customer |
| Sales Advisor person | DMS SA code + reference roster | HRMS Employee |
| Deal ownership | current Deal/SA reconciliation | Sales relationship to Employee |
| Deposit/receipt | booking money / manual evidence / Accounts | Accounts financial event |
| Financing application | current manual/Control Tower loan fields | Sales Financing |
| LOU | current manual/Control Tower | Sales Financing |
| Vehicle | DMS stock + Master Inventory + UBS vehicles | Inventory |
| Chassis | DMS/Inventory business identifier | Inventory attribute; vehicle_id is internal FK |
| Allocation | DMS allocation status/date/chassis | Inventory/Vehicle assignment, reconciled from DMS |
| Shipment | Auto Aging/DMS evidence | Inventory |
| Outlet receipt | Auto Aging/DMS/Inventory | Inventory |
| Registration workflow | Control Tower + Inventory facts | Sales Fulfilment / Registration |
| Enterprise registration actual | Master Inventory (OUTLET) REG DATE | target canonical Registration/Inventory event |
| Insurance | current Deal sub-workflow/manual evidence | Sales Fulfilment / Insurance |
| Delivery/handover | DMS/Auto Aging/local evidence | Sales Deal delivery event |
| Bank disbursement | DMS/Auto Aging/finance evidence | Financing operational evidence + Accounts reconciliation |
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
- Retail Order evidence
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

## 7. Booking boundary

Booking is the point where a canonical local Deal begins in DMSv3.

A Booking can be created from DMS evidence only through an idempotent owning-domain command.

Required outcomes:

- canonical Customer resolved/created under Customer rules;
- Deal created once;
- Employee-backed Sales Advisor resolved where deterministic;
- DMS Prospect/RO source links recorded;
- applicable workflow policy snapshotted;
- immutable Booking/status event written.

## 8. Inventory boundary

Inventory owns Vehicle state.

Sales may request/record an allocation through an Inventory-owned contract but may not directly edit Vehicle lifecycle state.

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

## 11. Disbursement boundary

Operational bank-disbursement evidence belongs to Financing.

Money received/allocated against the customer receivable belongs to Accounts.

The GL belongs to Finance.

These may be correlated but must not be collapsed into one mutable “Disbursed=true” field.

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
- Booking Date
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
