# 03 — Business Rules and Controls

**Status:** CURRENT GOVERNED + BUSINESS CONFIRMED  
**Evidence date:** 2026-10-01

This file is the authoritative rule catalogue for DMSv3 implementation. Rules marked OPEN POLICY are listed separately in 08_OPEN_POLICY_DECISIONS.md and must not be guessed.

## 1. Identity rules

### Booking identity

**CURRENT GOVERNED**

- Booking No is the permanent external/business case key in the current Control Tower.
- Do not key history by spreadsheet row number or current row position.
- DMS/system refreshes UPSERT by Booking No.
- DMS/system refreshes must not overwrite staff-owned manual workflow fields.

**TARGET DMSv3**

- Deal UUID is canonical internal identity.
- DMS Booking/Retail Order ID and Booking No remain explicit external/source identities.
- One upstream DMS Booking must not create duplicate canonical Deals on replay.

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

A Booking is valid **with or without deposit**.

Therefore:

- deposit amount = 0 does not mean Lead;
- missing deposit does not demote Booking to Prospect;
- “New without Deposit” must not be modeled as Lead in DMSv3;
- deposit is a parallel financial fact.

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

## 11. Allocation rules

### Allocation fact

Use DMS Allocation Status / Allocation Date / Chassis evidence.

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

Registration evidence closes the current pre-registration queue, but does **not** mean the entire customer Deal is economically complete; Delivery and, where applicable, Disbursement follow.

## 13. Delivery rules

Delivery is a customer handover business event.

DMSv3 target requires an authoritative delivery command/event.

The exact mandatory readiness checklist remains partly OPEN POLICY, but the event must reference the canonical Deal and Vehicle and preserve actor/time/source evidence.

## 14. Disbursement rules

Disbursement means bank funds are released to FLC for financed cases.

Rules:

- Delivery and Disbursement are distinct events.
- A financed Deal may remain outstanding after Delivery.
- Non-loan Deals must not create fake bank-disbursement state.
- operational disbursement evidence does not itself authorize a Finance journal; Accounts/Finance contracts remain authoritative.

## 15. Payment-method normalization

Current mappings:

- CASH → Cash
- LOAN → Loan
- GOV → Government
- GOVERNMENT → Government

Current payment master also includes Trade-In.

Future payment-method-specific lifecycle behavior must be explicit and versioned.

## 16. Deposit controls

**BUSINESS CONFIRMED**

- Deposit is optional for Booking.
- Deposit does not decide Deal existence.
- Deposit receipts/refunds/forfeitures must become immutable Accounts-integrated events.
- Compatibility fields may remain during migration but cannot remain the long-term monetary ledger.

## 17. Date integrity

Current required ordering:

**Booking ≤ Loan Submission ≤ LOU ≤ Allocation ≤ Registration**

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

## 26. Direct-write architecture rule

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

## 27. Legacy contradictions that must not be carried forward

- “New without Deposit → Lead” is invalid for DMSv3.
- Deal Lead/Prospect duplication is invalid.
- Shipment/Receive as customer Deal stages is invalid.
- manual client stage drag/update as authority is invalid.
- legacy custom KPI “Pending LOU = delivered but LOU absent” conflicts with the governed current pre-registration process.
- names must not become person identity.
- current-row/dashboard cell positions must not become historical KPI sources.
