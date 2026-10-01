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

## 2. Payment-type lifecycle matrix

We need an explicit business matrix for:

- Loan
- Cash
- Government
- Trade-In
- any other/Multi cases.

For each type confirm:

- financing required?
- LOU required?
- customer full payment required before Registration?
- customer full payment required before Delivery?
- bank disbursement applicable?
- what constitutes Settlement/Completed?

Do not force Cash/Government/Trade-In through a Loan workflow.

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

## 5. Delivery readiness gates

Confirm whether Delivery requires all of:

- vehicle received at correct outlet;
- Registration complete;
- plate received;
- Insurance active;
- customer payment threshold satisfied;
- LOU/Financing milestone;
- approved documents;
- other handover checklist.

The schema intentionally derives readiness from owning domains.

## 6. Delivery before bank Disbursement

Current workflow includes Delivery then Disbursement, so this is clearly possible/expected in financed cases.

Still confirm:

- whether any bank/product requires Disbursement before Delivery;
- whether exceptions require approval;
- management escalation SLA after Delivery.

Current Auto Aging target Delivery→Disbursement is 14 days, but confirm whether that remains the DMSv3 management SLA.

## 7. Customer settlement gate for non-loan cases

For Cash/Government/Trade-In:

- when must customer/company settlement be complete?
- before Registration?
- before Delivery?
- before Completed only?

Do not derive policy from legacy Full Payment columns alone.

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

## 11. Manual UBS Booking creation

Decide whether production DMSv3 permits:

- only DMS-originated Booking;
- manual UBS Booking for exceptional cases;
- manual draft that must later reconcile to DMS;
- specific non-Proton/manual business path.

Do not let a generic “New Deal” form create an untraceable parallel Sales system.

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

## 15. Allocation model

Confirm:

- one active Vehicle allocation per Booking as normal rule?
- temporary reservation versus firm allocation?
- when allocation may change?
- approval for reallocation?
- D2D/transfer interaction?
- treatment of a DMS allocation that violates local LOU control.

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

## 18. Disbursement verification

Confirm what evidence makes disbursement “verified”:

- bank statement;
- DMS collection;
- Accounts receipt;
- Finance bank reconciliation;
- another source.

Operational Financing status and financial receipt must remain distinct even when correlated.

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

## 31. Master Report Plan abbreviations/classifications

The reviewed FLC Master Report Plan requests Payment Status labels:

- CS
- CN
- TT
- Pending Full Payment

and Booking/Registration planning labels such as:

- QR
- Manual
- EHAK.

The reviewed source does not provide a sufficiently precise official definition/mapping for every abbreviation.

Before DMSv3 creates enums/KPI codes from them, confirm:

- full business meaning;
- source field/code;
- owning domain;
- whether it is a status, document, payment method, source type or reporting-only label.

Do not infer these meanings from common industry usage.

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
