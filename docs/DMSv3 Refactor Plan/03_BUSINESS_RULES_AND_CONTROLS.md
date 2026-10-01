# 03 — Business Rules and Controls

**Status:** CURRENT GOVERNED + BUSINESS CONFIRMED  
**Evidence date:** 2026-10-01

This file is the authoritative rule catalogue for DMSv3 implementation. Rules marked OPEN POLICY are listed separately in 08_OPEN_POLICY_DECISIONS.md and must not be guessed.

## 1. Identity rules

### Booking identity

**CURRENT WORKBOOK CONTROL**

- Booking No is the durable synchronization key in the current Control Tower.
- Do not key history by spreadsheet row number or current row position.
- DMS/system refreshes UPSERT by Booking No.
- DMS/system refreshes must not overwrite staff-owned manual workflow fields.

**BUSINESS CONFIRMED / TARGET DMSv3**

- FLC Booking/Case UUID is the permanent technical identity.
- FLC Booking/Case may exist before Proton creates a Booking No.
- Proton Booking No is the official Proton business identifier and may initially be null.
- DMS Retail Order ID and Proton Booking No remain explicit external/source identities.
- one customer may legitimately have multiple Bookings;
- one upstream Proton Retail Order must not create duplicate canonical Deals on replay;
- customer name is never Booking identity.

### Sales Advisor identity

**CURRENT GOVERNED**

- resolve SA Code against the approved reference;
- do not rewrite transaction outlet to force an SA match;
- unresolved/unapproved SA remains visible as an exception.

**TARGET DMSv3**

- employees.id is canonical person identity;
- DMS SA code / staff code is deterministic reconciliation evidence;
- names are display snapshots only.

### Vehicle identity

**TARGET DMSv3**

- vehicle_id is the canonical relationship.
- chassis/VIN remains a strong business identifier and reconciliation key.
- do not create a second Vehicle merely because a chassis string appears on another source record.

## 2. Lead / Prospect rules

**BUSINESS CONFIRMED + CURRENT DMS EVIDENCE**

- Lead is DMS-owned.
- Prospect is DMS-owned.
- Lead is optional; Direct Prospect is first-class.
- UBS may hold local follow-up/action workflow.
- UBS must not create a competing canonical Lead/Prospect status.

### Prospect booking evidence

Current dashboards classify a Prospect as booked when its current DMS Prospect evidence contains a Booking ID / Close-Win relationship.

### DMS Prospect status mappings

- 95041001 = OPEN
- 95041002 = OPEN
- 95041003 = CLOSED / Close-Win
- 95041005 = CLOSED / Close-Lost management mapping

95041005 requires official Proton-codebook confirmation before it is treated as an immutable integration-code meaning.

### Rating mappings

- HOT / 95051001 = Hot
- WARM / 95051002 = Warm
- 95051003 = Cold
- blank = Unrated

## 3. Prospect follow-up SLA

Current rating SLA:

- Hot: 3 days
- Warm: 7 days
- Cold: 7 days

Rules:

- rating SLA applies to open rated Prospects;
- Closed and Unrated are excluded from rating-SLA overdue;
- Schedule Overdue and Rating-SLA Overdue are separate concepts;
- Next Follow Up before the as-of date = Schedule Overdue.

## 4. Booking rule

**BUSINESS CONFIRMED**

Two concepts must remain distinct:

1. **FLC Booking/Case** — local commercial case with immutable UUID; may be created once genuine purchase intent and sufficient information/documents exist.
2. **Official Proton Booking/Retail Order** — created in Proton DMS and identified by Proton Booking No; current operational mirror is Master RO.

A local FLC Booking/Case is valid **with or without deposit**.

Therefore:

- deposit amount = 0 does not mean Lead;
- missing deposit does not demote Booking to Prospect;
- “New without Deposit” must not be modeled as Lead in DMSv3;
- deposit is a parallel financial fact;
- official Booking MTD comes from the Proton Retail Order population, not from manually keyed/local-case rows.

## 5. Current lifecycle-state precedence

The current pre-registration Control Tower resolves OPEN bookings using this precedence:

1. Registered / Delivered / Deleted / booking-level Cancelled → closed for this queue.
2. DMS allocation/chassis evidence → Pending Registration.
3. confirmed LOU → Pending Allocation.
4. submitted/rejected finance → Pending LOU.
5. otherwise → Pending Loan Submission.
6. Cash Review is a separately visible open branch where current classification requires it.

A later physical fact wins over an earlier workflow defect. The defect remains an exception; the physical stage does not move backward.

## 6. Booking → Loan SLA

Management-controlled values:

- warning day: 3
- maximum expected day: 4
- overdue begins: day 5

Rules:

- Pending Loan cannot already have a valid Loan Submission Date.
- If Loan Submission is recorded, the case must advance from Pending Loan under the governed stage logic.
- Invalid/future dates do not qualify as valid evidence.

## 7. Pending LOU aging rules

| Age | Status | Action |
|---:|---|---|
| 0–1 | NEW | monitor bank response |
| 2–3 | GOOD | continue follow-up / prepare next step |
| 4–7 | ACTION | supporting docs / change hirer / different bank |
| 8+ | CRITICAL | executive escalation; AEON / Proton Credit prompt |

No implementation may change the bands without an SOT update.

## 8. Financing status/reason controls

Current controlled loan/status list includes:

- PENDING COMPLETE DOC
- PENDING CUSTOMER DECISION
- LOAN SUBMITTED (LOW CHANCE)
- LOAN SUBMITTED (MID CHANCE)
- LOAN SUBMITTED (HIGH CHANCE)
- LOAN REJECTED
- LOU APPROVED
- CANCELLED
- CASH
- PENDING STOCK ALLOCATION

Current rejection/reason groupings include:

- Bank Eligibility / Scoring Issue
- Changed Dealer
- CTOS / CCRIS
- Customer Decision Issues
- Documentation / Verification Issue
- Finance Issues
- Guarantor / Support Requirement
- KIV

DMSv3 may normalize these into structured financing status + reason dimensions but must preserve historical meaning.

## 9. Bank master control

Current workbook validation list includes examples such as:

- AFFIN
- AMB
- BANK ISLAM
- BIS
- BKRM
- BSN
- CIMB
- CIMB-I
- HLB
- MBB
- PBB
- RHB
- AEON
- PROTON CREDIT
- CASH
- MULTI
- OTHER
- BMMB

DMSv3 should use canonical bank IDs where a bank entity exists. Display labels are not canonical joins.

## 10. LOU rule

LOU is a financing milestone.

Current Control Tower requires confirmed LOU before normal inventory/stock linkage.

DMSv3 target keeps LOU in Financing, not as a top-level Deal stage.

The exact financing milestone required to unlock Registration remains OPEN POLICY if it differs from the current “confirmed LOU before allocation” control.

## 11. Stock request, Reservation and Allocation rules

### Stock Request

- Sales Advisor/authorized user may request stock.
- A request alone does not reserve or allocate a chassis.

### Reservation

- at most one effective Reservation per chassis;
- Reservation is temporary stock control, distinct from Allocation;
- versioned default terms:
  - 3 working days: no loan/LOU context;
  - 7 working days: pending LOU;
  - 3 working days: approved LOU;
- later policy changes do not rewrite existing snapshotted terms;
- expiry is a control/review point, not automatic release;
- extension and pre-emption require explicit authorized action/history.

### Allocation authority

- authorized management controls authoritative allocation;
- Sales Advisor may request but does not allocate a specific chassis;
- one active Allocation per chassis;
- Reservation may convert to Allocation under the owning-domain command;
- Reallocation is explicit and auditable;
- no silent last-write-wins;
- no permanent Vehicle.bookingId is authoritative; sequential commercial cases are permitted.

### LNS / Waiting for Stock

LNS is derived from selected/current financing context + explicit Waiting-for-Stock demand + no qualifying effective Reservation/Allocation. No manually stored `is_lns` flag is authoritative.

### Current DMS Allocation evidence

Use DMS Allocation Status / Allocation Date / Chassis evidence as source observations during reconciliation.

**Date Stock Requested is not Allocation Date.**

### Post-LOU inventory boundary

Current rule:

- normal stock linkage only after confirmed LOU.

### Pre-LOU allocation control breach

If DMS already shows allocation/chassis before confirmed LOU:

- preserve the later physical stage;
- flag ALLOCATED BEFORE CONFIRMED LOU;
- do not hide the case;
- do not rewrite source evidence.

### Allocation SLA

- NORMAL = 3 days.
- CONTRA = 5 days.
- REDEEM = 5 days.
- CONTRA + REDEEM = 5 days.
- Missing allocation type = data gap and **no default SLA**.

## 12. Registration rules

### Authoritative current actual

Enterprise Registration actual = Master Inventory (OUTLET) REG DATE.

### SLA

- 7 days.
- On track through day 7.
- Overdue from day 8.

### Control

Pending Registration cannot already have a valid effective Registration Date.

Additional confirmed rules:

- Registration readiness/Focus is derived, never actual Registration.
- actual Registration is an explicit externally completed result with immutable history/provenance;
- physical IN_TRANSIT is not automatically a Registration blocker;
- the Registration command must re-evaluate authoritative prerequisites under lock;
- Reservation alone is not equivalent to active Allocation for the commercial chassis context;
- cancellation after Registration does not erase Registration;
- PRE-REGISTER/sequential commercial cases preserve the carried chassis Registration history.

Registration evidence closes the current pre-registration queue, but does **not** mean the entire customer Deal is economically complete; Delivery and, where applicable, Disbursement follow.

## 13. Delivery rules

Delivery is a customer handover business event.

**Delivered = physical handover of vehicle/keys + signed VDO evidence.**

Normal financial rule:

- customer-payable amounts are cleared before Delivery.

Authorized exception:

- authenticated Director approval may permit Delivery with an outstanding balance;
- the outstanding balance remains visible and is not silently waived.

DMSv3 requires an authoritative delivery command/event referencing the canonical Deal and Vehicle with actor/time/source evidence.

The remaining **non-financial** readiness checklist (e.g. exact insurance/plate/location gates) may remain OPEN POLICY where not already confirmed.

## 14. Invoice Submission and Disbursement rules

For financed cases, confirmed downstream flow:

**signed VDO + VSO submitted to bank → Invoice Submitted → actual bank credit → Accounts verification → Disbursement**

Rules:

- Delivery and Disbursement are distinct events.
- A financed Deal may remain outstanding after Delivery.
- Disbursement is recognized only after Accounts verifies actual bank-statement credit.
- Disbursement Date = actual credit/value date.
- Invoice Submitted is a financed document/settlement milestone, not a universal Deal stage.
- Non-loan Deals must not create fake bank Invoice Submitted/Disbursement state.
- operational financing evidence does not itself authorize a Finance journal; Accounts/Finance contracts remain authoritative.
- Official Receipt is issued only after confirmed credit; one OR per payment transaction.

## 15. Payment-method normalization

Current mappings:

- CASH → Cash
- LOAN → Loan
- GOV → Government
- GOVERNMENT → Government

Current payment master also includes Trade-In.

Future payment-method-specific lifecycle behavior must be explicit and versioned.

**Confirmed Cash rule:** cash credit/receipt confirmation is required before Registration; Cash does not traverse fictitious bank Invoice Submitted/Disbursement states.

## 16. Deposit controls

**BUSINESS CONFIRMED**

- Deposit is optional for Booking.
- Deposit does not decide Deal existence.
- Deposit receipts/refunds/forfeitures must become immutable Accounts-integrated events.
- Compatibility fields may remain during migration but cannot remain the long-term monetary ledger.

## 17. Date integrity

Current workbook chronology:

**Official Proton Booking ≤ Loan Submission ≤ LOU ≤ Allocation ≤ Registration**

The FLC Booking/Case may precede the official Proton Booking and requires its own business timestamp.

General rules:

- real dates only;
- source/event date and record-created date are different concepts;
- invalid chronology = data/control issue;
- future operational completion dates are invalid unless a specific field is intentionally a forecast/planned date;
- invalid dates must not silently become zero aging.

DMSv3 extends chronology checks to Delivery and Disbursement according to their domain policy.

## 18. Current editable/manual workflow layer

Current governed staff-editable fields include:

- Loan Status
- Reason
- Bank / LOU
- LOU Approved Date
- Loan Submission Date
- Remark
- Allocation Type
- Last Follow-up Date
- Next Action Date
- Control Tower Owner
- Control Tower Registration Date

DMS/system fields are separately refreshed and must not overwrite this local workflow layer.

DMSv3 should replace spreadsheet-specific “manual layer” semantics with explicit UBS-owned domain columns/events, preserving this authority split.

## 19. Source freshness

Source freshness is multidimensional.

Do not collapse:

- Booking event coverage;
- DMS source coverage;
- staff/manual workflow heartbeat;
- stock publisher freshness;
- Inventory data-date quality

into one timestamp.

A stale stock publisher makes stock decisions advisory; it does not prove DMS Booking event coverage is stale.

## 20. Production parity/trust controls

Current governed checks include:

- source row count;
- canonical row count;
- report row count;
- outlet parity-after;
- production run status.

PASS requires the expected counts to be present/equal and outlet parity to pass.

Do not reuse values from a previous successful run when the current run failed before producing evidence.

## 21. Action Queue controls

Every OPEN Booking should resolve to one governed action identity.

Priority:

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

Rules:

- no duplicate Booking No in visible queue;
- closed cases excluded;
- a lower-display-priority exception must still remain measurable in its dedicated control signal.

## 22. Data-quality controls

Examples of governed DQ/control classes:

- Date integrity
- Pre-LOU allocation/control breach
- Missing workflow date
- Missing Allocation Type
- SA identity/outlet exception
- stale source/publication
- unmatched/non-deterministic vehicle link

Physical source facts are preserved even if they violate workflow policy.

## 23. Forecast controls

Registration forecast:

- actual registrations separate from forecast;
- unique DMS RO ↔ Inventory match required for weighted forecast;
- DMS-only unmatched rows remain visible but receive no weight;
- registered vehicles excluded from future-registration forecast;
- ambiguous matches are review items, not auto-selected.

## 24. Target controls

Proton Target and FLC Internal Target are separate governed metrics.

Do not:

- overwrite one with the other;
- add them together;
- label one generic “Target” without preserving target type.

## 25. Demographic/privacy controls

Current market-profile rules:

- raw IC remains in protected/hidden source layers;
- DOB derived from IC is not exposed as a management list field;
- management surfaces use aggregates;
- Unique Customer demographic counts use valid IC;
- age analysis uses age at Prospect Creation;
- accepted marketing analysis age range is 18–100;
- invalid/missing IC remains an explicit coverage/data-quality category.

Future DMSv3 analytics should preserve data minimization and role-appropriate access.

## 26. Business calendar

Confirmed baseline:

- Monday–Friday 08:00–17:00;
- Saturday 08:00–13:00;
- Sunday non-working;
- Sabah public holidays non-working and configurable.

Working-day computations used by Reservation/SLA policy must be server-authoritative and versioned where historical reproducibility matters.

## 27. Physical stock / OBR / Free Stock controls

Later confirmed rules supersede legacy dashboard shorthand:

- ON_HANDS requires confirmed physical receipt evidence.
- OBR may project when a Vehicle is customer-allocated but not yet physically received.
- unallocated pre-receipt stock is In Transit, not OBR.
- Free / Reserved / Allocated are derived from stock-control facts.
- legacy `FREE STOCK = YES` is evidence only and cannot authorize availability.

## 28. B2B / D2D terminology

- B2B = branch-to-branch chassis transfer with confirmed Director-controlled approval.
- repeated B2B transfers are legitimate and historically preserved.
- transfer cost mode/payer is separate from transfer authorization.
- D2D in DMSv3 = external-dealer transfer/evidence boundary; automated stock-mutating execution remains restricted until separately approved.
- do not use the old “Door-to-Door delivery service” definition for DMSv3.

## 29. Direct-write architecture rule

DMSv3 lifecycle state must not be enforced only by React or client services.

Authoritative lifecycle changes must use backend commands/RPCs with:

- auth.uid()-derived actor;
- company/tenant validation;
- role/capability validation;
- row locking where concurrency matters;
- prerequisite validation;
- current-state mutation;
- immutable event/audit entry;
- idempotency for upstream events;
- atomic commit.

## 30. Legacy contradictions that must not be carried forward

- “New without Deposit → Lead” is invalid for DMSv3.
- Deal Lead/Prospect duplication is invalid.
- Shipment/Receive as customer Deal stages is invalid.
- manual client stage drag/update as authority is invalid.
- legacy custom KPI “Pending LOU = delivered but LOU absent” conflicts with the governed current pre-registration process.
- names must not become person identity.
- current-row/dashboard cell positions must not become historical KPI sources.
- local FLC Case and official Proton Retail Order must not be collapsed into one identity/date.
- Reservation and Allocation must not be collapsed into one assignment record.
- legacy FREE STOCK field must not become authoritative availability.
- legacy OBR “received-awaiting-processing” shorthand must not override the later stock-control meaning.
- D2D must not be interpreted as Door-to-Door delivery in DMSv3.
