# 00 — Reconstructed DMSv3 Business Baseline

**Status:** ACTIVE — master business/product baseline for the DMSv3 Sales lifecycle refactor  
**Effective date:** 2026-10-01  
**Current UBS repository baseline:** main@52d72dae23f4d30a1e8fc0d529dabd9c939f8b57  
**Historical baseline incorporated:** FLC Operations Platform PRD v1.1 Established Baseline, 2026-09-16  
**Metric reference incorporated:** FLC Inventory Dashboard KPI Reference Guide v1.0, 2026-07-18

## 1. Purpose

This document reconstructs the current FLC Sales/DMS product baseline from:

- current FLC owner decisions in the FLC Data Analysis project;
- the established 2026-09-16 Operations Platform PRD;
- the July KPI reference;
- the live Master Data and Master Booking & Stock operating contracts;
- historical project artifacts from the August/September clean-sheet DMS work;
- the current UBS repository and the DMSv3 SOT created on 2026-10-01.

It resolves material contradictions instead of preserving competing rules.

## 2. Authority and precedence

For DMSv3 Sales/DMS lifecycle work, use this precedence:

1. **Explicit current FLC owner instruction / dated approved change.**
2. **This reconstructed baseline.**
3. The other files in `docs/DMSv3 Refactor Plan/`.
4. Current UBS programme-wide architecture contracts: domain ownership, identity, RLS, Finance/Accounts authority, workflow and migration safety.
5. Validated current operating contracts in Master Data / Master Booking & Stock.
6. Current repository code/tests as implementation evidence.
7. Historical PRDs, old repos, legacy dashboards, workbook formulas and Apps Script as evidence only where not superseded.

A historical behavior does not become a current business rule because it was implemented.

## 3. Technical-architecture reconciliation

The 2026-09-16 PRD audited a different implementation repository (`flc-dmsv2`) using Fastify/Prisma/PostgreSQL 18.

Those **technical implementation details are historical** for the current UBS programme.

Do not migrate DMSv3 back to that stack.

The current UBS repository remains the technical execution baseline, including:

- React/Vite application architecture;
- Supabase/PostgreSQL persistence and RLS;
- Employee/Profile identity separation;
- domain-owned RPC/service boundaries;
- canonical Workflow runtime;
- Accounts-owned settlement;
- Finance-owned journals;
- additive migrations and compatibility-first cutover.

What is carried forward from the historical PRD is the **confirmed business model, source ownership, workflow policy and integrity principles**.

## 4. Reconstructed end-to-end business model

The complete commercial and physical journey is:

**Lead or Direct Prospect**
→ **FLC Booking / Case**
→ **Official Proton Retail Order / Booking**
→ **Financing / LOU where applicable**
→ **Stock Request / Matching**
→ **Reservation**
→ **Allocation**
→ **Transfer if required**
→ **Registration**
→ **Delivery**
→ **Invoice Submitted to bank for financed cases**
→ **Disbursement / Settlement**
→ **Completed**

The lifecycle dimensions remain independent.

A summary/status/read-model may tell management the current blocker, but it must never replace the underlying facts.

## 5. Lead and Prospect

### 5.1 Lead is optional

A Prospect may originate from a Lead or may be a Direct Prospect.

Do not require every Prospect to have a Lead.

### 5.2 Upstream ownership

Lead and Prospect source facts are Proton/DMS-owned.

UBS owns:

- local follow-up;
- next actions;
- local notes;
- FLC ownership/assignment workflow;
- reconciliation;
- analytics.

UBS does not create a competing copy of the DMS source status.

## 6. Two distinct Booking concepts

This distinction is mandatory.

### 6.1 FLC Booking / Case

An FLC Booking/Case:

- is the local commercial case;
- receives an immutable internal UUID;
- may be created once genuine purchase intent and sufficient information/documents exist;
- may exist **before** Proton creates an official Booking No;
- does **not** require a deposit.

Deposit/payment readiness is a separate dimension.

### 6.2 Official Proton Booking / Retail Order

The official Proton Booking:

- is created in Proton DMS;
- carries the official Proton Booking No;
- is currently mirrored operationally by Master RO / the Proton Retail Order feed;
- is reconciled to the FLC Booking/Case.

### 6.3 Booking MTD

The governed metric called **Booking MTD** is the official Proton Retail Order population for the governed month.

Therefore:

**Booking MTD ≠ count of locally created FLC cases.**

If management needs the local-case metric, expose a separate metric such as:

**FLC Cases Created MTD**

with a distinct KPI key and denominator.

## 7. Booking identity

- FLC Booking UUID = permanent technical identity.
- Proton Booking No = official Proton business identifier; nullable before Proton creation.
- Booking No must never be replaced by spreadsheet row position.
- One customer may legitimately have multiple Bookings.
- Customer name is never Booking identity.
- DMS replay must not create duplicate FLC cases or duplicate Proton links.

## 8. Deposit

Confirmed:

- FLC Booking may exist with deposit or without deposit.
- Deposit does not decide whether a case is a Booking.
- “New without Deposit → Lead” is invalid for DMSv3.

Money movement belongs to Accounts-owned immutable payment/receipt events.

## 9. Financing / LOU

A financed Booking may have multiple loan applications.

Each application preserves:

- institution;
- submission;
- requested/approved amount;
- decision;
- rejection reason;
- evidence;
- LOU context;
- dates.

LOU/offer-letter evidence is versioned separately from the Loan Application.

The selected downstream financing disposition is explicit and versioned.

For a financed path, downstream selection binds to the selected approved application and its current LOU context. Every approved application is **not** automatically selected.

If requirements/selection change materially, stale financing/LOU evidence fails closed rather than being auto-reselected.

Cash/non-loan cases use an explicit Cash disposition and must not traverse fictitious Loan/LOU states.

LOU remains an important financing milestone, not a top-level Deal truth duplicated elsewhere.

## 10. Business calendar

Working-day policy:

- Monday–Friday: 08:00–17:00;
- Saturday: 08:00–13:00;
- Sunday: non-working;
- Sabah public holidays: non-working and configurable.

Historical SLA results must retain the policy/calendar version required for reproducibility.

## 11. Stock request, reservation and allocation

These are distinct concepts.

### Stock Request

A Sales Advisor/authorized user may request stock.

A request itself does not reserve or allocate a chassis.

### Reservation

A temporary stock-control hold.

Confirmed baseline:

- at most one effective reservation per chassis;
- current default terms:
  - 3 working days with no loan/LOU context;
  - 7 working days while LOU is pending;
  - 3 working days after approved LOU;
- terms are versioned and snapshotted;
- expiry is a review/control point, **not automatic release**;
- authorized management may extend;
- pre-emption must be explicit and auditable.

### Allocation

Authoritative customer control of a specific chassis.

Confirmed baseline:

- advisory stock intelligence, Stock Request and temporary Reservation may exist before LOU according to the 3/7/3 policy;
- for a financed case, **normal authoritative Allocation follows the selected/current approved financing + current LOU context**;
- a pre-LOU DMS allocation observation is preserved but treated as a control exception rather than rewritten;
- Sales Advisor may request;
- authorized management controls allocation;
- one active allocation per chassis;
- reservation and allocation are not the same record;
- reallocation is explicit and auditable;
- displaced Booking outcome/history is preserved;
- no silent last-write-wins.

### LNS / Waiting for Stock

LNS is derived, not a manually authoritative flag.

Conceptually:

selected/current approved LOU context
+ explicit Waiting-for-Stock demand
+ no qualifying effective reservation/allocation.

## 12. Vehicle relationship

There is no permanent lifetime `Vehicle.bookingId`.

The customer-control relationship is represented by Reservation/Allocation history.

A chassis may participate in sequential commercial cases over its lifetime.

## 13. OBR / On Hands / Free Stock

The later established baseline supersedes the July dashboard shorthand.

### On Hands

Requires confirmed physical receipt evidence.

### OBR

A customer-allocated vehicle not yet physically received may project as OBR.

An unallocated pre-receipt vehicle is In Transit, not a fabricated OBR customer allocation.

### Free / Reserved / Allocated

Derived from authoritative stock-control facts.

A standalone legacy `FREE STOCK = YES` field is **not sufficient authority**.

## 14. B2B and D2D

### B2B

FLC branch-to-branch physical chassis transfer.

Current baseline:

- request;
- Director-controlled approval;
- readiness;
- dispatch;
- in transit;
- receipt;
- completion;
- append-only movement history.

Repeated transfers are legitimate; no lifetime “transfer consumed” hard block.

### D2D

For DMSv3, D2D means the **external-dealer transfer/evidence boundary**, not “door-to-door delivery.”

Automated stock-mutating D2D execution remains restricted until separately approved.

## 15. Registration

Registration readiness and actual Registration are separate.

Confirmed:

- Focus/Registration readiness is derived;
- readiness does not create a Registration;
- actual Registration requires explicit externally completed JPJ/mySikap evidence and an authorized command;
- history is immutable/versioned;
- active Allocation binds the Deal to the Vehicle for Registration; Reservation alone is insufficient;
- current Financing disposition is explicit;
- financed readiness uses the selected approved/current financing + current LOU context;
- Agreement, SOLA applicability/clearance, Special Plate process and EHAK evidence remain explicit prerequisite dimensions where applicable;
- EHAK is tied to the current financed disposition context and stale context cannot be reused automatically;
- Cash has no EHAK/LOU gate and requires confirmed cash credit before Registration;
- customer-payment truth should come from Accounts in current UBS rather than a second Sales ledger;
- readiness may return ELIGIBLE / INELIGIBLE / UNKNOWN; missing/ambiguous evidence fails closed;
- physical IN_TRANSIT is not automatically a Registration blocker;
- the Registration command must re-evaluate authoritative prerequisites under lock;
- registration relationship must match the applicable Booking/Vehicle allocation context.

If a Booking is cancelled after Registration:

- Registration is not erased;
- the chassis may become PRE-REGISTER;
- the existing registration can carry into a later sequential commercial case according to policy.

## 16. Commercial terms and pricing boundary

Recorded commercial terms are immutable Booking-scoped snapshots.

Corrections append a new version with reason.

Recorded terms are **not** a pricing engine.

Do not infer or invent:

- OTR formula;
- customer payable formula;
- discount approval;
- insurance contribution;
- tax/accounting treatment;
- balance formula

from a sample VSO or legacy spreadsheet.

## 17. Delivery

Delivered means:

**physical handover of the vehicle/keys + signed VDO evidence.**

Normal rule:

- customer-payable amounts are cleared before Delivery.

Exception:

- authenticated Director approval may allow Delivery with an outstanding balance;
- the outstanding balance remains visible.

Delivery remains an independent Deal event; it must not overwrite physical inventory history.

## 18. VSO, VDO and financed Invoice Submission

Confirmed financed flow after handover:

**Delivery / signed VDO**
+ **VSO**
→ submitted to bank
→ **Invoice Submitted**
→ bank credit
→ Accounts verification
→ **Disbursement**

VSO uses the final sales invoice number under the confirmed document semantics.

Exact document numbering/rendering and accounting correction rules still require their own detailed contract.

## 19. Disbursement

For financed cases:

- Disbursement is not inferred from Delivery.
- Disbursement is recognized only after **Accounts verifies actual bank-statement credit**.
- Disbursement Date = actual credit/value date.

Operational financing evidence and Accounts money evidence may be linked, but are not the same authority.

## 20. Cash path

Cash is first-class.

Cash cases do not traverse:

- EHAK where not applicable;
- Invoice Submitted to bank;
- bank Disbursement.

Confirmed baseline rule:

**cash receipt/credit confirmation is required before Registration** under the cash path.

Do not leave this as an undefined optional policy.

## 21. Official Receipt

Official Receipt (OR):

- is issued only after confirmed credit;
- is one OR per payment transaction;
- allocation detail is separately governed.

## 22. Source ownership

### Proton / Master RO

Owns:

- official Proton Retail Order existence;
- official Proton Booking No;
- Proton-originated Booking facts;
- official Booking MTD population.

### Master Inventory / canonical Inventory evidence pre-cutover

Owns current evidence for:

- chassis;
- physical state/location;
- allocation observations;
- Registration actual/evidence.

### UBS Sales

Owns:

- FLC Booking/Case;
- local workflow decisions;
- stock requests;
- local commercial state;
- Delivery event;
- cancellation/rebooking;
- local action/exception workflow.

### Inventory / Stock Control

Owns:

- canonical Vehicle;
- physical stock state;
- reservations;
- allocations;
- reallocation;
- transfers.

### Accounts

Owns:

- customer receipts;
- deposit/refund/application;
- payment allocation;
- actual bank-credit verification;
- Official Receipts;
- receivable settlement.

### Finance

Owns journal/accounting truth.

## 23. Reconciliation hierarchy

For official Retail Order ↔ Vehicle/Inventory matching:

1. exact chassis where both sides have it;
2. exact Proton Booking No;
3. NRIC/business identifier with contextual validation;
4. other approved source identifiers;
5. customer name only as supporting evidence — never the sole automatic identity.

Ambiguity enters reconciliation.

## 24. KPI baseline

### Official Booking MTD

Master RO / Proton Retail Orders.

### Registration MTD

Authoritative actual Registration population; pre-cutover this is the governed Inventory Registration fact.

### Prospect conversion

Creation-date cohort metrics remain separate from event counts.

### Targets

Proton Target and FLC Internal Target remain separate.

### Historical snapshots

Immutable snapshots must not recalculate from current workbook cells/UI filters.

## 25. Legacy KPI-reference reconciliation

The July KPI guide is retained as legacy/operational evidence, but later confirmed rules supersede several shorthand definitions.

| July KPI-guide statement | Reconstructed baseline |
|---|---|
| Free Stock = legacy field equals YES | Superseded. Free/Reserved/Allocated are derived from stock-control transactions. |
| OBR = received at branch awaiting processing | Superseded. OBR is a customer-allocated pre-receipt projection; received stock is On Hands. |
| D2D = Door-to-Door delivery service | Superseded for DMSv3. D2D is the external-dealer transfer boundary. |
| Lifecycle is one sequential Booking→Loan→LOU→Registration→Delivery→Invoice→Disbursement pipeline | Use as management projection only. Canonical dimensions remain independent. |
| Forecast YES/50-50/NO and Focus labels are source truth | Legacy/read-model evidence only. Forecast/readiness must be derived from reconciled canonical facts + versioned policy. |
| FREE STOCK flag can authorize availability | No. Legacy flag is migration evidence only. |

The KPI guide remains useful for:

- historical stock-aging definitions;
- legacy dashboard metric names;
- Delivered/Pending Delivery/Pending Invoice/Pending Disbursement reporting concepts;
- MTD registration/disbursement event semantics;
- legacy financial workflow labels requiring reconciliation.

## 26. Current Control Tower rules versus stock-control rules

Do not conflate:

### Control Tower allocation SLA

Current workbook management rule:

- NORMAL: 3 days;
- CONTRA/REDEEM: 5 days;
- missing Allocation Type: data gap.

### Reservation term policy

Stock-control hold duration:

- 3 working days: no loan/LOU context;
- 7 working days: pending LOU;
- 3 working days: approved LOU.

They measure different things and both may coexist.

## 27. Current technical implementation versus target product

Current UBS code is implementation evidence.

The target DMSv3 refactor must not preserve defects merely because they exist, including:

- generic linear Deal stage;
- DMS Lead/Prospect duplicated as Deal stages;
- “New without Deposit → Lead”;
- client-authoritative lifecycle updates;
- Shipment/Receive duplicated into Deal stage;
- single mutable loan state;
- direct status fields replacing independent lifecycle dimensions.

## 28. Baseline change control

Future changes to a CONFIRMED rule require:

- dated owner decision;
- impact analysis;
- SOT update;
- affected KPI/source/schema migration plan;
- regression tests.

OPEN POLICY may not be resolved silently by code.
