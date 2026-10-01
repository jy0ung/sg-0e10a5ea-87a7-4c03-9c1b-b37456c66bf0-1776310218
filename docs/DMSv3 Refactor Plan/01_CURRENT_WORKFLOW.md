# 01 — Current FLC Workflow

**Status:** CURRENT GOVERNED + BUSINESS CONFIRMED  
**Evidence date:** 2026-10-01

This file documents how the FLC Sales/DMS process currently operates and is measured. It is deliberately separate from the target DMSv3 schema.

## 1. Customer funnel: DMS Lead → DMS Prospect

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

## 2. Prospect → Booking

**BUSINESS CONFIRMED:** a Booking is a Booking **with or without deposit**.

Deposit does not determine whether the case is still a Lead/Prospect.

Current DMS Prospect records may already contain:

- Booking ID;
- Booking Money;
- Progress = Convert to booking;
- Intention Stage = Booking.

DMSv3 must preserve the DMS provenance when a canonical UBS Deal/Booking is created.

## 3. Booking identity

The current Booking Control Tower rule is explicit:

> Booking No is the permanent case key. Workflow history must never be maintained by row position.

Current production/control sheets use Booking No to UPSERT system/DMS fields and preserve staff-owned manual fields.

For DMSv3:

- Booking No remains an important external/business identifier.
- UBS Deal UUID becomes the canonical internal FK.
- The relationship between Deal and DMS Booking/Retail Order must be explicit and idempotent.
- Re-sorting, rebuilding or resyncing must never change case identity.

## 4. Current Booking Control Tower workflow

The current executive workflow is stated as:

**Booking → Loan Submission → LOU → Allocation → Registration**

Delivery and Disbursement are downstream milestones tracked elsewhere in the operating data.

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

## 8. Vehicle Allocation

### Current source

Allocation is determined from DMS Allocation Status / Allocation Date / Chassis.

**Date Stock Requested is not Allocation Date.**

### Current inventory boundary

Current governed rule:

> Inventory/stock linkage is permitted only after confirmed LOU.

If DMS already shows allocation/chassis before confirmed LOU:

- do **not** move the physical state backward;
- keep the physical stage as Pending Registration;
- flag **ALLOCATED BEFORE CONFIRMED LOU** as a control breach.

### Allocation SLA

- NORMAL: 3 days after the relevant LOU milestone.
- CONTRA / REDEEM / CONTRA + REDEEM: 5 days.
- Missing Allocation Type = data gap.
- Missing type must **not** silently default to 3 days.

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

Current operational sources contain:

- Delivery Date;
- Vehicle;
- Registration facts;
- branch/outlet context.

Auto Aging currently measures:

- BG → Delivery;
- Registration → Delivery.

DMSv3 will formalize Delivery as an authoritative handover event rather than a manually draggable generic Deal stage.

## 11. Disbursement

Current business meaning in the UBS glossary:

> Bank releases loan funds to the dealership.

Current operating data tracks DISB. DATE and the current KPI suite measures:

- BG → Disbursement;
- Delivery → Disbursement;
- Pending Disbursement.

For a financed Deal:

**Delivery does not imply Disbursement.**

For a non-loan Deal, a fake bank-disbursement stage must not be created. Completion must follow the applicable settlement rule.

## 12. Cash / non-loan cases

Current payment mappings normalize:

- CASH → Cash
- LOAN → Loan
- GOV / GOVERNMENT → Government

Payment-type master also contains Trade-In.

The current Control Tower exposes a Cash Review branch.

DMSv3 must therefore support conditional workflows rather than forcing every Booking through Loan Submission, LOU and bank Disbursement.

Exact completion gates by payment type remain an OPEN POLICY where not already governed.

## 13. Deposit

**BUSINESS CONFIRMED:** Booking may exist with or without deposit.

Current datasets expose deposit/booking-money related fields, and Auto Aging currently groups PAYMENT METHOD + BG DATE under a “DEPOSIT PAYMENT” owner.

However, the current code glossary defines BG DATE as “Bank Guarantee date,” creating a semantic conflict. See 08_OPEN_POLICY_DECISIONS.md.

DMSv3 must not equate “deposit exists” with “Booking exists.”

Actual receipt/refund/application of money belongs to Accounts-owned immutable events.

## 14. Date integrity

Current governed date order:

**Booking ≤ Loan Submission ≤ LOU ≤ Allocation ≤ Registration**

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
