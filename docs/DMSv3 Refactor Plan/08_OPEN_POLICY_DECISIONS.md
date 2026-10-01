# 08 — Open Policy Decisions

**Status:** OPEN POLICY register  
**Rule:** implementers must not guess these decisions.

The target schema is designed so these decisions can be made without another structural redesign.

## 1. Exact Financing gate before Registration

Current operating control requires confirmed LOU before normal Inventory linkage/allocation.

DMSv3 policy must confirm which Financing milestone permits progression toward Registration:

- Loan Approved;
- LOU Received;
- LOU Verified;
- another approved condition.

Until confirmed, preserve the current LOU-before-normal-allocation control in UAT logic.

## 2. Payment-type lifecycle matrix — partially resolved

Confirmed:

### Loan / financed

- financing/LOU applies;
- bank Invoice Submitted and Disbursement apply after Delivery;
- Disbursement requires Accounts-verified actual bank credit.

### Cash

- no fictitious Loan/LOU/EHAK/bank Invoice Submitted/Disbursement states;
- cash credit confirmation is required **before Registration**.

Still OPEN:

- Government flow;
- Trade-In flow;
- mixed/Multi flow;
- exact completion/settlement gates for those paths;
- any financed-product exception that legitimately changes the normal sequence.

Do not reopen the confirmed Cash/financed distinctions without a new owner decision.

## 3. BG DATE semantic conflict

Current artifacts disagree:

- UBS glossary describes BG DATE as **Bank Guarantee date — when dealership took financial responsibility for the vehicle**.
- Auto Aging column ownership groups payment_method + bg_date under **DEPOSIT PAYMENT / customer deposit / booking milestone**.
- KPI definitions use BG as the start of major cycle times.
- Current business workflow separately has Booking Date and Deposit/Booking Money.

Decision required:

**What exactly is BG DATE in FLC business terms?**

Until resolved:

- keep legacy BG KPI definitions unchanged;
- do not map BG DATE to Booking Date;
- do not map BG DATE to Deposit Date;
- do not use BG as the DMSv3 Deal creation date.

## 4. Deposit policy

Confirmed:

- deposit is optional for Booking.

Still to decide:

- which payment types normally require deposit;
- minimum/standard amount if any;
- who may waive it;
- refund conditions;
- forfeiture conditions;
- transfer to replacement/rebooking;
- whether approval is required;
- accounting treatment and receipt requirements.

These become policy/Accounts commands, not a Booking existence rule.

## 5. Delivery readiness gates — financial gate resolved, non-financial gates open

Confirmed:

- Delivered means physical handover of vehicle/keys + signed VDO.
- normal Delivery requires customer-payable amounts cleared.
- authenticated Director exception may allow Delivery with an outstanding balance; that balance remains visible.

Still OPEN as hard permanent prerequisites:

- exact physical-location/On-Hands requirement;
- Registration/plate requirement if any exception exists;
- Insurance requirement and required state;
- additional document checklist;
- other non-financial handover controls.

The schema intentionally derives readiness from owning domains.

## 6. Delivery / Invoice Submitted / bank Disbursement — sequence resolved, SLA open

Confirmed normal financed sequence:

**Delivery + signed VDO/VSO → Invoice Submitted → actual bank credit → Accounts verification → Disbursement**

Therefore Delivery before Disbursement is part of the established normal financed flow.

Still OPEN:

- whether a specific bank/product requires an alternate sequencing exception;
- exception approval policy if so;
- whether the current 14-day Delivery→Disbursement target remains the formal DMSv3 SLA.

## 7. Customer settlement gate for non-loan cases — Cash resolved

Confirmed Cash rule:

**cash credit confirmation is required before Registration.**

Still OPEN:

- Government settlement gate;
- Trade-In settlement gate;
- mixed-payment settlement gate;
- whether any additional Cash completion rule exists after Delivery beyond the already-confirmed pre-Registration credit requirement.

Do not derive unresolved policy from legacy Full Payment columns alone.

## 8. Insurance gate

Confirm:

- mandatory before Registration?
- mandatory before Delivery?
- which payment/product exceptions exist?
- cover note sufficient, or policy activation required?

## 9. Cancellation policy

Need controlled reason catalogue and approval rules.

Confirm:

- cancellation reasons;
- approval thresholds;
- who may cancel;
- deposit refund/forfeit/transfer logic;
- loan cancellation duties;
- allocated vehicle release;
- effect on SA targets/KPIs;
- rebooking behavior.

Cancellation must not be generic Completed.

## 10. Rebooking

Confirm whether the standard operational model is:

- cancel old Booking and create new Booking linked by rebooked_as; or
- amend the existing Booking under defined conditions.

The target schema supports explicit Deal relationships.

## 11. FLC Booking/Case creation front door — concept resolved, capability detail open

Confirmed:

- FLC Booking/Case is a first-class local case.
- it may be created before Proton creates an official Booking No.
- genuine purchase intent + sufficient information/documents establish the case.
- the official Proton Retail Order is linked later through deterministic reconciliation.
- deposit is not required.

Still OPEN:

- exact production capability/role permitted to create the FLC Case;
- which required information/documents constitute “sufficient” by product/payment type;
- whether every local Case must originate from an existing DMS Prospect or whether exceptional direct local case creation is permitted;
- deadline/escalation when a local Case has not yet acquired a Proton Retail Order.

Do not let a generic form create an untraceable parallel official-Proton booking.

## 12. Prospect access scope

Current web route restricts Lead Intake to Manager-and-up.

Operationally, DMS Sales Advisors may need to work their assigned Leads/Prospects.

Confirm:

- SA can see own?
- manager branch/team?
- cross-branch leadership scope?
- reassignment rules?

Target should use Employee + module assignment/data scope, not name.

## 13. Multiple financing applications

Target schema permits multiple bank applications.

Confirm operating expectations:

- simultaneous submissions allowed?
- maximum active applications?
- who selects final facility?
- what happens to unselected approvals?
- how “Multi” is represented.

## 14. LOU expiry/renewal

Master Report Plan references LOU Aging/Expiry.

Define:

- expiry basis/date;
- warning bands;
- renewal/reissue;
- whether expired LOU blocks allocation/registration/delivery.

## 15. Stock-control model — core resolved, edge policy open

Confirmed:

- Stock Request is distinct from Reservation and Allocation.
- one effective Reservation per chassis.
- default Reservation terms are versioned 3/7/3 working days by financing basis.
- expiry is a control point, not auto-release.
- one active Allocation per chassis.
- Sales Advisor may request; authorized management controls Allocation.
- Reallocation is explicit/auditable and preserves displaced history.
- no permanent lifetime Vehicle.bookingId.
- a DMS allocation that occurs before the local confirmed-LOU control is preserved as physical/source evidence and flagged as a control breach.

Still OPEN in the current UBS implementation context:

- exact capability/manager-resolution model to adopt after Employee/module-assignment convergence;
- detailed D2D interaction if external-dealer execution is later authorized;
- specific pre-emption priority beyond already confirmed policy;
- whether any product class legitimately permits more than one active Vehicle allocation per Deal.

## 16. Registration owner and command authority

Confirm which organizational role/team may:

- prepare;
- submit;
- record Registration;
- correct registration evidence.

The target DB does not assume app role = job title.

## 17. Registration “closed” meaning

Current pre-registration Control Tower treats Registered as closed for its action queue.

DMSv3 Deal continues through Delivery and Settlement/Disbursement.

Therefore “closed” must be qualified:

- registration-pipeline closed;
- customer Deal completed.

Future dashboards must not mix these populations.

## 18. Disbursement verification — resolved

Confirmed:

- actual bank-statement credit is the recognition evidence;
- Accounts verifies the credit;
- Disbursement Date is actual credit/value date;
- Financing operational status and Accounts receipt remain distinct but linked;
- OR follows confirmed credit under Accounts rules.

Remaining implementation detail belongs to reconciliation/statement-ingestion design, not business-definition uncertainty.

## 19. DMS collections → Accounts

Decide the controlled reconciliation policy:

- auto-match only exact deterministic cases?
- Accounts review?
- official receipt requirement?
- treatment of partial/multiple collections?
- treatment of reversals/chargebacks?

Raw DMS collection must not automatically become Finance truth.

## 20. Prospect Close-Lost status code

Current rule layer treats 95041005 as Close-Lost based on management mapping.

Confirm against official Proton codebook before hard-coding it as an immutable DMS integration semantic.

## 21. DMS First/Second Source and Channel mapping

Current management dashboards intentionally do not surface raw codes as approved labels.

Need official mapping/reference before DMSv3 Marketing analytics treats them as canonical dimensions.

Event Name is currently the staff-readable event/campaign dimension.

## 22. Demographic analytics governance

Current dashboards derive age and sex classification from IC and expose aggregates.

Confirm for DMSv3:

- permitted business users;
- retention;
- aggregation minimums;
- whether IC-derived sex remains approved;
- whether the analytics plugin/read model should store derived attributes or calculate them transiently.

## 23. BG-based KPI future

Once BG DATE meaning is resolved, decide whether:

- BG→Delivery remains a primary KPI;
- Booking→Delivery becomes a separate KPI;
- both remain;
- BG→Disbursement remains;
- targets 45/60 days remain.

Do not rename the legacy metric without versioning.

## 24. Delivery→Disbursement SLA

Current Auto Aging default target = 14 days.

Confirm if this is:

- formal management SLA;
- legacy dashboard target;
- bank/product dependent.

## 25. Registration→Delivery SLA

Current Auto Aging default = 14 days.

Confirm whether this remains a governed DMSv3 SLA.

## 26. Shipment KPIs

Current defaults:

- BG→Shipment ETD = 14 days
- ETD→Outlet = 28 days.

Confirm whether these are still business targets, model/logistics dependent, or legacy analytics only.

## 27. Commission eligibility

Commission implementation exists separately, but DMSv3 needs a stable qualifying event.

Confirm whether eligibility depends on:

- Delivery;
- Disbursement;
- full customer settlement;
- Registration;
- commission-specific rule combinations.

Do not use the old Vehicle commission_paid boolean as the future payout truth.

## 28. Prospect → Booking denominator freeze

Current Prospect dashboards use Creation Date cohorts and current Booking ID state.

Decide whether official historical conversion reporting should remain:

- cohort eventually-booked as of report date; or
- conversion within a fixed window (7/14/30 days); or
- both with separate KPI codes.

Changing this changes historical interpretation and must be versioned.

## 29. Current-open versus historical cohort metrics

Several current dashboards mix:

- current open state;
- Creation Date cohorts;
- monthly event counts.

DMSv3 should expose explicit metric names/grains so “today,” “MTD,” “current backlog,” and “cohort conversion” cannot be confused.

Exact management presentation remains to be designed.

## 30. Rule-approval process

Before changing an OPEN POLICY to governed:

1. document the business decision;
2. identify effective date;
3. identify affected payment types/outlets if scoped;
4. update this file and the relevant rule/KPI file;
5. update sales_workflow_policies seed/config;
6. add regression tests;
7. document migration treatment for historical records.

No policy becomes authoritative solely because code shipped first.

## 31. Master Report Plan abbreviations/classifications — partially resolved

The July KPI guide provides:

- **TT = Telegraphic Transfer**
- **CN = Cash-and-Carry**
- **Contra Sola** as the corresponding named financing/payment workflow concept.

Still OPEN:

- whether the Master Report Plan abbreviation **CS** is formally approved to mean Contra Sola in every reporting context;
- QR;
- Manual;
- any other shorthand not explicitly mapped by the source contract.

Before DMSv3 creates enums/KPI codes for unresolved abbreviations, confirm:

- full business meaning;
- source field/code;
- owning domain;
- whether it is a status, document, payment method, source type or reporting-only label.

Do not infer unresolved meanings from common industry usage.

## 32. Commission eligibility after DMSv3

Current backend Commission calculation qualifies by Delivery month and optional BG→Delivery threshold.

Because DMSv3 changes lifecycle ownership and BG is unresolved, management must confirm whether the future Commission rule catalogue should continue to use:

- Delivery Date;
- BG→Delivery threshold;
- Disbursement;
- full settlement;
- Registration;
- or another combination.

Until a separate Commission payout/Finance convergence decision is approved, preserve current calculation behavior and version any future rule change explicitly.


## 33. Official Booking MTD cancellation/deletion inclusion contract

Confirmed owner/population:

**Master RO / Proton Retail Orders**

Still OPEN:

- exact treatment of Proton `Deleted`, cancelled, replaced or rebooked Retail Orders in the official Booking MTD headline;
- whether management wants gross-created and net-valid metrics side by side;
- effective date for any revised inclusion rule.

Until approved, preserve source status and expose drill-down rather than silently excluding rows.

## 34. VAA Date exact semantics

Historical KPI documentation describes VAA Date as vehicle receipt/arrival, while later procurement/inventory work treats VAA as a procurement/aging milestone distinct from outlet receipt evidence.

Decision required:

- exact FLC/Proton business definition of VAA;
- source field;
- whether it represents Proton advice, dealer procurement date, shipment/arrival notice, physical arrival, or another milestone;
- which aging KPIs may legitimately use it.

Until resolved:

- preserve VAA as its own named source/business date;
- do not equate VAA to RECEIVED BY OUTLET;
- keep legacy VAA-based KPI names versioned.

## 35. Official Proton Booking creation responsibility/capability

Historical baseline says Sales Admin creates the official Proton Booking in DMS when ready.

Current UBS permission model does not yet have a final approved Sales Admin capability bundle.

Confirm:

- who performs/owns the DMS action operationally;
- who may attest/link completion in UBS;
- whether maker/checker is required;
- visibility/escalation for FLC Cases waiting on official Proton Booking.

## 36. Reservation policy implementation in current UBS

The 3/7/3 Reservation policy is a confirmed business baseline from the earlier clean-sheet work.

Before implementing it in current UBS, reconcile it against any existing current-repo Vehicle/stock-control schema to avoid creating duplicate stock authority.

This is an implementation-convergence question, not an open business rule.
