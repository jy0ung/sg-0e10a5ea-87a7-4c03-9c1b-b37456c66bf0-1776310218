# 01 — Current FLC Workflow

**Status:** CURRENT GOVERNED + BUSINESS CONFIRMED  
**Evidence date:** 2026-10-01

This file documents how the FLC Sales/DMS process currently operates and is measured. It is deliberately separate from the target DMSv3 schema.

## 1. Customer funnel: DMS Lead / Direct Prospect

### Lead

**Owner:** Proton DMS.

Current Master Leads (DMS) evidence includes:

- Outlet;
- Lead ID;
- Customer identity/contact;
- DMS status;
- Sales Advisor name and ID;
- intended Model / Variant / Colour;
- First Source;
- Second Source;
- Channel;
- Event Name;
- Created At;
- Convert Time;
- Assignment Time.

UBS may attach local follow-up workflow but must not rewrite the DMS Lead as local truth.

### Prospect

**Owner:** Proton DMS.

**BUSINESS CONFIRMED:** a Lead is optional. A Direct Prospect may exist without a preceding Lead.

Current Master Prospects (DMS) includes:

- Prospect Code;
- optional originating Lead ID;
- optional Booking ID;
- Prospect status/status code;
- Progress;
- Sales Advisor code;
- intended Model / Variant / Colour;
- Event / campaign;
- Follow Up Count;
- Last Follow Up;
- Next Follow Up;
- Booking Money;
- Rating;
- Created At.

The current Prospect dashboards treat Booking ID as the observable evidence that a Prospect is now booked.

### Prospect status/rating rules

Current approved rule layer:

| DMS value | Approved meaning | State | SLA |
|---|---|---|---:|
| HOT / 95051001 | HOT | Open rating | 3 days |
| WARM / 95051002 | WARM | Open rating | 7 days |
| 95051003 | COLD | Open rating | 7 days |
| blank rating | UNRATED | Open | no rating SLA |
| status 95041001 | OPEN | Open | — |
| status 95041002 | OPEN | Open | — |
| status 95041003 | CLOSED | Close-Win | — |
| status 95041005 | CLOSED | Close-Lost management mapping | — |

Status 95041005 still needs official Proton-codebook confirmation if a future integration requires semantic precision.

## 2. Prospect → FLC Booking / Case → Official Proton Retail Order

Two Booking concepts are authoritative and must remain distinct.

### FLC Booking / Case

An FLC Booking/Case may be created when genuine purchase intent and sufficient customer information/documents exist.

It:

- receives an immutable internal UUID;
- may exist before Proton creates an official Booking No;
- may exist **with or without deposit**;
- is the canonical local FLC commercial case.

Deposit does not determine whether the case is still a Lead/Prospect.

### Official Proton Booking / Retail Order

Sales Admin creates the official Proton Booking in Proton DMS when the Proton process is ready.

Proton then provides the official Booking No / Retail Order evidence.

Current operational mirror:

**Master RO / Proton Retail Order feed**

This population owns the governed **official Booking MTD** metric.

Current DMS Prospect records may already contain Booking ID / Booking Money / conversion evidence. DMSv3 must preserve Lead/Prospect/RO provenance when linking the official Proton Retail Order to the canonical FLC case.

## 3. Booking identity

The current spreadsheet Control Tower uses Booking No as its durable synchronization key and must never key history by row position.

The reconstructed target contract is:

- **FLC Deal/Booking UUID** = permanent technical identity;
- **Proton Booking No** = official Proton business identifier and may be null before Proton creates the Retail Order;
- one customer may legitimately have multiple Bookings;
- customer name is never Booking identity;
- Deal ↔ Proton Retail Order linkage is explicit, deterministic and idempotent;
- re-sorting, rebuilding or resyncing must never change case identity.

Therefore “Booking No is permanent” remains valid for current workbook synchronization but does not mean the Proton Booking No must exist before the local FLC case.

## 4. Current Booking Control Tower workflow

The current pre-registration executive projection is:

**Official Booking → Loan Submission → LOU → Allocation → Registration**

The complete business journey is broader:

**Lead / Direct Prospect → FLC Booking/Case → Official Proton Retail Order → Financing/LOU → Stock Request/Reservation/Allocation → Registration → Delivery → Invoice Submitted where financed → Disbursement/Settlement**

The Control Tower is therefore a blocker/read-model over part of the lifecycle, not the canonical lifecycle itself.

### Current stage precedence

For the active Booking Control Tower:

1. Registered / Delivered / Deleted / booking-level Cancelled are closed for the pre-registration action queue.
2. Otherwise, confirmed DMS allocation / allocation date / chassis → **Pending Registration**.
3. Otherwise, confirmed LOU → **Pending Allocation**.
4. Otherwise, submitted/rejected finance → **Pending LOU**.
5. Otherwise → **Pending Loan Submission**.
6. Cash cases may enter **Cash - Review** according to current classification.

This is a **physical/current blocker model**, not a claim that Registration ends the entire customer lifecycle.

## 5. Loan Submission

Current staff-owned workflow fields include:

- Loan Status;
- Reason;
- Bank / LOU;
- LOU Approved Date;
- Loan Submission Date;
- Remark;
- Last Follow-up Date;
- Next Action Date;
- Control Tower owner.

Current loan/status vocabulary evidenced in the workbook includes:

- Pending Complete Doc;
- Pending Customer Decision;
- Loan Submitted (Low Chance);
- Loan Submitted (Mid Chance);
- Loan Submitted (High Chance);
- Loan Rejected;
- LOU Approved;
- Cancelled;
- Cash;
- Pending Stock Allocation.

Current LOU Summary normalizes these into management categories such as:

- NEW;
- CANCEL;
- LOAN REJECTED;
- LOAN SUBMITTED (HIGH CHANCE);
- LOAN SUBMITTED (LOW CHANCE);
- PENDING APPROVAL;
- PENDING COMPLETE DOC;
- LOU APPROVED.

Current LOU Summary note:

- NEW includes blank loan status, Pending Customer Decision and Cash.
- PENDING APPROVAL represents Loan Submitted (Mid Chance).

These are current reporting classifications; DMSv3 will model Financing more explicitly.

## 6. Booking → Loan timing

Current management rules:

- warning begins on day 3;
- expected maximum is day 4;
- a pending-loan case is overdue from day 5 onward.

Daily/management metrics therefore distinguish:

- Pending Loan;
- Loan Submitted;
- Loan >4d / overdue.

## 7. LOU workflow and aging

Current director aging bands:

| Pending LOU age | Status | Required action |
|---:|---|---|
| 0–1 days | NEW | Monitor bank response |
| 2–3 days | GOOD | Continue follow-up / proceed when approved |
| 4–7 days | ACTION | Supporting documents, change hirer, or different bank |
| 8+ days | CRITICAL | Escalate; AEON / Proton Credit prompt |

LOU is a crucial operational milestone even though DMSv3 moves it into the Financing sub-workflow instead of keeping it as a top-level Deal stage.

## 8. Stock Request, Reservation and Vehicle Allocation

These are separate business concepts.

### Stock Request

A Sales Advisor/authorized user may request stock.

A Stock Request by itself does not reserve or allocate a chassis.

### Reservation

A Reservation is a temporary effective hold.

Confirmed stock-control policy:

- at most one effective Reservation per chassis;
- current default term = 3 working days with no loan/LOU context;
- current default term = 7 working days while LOU is pending;
- current default term = 3 working days after approved LOU;
- the policy/version is snapshotted on the hold;
- expiry is a review/control point, not an automatic free-stock release;
- extension/pre-emption is explicit and auditable.

### Allocation

Allocation is authoritative customer stock control for a specific chassis.

- authorized management controls Allocation;
- Sales Advisor may request but does not allocate a specific chassis;
- only one active Allocation may control a chassis;
- reallocation is explicit and preserves displaced Booking history;
- no silent last-write-wins.

### Current DMS allocation source evidence

Allocation observations are determined from DMS Allocation Status / Allocation Date / Chassis.

**Date Stock Requested is not Allocation Date.**

### Current Control Tower inventory boundary

Current governed workbook rule:

> normal Inventory/stock linkage is permitted only after confirmed LOU.

If DMS already shows allocation/chassis before confirmed LOU:

- do **not** move the physical state backward;
- keep the physical stage as Pending Registration;
- flag **ALLOCATED BEFORE CONFIRMED LOU** as a control breach.

### Control Tower Allocation SLA

This is different from Reservation hold duration.

- NORMAL: 3 days after the relevant LOU milestone.
- CONTRA / REDEEM / CONTRA + REDEEM: 5 days.
- Missing Allocation Type = data gap.
- Missing type must **not** silently default to 3 days.

### LNS / Waiting for Stock

LNS is a derived demand condition, not a manually authoritative flag:

selected/current approved LOU context + explicit Waiting-for-Stock demand + no qualifying effective Reservation/Allocation.

## 9. Registration

### Current authoritative actual

Current governed enterprise Registration MTD fact source is:

**Master Data → Master Inventory (OUTLET) → REG DATE**

The Booking Register is a booking-lifecycle projection; it is **not** the authoritative enterprise Registration MTD fact source.

### Registration SLA

Management-approved Registration SLA:

- target: 7 days;
- Pending Registration is ON TRACK through day 7;
- OVERDUE from day 8 onward.

### Target normalization

DMSv3 keeps Registration as a dedicated sub-workflow linked to the canonical Vehicle and Deal. The current authoritative registration evidence must be reconciled into it.

## 10. Delivery

Delivery is a true customer/deal milestone.

**BUSINESS CONFIRMED:** Delivered means physical handover of the vehicle/keys with signed VDO evidence.

Current operational sources contain:

- Delivery Date;
- Vehicle;
- Registration facts;
- branch/outlet context.

Auto Aging currently measures:

- BG → Delivery;
- Registration → Delivery.

Normal financial rule:

- customer-payable amounts are cleared before Delivery.

Exception:

- authenticated Director approval may allow Delivery with an outstanding balance;
- the outstanding balance remains visible.

DMSv3 will formalize Delivery as an authoritative handover event rather than a manually draggable generic Deal stage.

## 11. Invoice Submission and Disbursement

For a financed Deal, the confirmed downstream sequence is:

**Delivered / signed VDO + VSO → submitted to bank → Invoice Submitted → actual bank credit → Accounts verification → Disbursement**

Current operating data tracks DISB. DATE and the current KPI suite measures:

- BG → Disbursement;
- Delivery → Disbursement;
- Pending Disbursement.

Rules:

- Delivery does not imply Disbursement.
- Disbursement is recognized only after Accounts verifies actual bank-statement credit.
- Disbursement Date = actual credit/value date.
- VSO/VDO/Invoice Submitted are financing/document evidence, not universal Deal stages.
- Official Receipt is issued only after confirmed credit, one OR per payment transaction.

For a non-loan Deal, fake bank Invoice Submitted/Disbursement stages must not be created.

## 12. Cash / non-loan cases

Current payment mappings normalize:

- CASH → Cash
- LOAN → Loan
- GOV / GOVERNMENT → Government

Payment-type master also contains Trade-In.

The current Control Tower exposes a Cash Review branch.

DMSv3 must therefore support conditional workflows rather than forcing every Booking through Loan Submission, LOU, bank Invoice Submission or bank Disbursement.

**BUSINESS CONFIRMED for Cash:** customer cash credit/receipt confirmation is required before Registration.

Other Government/Trade-In completion rules remain OPEN POLICY where not already governed.

## 13. Deposit

**BUSINESS CONFIRMED:** Booking may exist with or without deposit.

Current datasets expose deposit/booking-money related fields, and Auto Aging currently groups PAYMENT METHOD + BG DATE under a “DEPOSIT PAYMENT” owner.

However, the current code glossary defines BG DATE as “Bank Guarantee date,” creating a semantic conflict. See 08_OPEN_POLICY_DECISIONS.md.

DMSv3 must not equate “deposit exists” with “Booking exists.”

Actual receipt/refund/application of money belongs to Accounts-owned immutable events.

## 14. Date integrity

Current governed workbook date order:

**Official Booking ≤ Loan Submission ≤ LOU ≤ Allocation ≤ Registration**

FLC Case creation may precede the official Proton Booking/Retail Order and must therefore have its own business timestamp.

Rules:

- dates must be real dates;
- future workflow dates are invalid unless an explicitly defined future-planning field permits them;
- invalid dates are flagged;
- aging must not coerce invalid dates to age 0.

Delivery and Disbursement are additional downstream event dates and must also preserve chronological integrity appropriate to their owning workflows.

## 15. Sales Advisor identity

Current workbook rule:

- resolve SA Code against the approved Sales Advisor reference;
- do **not** rewrite the transaction Booking Outlet to force a match;
- transaction outlet remains the historical Booking fact;
- unapproved/unassigned SA cases remain visible.

DMSv3 target:

- Employee ID is canonical Sales Advisor identity;
- DMS salesperson/SA code is reconciliation evidence;
- names are display/matching only.

## 16. Action Queue

Current priority order:

1. CRITICAL
2. DATE INTEGRITY
3. CONTROL BREACH
4. MISSING WORKFLOW DATE
5. ALLOCATION TYPE MISSING
6. SA IDENTITY
7. OVERDUE
8. ACTION
9. DATA GAP
10. DUE

Every OPEN Booking should have one action identity and must not silently disappear from the queue.

Closed cases must not consume current action capacity.

## 17. Source freshness

Current controls distinguish:

- Booking source event coverage;
- Control Tower/manual-update heartbeat;
- stock-intelligence publication freshness;
- Inventory source date quality.

A stale stock publisher does **not** mean Booking/DMS event coverage is stale.

Future DMSv3 read models must retain independent freshness/provenance per source domain.

## 18. Current forecast boundary

Current Registration forecast rule:

- actual registrations are separate facts;
- weighted forecast includes only active DMS Retail Orders uniquely reconciled to Inventory;
- vehicle must be unregistered;
- exactly one governed Inventory Focus Register stage must exist;
- DMS-only/unmatched cases remain visible but are unweighted.

This deterministic-match requirement must survive the refactor.

## 19. Current implementation mismatch in UBS

The present UBS Deal implementation has an 11-stage linear model:

Lead → Prospect → Booking → Loan Submission → LOU → Shipment → Receive → Registration → Delivery → Disbursement → Completed.

That implementation is **not the business SOT**.

Known mismatches:

- Lead and Prospect duplicate DMS-owned stages.
- New Deal starts at Lead.
- historical migration maps “New without Deposit” to Lead.
- LOU is duplicated between Deal.stage and loan status.
- Shipment/Receive are vehicle facts represented as Deal stages.
- Registration is duplicated between Deal.stage and deal_registration.
- Disbursement is duplicated between Deal.stage and deal_loan.
- cash/non-loan paths are forced through a linear flow.
- Deal/loan/registration writes are still more client-shaped than the newer Finance command pattern.

DMSv3 exists to correct these mismatches without losing historical evidence.


## 20. Physical stock classification clarifications

Later established baseline rules supersede older dashboard shorthand:

- **ON_HANDS** requires confirmed physical receipt evidence.
- **OBR** may be derived when a vehicle is customer-allocated but not yet physically received.
- an unallocated pre-receipt vehicle remains **In Transit**, not OBR.
- **Free / Reserved / Allocated** are derived from authoritative stock-control facts; a legacy `FREE STOCK = YES` field is not sufficient authority.
- Registration, Delivery and physical stock state are independent lifecycle dimensions.

## 21. Sequential commercial cases / PRE-REGISTER

No permanent lifetime Vehicle→Booking ownership relation is permitted.

If a Booking is cancelled after Registration:

- the Registration history remains attached to the chassis;
- the chassis may project as PRE-REGISTER;
- a later commercial case may use the same chassis/registration under approved policy;
- prior Booking, Allocation and Registration history remains immutable.

## 22. Historical KPI terminology warning

The July 2026 Inventory Dashboard KPI guide is important historical evidence, but several glossary definitions were superseded by later confirmed rules:

- OBR no longer means simply “received at branch awaiting processing”;
- Free Stock is no longer authorized by the legacy FREE STOCK field alone;
- D2D in DMSv3 means external-dealer transfer boundary, not Door-to-Door delivery;
- the old sequential lifecycle visualization is a reporting projection, not the canonical state model.
