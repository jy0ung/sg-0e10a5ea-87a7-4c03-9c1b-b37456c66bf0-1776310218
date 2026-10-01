# 02 — KPI Definitions and Metrics

**Status:** CURRENT GOVERNED metric catalogue + DMSv3 migration contract  
**Evidence date:** 2026-10-01

This file defines the current business meaning of KPI metrics that must survive the DMSv3 refactor. Where current code contains generic or conflicting formulas, they are explicitly classified as legacy.

## 1. KPI design rules

Every DMSv3 KPI must have:

- stable metric key;
- business definition;
- grain;
- numerator/denominator where applicable;
- authoritative source;
- business/event date;
- scope dimensions;
- status/exclusion rules;
- target/SLA if governed;
- history behavior;
- owner;
- version/effective dates when definitions change.

Dashboards must not be the source of historical truth. Historical snapshots must be literal/static or regenerated from immutable events.

## 2. Prospect funnel KPIs

### New Prospects

**Definition:** count of DMS Prospects whose Prospect Created At belongs to the selected cohort period.

**Grain:** Prospect.

**Current filters:** Outlet, Sales Advisor, Model, time period.

### Converted from Lead

**Definition:** Prospect cohort members whose current Prospect record contains a Lead ID.

This is a current attribution indicator. It is not the same as counting Lead records created that day.

### Booked Prospects

**Definition:** Prospect cohort members whose current Prospect record contains a Booking ID / Close-Win booking evidence.

### Prospect → Booking Conversion %

Formula:

**Booked Prospects ÷ New Prospects × 100**

Denominator is the selected Prospect-created cohort.

Do not change the denominator to “Bookings created today” or current open Prospect population.

### Open Unbooked

Current Prospect rows that remain open and do not have Booking evidence.

### Recorded Follow-Ups

Sum/count of recorded Prospect follow-up activity in the selected scope.

### Average Follow-Ups / Prospect

**Recorded Follow-Ups ÷ Prospects**

### No Follow-Up

Open Prospect with zero recorded follow-up.

### No Next Follow-Up

Open Prospect with no Next Follow Up date.

### Schedule Overdue

Open Prospect whose Next Follow Up is before the as-of date.

### Rating SLA Overdue

For rated open Prospects:

- Hot: 3 days
- Warm: 7 days
- Cold: 7 days

Closed and Unrated Prospects are excluded from rating-SLA overdue.

## 3. Prospect cohort/event KPIs

Current 14-day Daily Prospect Conversion rows are **Creation Date cohorts**.

Metrics:

- Total New Prospects
- Total Converted from Lead
- Total Booked
- Overall Booking %
- Total Event Prospects
- Event Prospects Booked
- Event Booking %
- Total Non-Event Prospects
- Non-Event Prospects Booked
- Non-Event Booking %
- Event vs Non-Event Lift (percentage points)
- Event Share of Total Bookings
- Top Event / Campaign

### Event definition

Current rule:

- Event Prospect = DMS Event Name populated.
- Non-Event Prospect = DMS Event Name blank.

### Event Booking %

**Event Prospects Booked ÷ Total Event Prospects × 100**

### Non-Event Booking %

**Non-Event Prospects Booked ÷ Total Non-Event Prospects × 100**

### Event vs Non-Event Lift

**Event Booking % − Non-Event Booking %**

Expressed in percentage points.

This is an attribution/comparison indicator, **not proof that the event caused the Booking**.

### Event Share of Total Bookings

**Event Prospects Booked ÷ Total Booked for the same Creation Date**

First Source, Second Source and Channel are currently raw DMS codes and are not management-facing classifications until official mappings are confirmed.

## 4. Prospect backlog aging

Current unbooked/open aging bands:

- 0–3 days
- 4–7 days
- 8–14 days
- 15–30 days
- >30 days

Age should use Prospect Created At to the as-of date while the Prospect remains in the relevant open/unbooked scope.

## 5. Prospect outlet/model/SA performance

Current dimensions and measures:

### Outlet / Model

- Prospects
- Converted from Lead
- Booked
- Recorded Follow-Ups
- Booking %

### Sales Advisor

- Prospects
- Converted from Lead
- Booked
- Recorded Follow-Ups
- Booking %
- Average Follow-Ups / Prospect

DMSv3 must move SA attribution to canonical Employee ID after deterministic SA-code reconciliation. Names remain display snapshots.

## 6. Prospect demographic/market metrics

Current Customer Market Profile measures:

- Prospects
- Unique Customers with valid IC
- Booked
- Booking Conversion %
- Demographic Coverage %
- Median Age
- Largest Age Segment
- Best Booking Age Band
- model interest by age band
- event/campaign performance by age profile
- outlet market profile.

Current age bands:

- 18–24
- 25–34
- 35–44
- 45–54
- 55–64
- 65+
- Unknown

Current valid demographic profile rule:

- usable 12-digit IC;
- valid birth-date portion;
- age 18–100 at Prospect creation.

Current privacy control:

- IC values and derived DOB remain in hidden calculation/data layers;
- management dashboard exposes aggregated age bands and IC-derived sex classification;
- Best Booking Age Band requires at least 10 Prospects in selected scope.

DMSv3 analytics must preserve privacy minimization and should not expose raw IC merely to calculate a dashboard KPI.

## 7. Booking Control Tower KPIs

Current executive snapshot:

- Booking MTD
- C/F LOU — Opening
- MTD LOU Approved
- MTD Registered
- Weighted Registration Forecast
- Pending Loan
- Pending LOU
- Pending Allocation
- Pending Registration
- Open Pipeline

Current outlet monitoring:

- Booking MTD
- Loan Submitted
- Loan >4d
- LOU MTD
- C/F LOU
- LOU 8+
- Allocation Over SLA
- Pending Registration
- Registration MTD.

### Booking MTD — Official Proton Booking production

**Authoritative source:** Master RO / Proton Retail Order population.

**Definition:** count of official Proton Retail Orders whose governed Proton Booking/Retail Order business date falls in the selected calendar month, subject to the approved cancellation/deletion inclusion contract.

Rules:

- manually created FLC cases cannot add/remove official Booking MTD;
- a Booking that later registers/delivers still counts in the month it was officially booked;
- source freshness and exact drill-down population must be visible;
- created_at is not a substitute for the governed Proton Booking business date.

### FLC Cases Created MTD

This is a separate optional operational KPI.

**Definition:** count of local FLC Booking/Cases opened in the selected month.

It must never be labelled simply “Booking MTD” unless management explicitly changes the governed definition.

### New Official Bookings Today

Count of official Proton Retail Orders whose governed Booking business date is the snapshot date.

If the current Daily Snapshot retains the historical field name `new_bookings_today`, the source/definition must be versioned at cutover.

### Pending Loan

OPEN Booking whose current Control Tower stage = PENDING LOAN SUBMISSION.

### Loan Overdue / Loan >4d

OPEN Pending Loan case whose Booking→Loan age is 5+ days under the current warning=3, maximum=4 rule.

### Pending LOU

OPEN Booking whose current stage = PENDING LOU.

### LOU Approved Today / MTD

Use the effective LOU event date, not current stage-entry date.

### Pending Allocation

OPEN Booking whose current stage = PENDING ALLOCATION.

### Pending Registration

OPEN Booking whose current stage = PENDING REGISTRATION.

### Registration Today / MTD

Current authoritative source is **Master Inventory (OUTLET) REG DATE**.

Do not calculate enterprise Registration actual only from current Booking Register rows.

### Open Pipeline

Current OPEN lifecycle population. The lifecycle partition should reconcile:

Pending Loan + Pending LOU + Pending Allocation + Cash Review + Pending Registration = OPEN

subject to the current governed stage engine.

## 8. C/F LOU — Opening

Carry-forward LOU opening backlog is a **frozen monthly opening baseline**.

Current rule explicitly says not to derive it retrospectively from today's Booking Register because historical closure timing is incomplete.

DMSv3 should eventually derive future opening backlogs from immutable event history, but historical approved baselines must remain preserved.

## 9. Pending LOU aging KPI

Current bands:

- 0–1 = NEW
- 2–3 = GOOD
- 4–7 = ACTION
- 8+ = CRITICAL

These are management-controlled rules and must not be changed silently.

## 10. Allocation SLA metrics

Current targets:

- Normal = 3 days
- Contra / Redeem / Contra + Redeem = 5 days
- missing Allocation Type = no SLA; data gap

Do not classify missing Allocation Type using an invented 3-day default.

## 11. Registration SLA

Current management-approved SLA = **7 days**.

Pending Registration:

- ON TRACK through day 7
- OVERDUE from day 8.

## 12. Data/control KPIs

Current daily snapshot includes:

- Data / Control Issues
- SA Exceptions
- Production Status
- Source Rows
- Canonical Rows
- Report Rows
- Parity
- Stock Status
- Control Tower Health.

### Data / Control Issues

OPEN Booking with governed DQ Category != OK.

### SA Exceptions

OPEN Booking whose SA / Outlet Check != OK.

Transaction outlet must remain the historical Booking outlet.

## 13. Governed Daily KPI Snapshot fields

The current historical contract has 24 named fields:

1. snapshot_date
2. captured_at
3. ct_health
4. prod_status
5. source_rows
6. canonical_rows
7. report_rows
8. parity
9. open
10. pending_loan
11. loan_overdue
12. pending_lou
13. lou_4_7
14. lou_8_plus
15. pending_allocation
16. cash_review
17. pending_registration
18. data_control_issues
19. sa_exceptions
20. new_bookings_today
21. lou_approved_today
22. registered_today
23. stock_status
24. snapshot_type

History rule:

- live preview may recalculate;
- captured historical rows are literal/static;
- a historical Snapshot Date + Snapshot Type pair must be unique.

DMSv3 analytics should preferably regenerate these from immutable events, but old approved snapshot rows remain historical evidence and must never recalculate.

## 14. Registration forecast

Current forecast boundary:

- actual Registration is separate;
- only active DMS Retail Orders with a unique Inventory reconciliation may be weighted;
- vehicle must be unregistered;
- exactly one governed Inventory Focus Register stage;
- DMS-only cases remain visible but unweighted.

This is a deterministic-evidence rule, not a fuzzy matching rule.

## 15. Proton Target versus FLC Internal Target

Current target governance keeps these as two separate metrics.

They must never be collapsed into one “target.”

Target values are month/outlet governed inputs; actuals are event-based results.

## 16. Sales Advisor targets/actuals in UBS

Current implemented actuals contract:

- period scope uses sales_orders.booking_date;
- total_deals = number of orders in that Booking month;
- closed_deals = order_status delivered/completed;
- total_revenue = sum selling_price;
- Employee ID is canonical where resolved;
- unresolved legacy name-only rows remain unresolved instead of guessed.

DMSv3 migration should repoint actuals from legacy Sales Orders to canonical Booking/Deal events while preserving the same approved metric meaning or versioning the metric explicitly.

## 17. Auto Aging cycle-time KPIs

Current code defines seven cycle metrics:

| KPI | From | To | Default SLA |
|---|---|---|---:|
| BG → Delivery | BG DATE | DELIVERY DATE | 45 days |
| BG → Shipment ETD | BG DATE | SHIPMENT ETD PKG | 14 days |
| ETD → Outlet | SHIPMENT ETD PKG | RECEIVED BY OUTLET | 28 days |
| Outlet → Registration | RECEIVED BY OUTLET | REG DATE | 7 days |
| Registration → Delivery | REG DATE | DELIVERY DATE | 14 days |
| BG → Disbursement | BG DATE | DISB. DATE | 60 days |
| Delivery → Disbursement | DELIVERY DATE | DISB. DATE | 14 days |

These remain valuable legacy/operational metrics.

**Important:** BG DATE meaning is inconsistent across current artifacts. Do not reinterpret BG as Booking Date during DMSv3. See Open Policy Decisions.

## 18. Current Auto Aging field ownership

Current workbook-aligned ownership categories:

### STOCK IN

- branch
- VAA date
- model
- variant
- colour
- chassis
- dealer transfer price

### DEPOSIT PAYMENT

- payment method
- BG date

### FULL PAYMENT

- full payment type
- full payment date

### OUTLET ADMIN

- shipment
- shipment ETD / ETA
- outlet receipt
- contra/sola
- registration
- invoice
- OBR
- delivery
- disbursement
- remark
- commission payout

### SALES MANAGER

- Sales Advisor
- customer
- LOU

DMSv3 changes technical ownership where necessary, but the operational responsibility represented by these groups should be preserved or explicitly remapped.

## 19. KPI Definition Studio

Current repository has a generic versioned KPI catalogue:

- kpi_definitions
- kpi_role_defaults

It supports company override of global definitions and per-role curated KPI lists.

This is a useful **presentation/configuration layer**, but its formulas must not redefine governed Sales lifecycle metrics independently of this SOT.

## 20. Generic seeded Home KPIs — legacy/generic

Current seeds include:

- Vehicles in stock
- Aged >180 days
- Open sales orders
- Sales last 7 days
- New customers “MTD”

Known semantic limitations:

- Open sales orders is based on legacy Sales Order concepts.
- weekly revenue uses a rolling created-at window, not necessarily approved Booking business date.
- customers.new_this_month is described as MTD but seeded with a rolling now-30d formula.

These must not become DMSv3 canonical KPIs without correction/versioning.

## 21. Legacy custom-KPI presets

The older custom KPI engine includes presets such as:

- Total Bookings
- Total Booking Value
- Top Booking Branch
- Top Model Revenue
- Avg BG→Delivery
- Overdue Vehicles >45 days
- Pending Delivery
- P90 BG→Delivery
- Pending LOU
- Missing OBR
- Avg Registration Delay
- Pending Disbursement
- Avg Delivery→Disbursement
- Unpaid Commission
- Slowest Delivery Branch.

They are useful historical/reporting evidence, but they are not automatically authoritative.

Example conflict:

“Pending LOU” legacy preset currently means delivered vehicle with LOU missing, whereas the current Control Tower treats LOU as a pre-allocation/pre-registration blocker. DMSv3 must follow the governed workflow, not preserve this conflicting preset definition.

## 22. DMSv3 KPI source mapping

Target event/fact source:

| Metric family | DMSv3 authoritative event/fact |
|---|---|
| New Leads | DMS Lead created evidence |
| New Prospects | DMS Prospect created evidence |
| Prospect conversion | DMS Prospect → Booking provenance |
| Booking MTD | official Proton Retail Order / Master RO event population |
| FLC Cases Created MTD | canonical FLC Booking/Case creation event |
| Deposit metrics | Accounts-owned deposit/payment events |
| Loan submitted | Financing submission event |
| Loan approved/rejected | Financing decision event |
| LOU | Financing LOU event |
| Allocation | Inventory/Vehicle assignment event |
| Outlet receipt | Inventory lifecycle event |
| Registration | Registration/Inventory authoritative event |
| Delivery | Deal delivery/handover event |
| Disbursement | verified Financing/Accounts event |
| Completion | server-authoritative Deal completion event |
| Cancellation | Deal cancellation event |
| Commission eligibility | Commission engine reading canonical events |
| Daily history | event/read model or immutable captured snapshot |

The metric meaning must be preserved even as the physical source moves from Sheets/legacy tables into DMSv3 domain events.

## 23. FLC Master Report Plan — current requested KPI coverage

The current FLC Master Report Plan records these management/reporting requirements. They are requirements/evidence, not all finalized DMSv3 metric definitions.

### Stocks Overview

Requested coverage:

- Incoming
- Carry Forward
- Total in hand
- Floor stock
- Aging analysis
- OBR
- Vessel
- LOU → Disbursement context.

### Payment Status

Current requested labels include:

- CS
- CN
- TT
- Pending Full Payment.

The exact approved semantic expansion of CS/CN/TT is not established by the reviewed sources and is therefore OPEN POLICY for DMSv3 documentation.

### Loan & Disbursement Status

Requested coverage:

- Submission with Stock
- Submitted
- Rejected
- Pending Doc
- Allocated Stock
- Delivery
- Disbursement
- BG → Disbursement analysis.

### Registration Status

Requested coverage includes:

- Pending
- Deposit
- Agreement
- LOU
- EHAK
- OBR
- LOU Aging / Expiry.

These are reporting requirements, not evidence that each item should become a top-level Deal state.

### Booking Status

Requested coverage includes:

- Model / Variant / Colour
- QR
- Manual
- Loan approval confidence-rate analysis.

QR/Manual must not be promoted to canonical source classifications until their business definition/source mapping is documented.

## 24. Current Commission rule/metric contract

Current repository Commission calculation is backend-authoritative and Employee-backed.

A current calculated Commission candidate requires:

- Vehicle belongs to the company;
- Vehicle is not deleted;
- Vehicle has Delivery Date in the selected commission month;
- Vehicle owner resolves through Profile → Employee identity;
- a Commission Rule applies to Employee/global + Branch;
- if the rule has threshold_days, Vehicle BG→Delivery must be non-negative and <= threshold_days.

Current rule fields include:

- Employee-specific/global applicability;
- Branch applicability;
- rule name;
- threshold days;
- amount.

The calculated source snapshot stores:

- rule identity/name/version timestamp;
- Employee;
- Vehicle/chassis;
- branch;
- Delivery Date;
- BG→Delivery;
- amount.

Calculated source and amount become immutable.

Current operational transitions:

**pending → approved → paid**

Important:

- paid is currently an operational Commission status; it is not yet proof of a Payroll/Finance payout.
- current threshold logic depends on BG→Delivery, so the unresolved BG DATE semantic is material to future Commission convergence.
- DMSv3 must not change Commission eligibility indirectly by redefining BG or Delivery without an explicit Commission migration/version decision.


## 25. Delivery / Invoice Submission / Disbursement KPIs

The July Inventory Dashboard documented these useful lifecycle metrics. DMSv3 preserves the metric concepts while replacing legacy-field shortcuts with canonical event sources.

### Delivered MTD

**Definition:** count of authoritative Delivery/handover events whose actual Delivery Date falls in the selected month.

Delivered means physical handover of vehicle/keys with signed VDO evidence.

### Pending Delivery

Target definition:

authoritative Registration exists
+ Deal not cancelled/completed
+ authoritative Delivery does not yet exist.

Do not define this only from legacy blank columns after cutover.

### Pending Invoice Submission — financed cases

Financed Deal is delivered but the confirmed bank submission event has not occurred.

Bank submission event is based on the signed VDO + VSO/final-invoice evidence submitted to the financing institution.

Cash/non-loan Deals are excluded.

### Invoice Submitted

Financed Deal has the bank-submission event but actual bank credit has not yet been verified.

This is a financing/document milestone, not a universal top-level Deal stage.

### Pending Disbursement

Financed Deal has reached the applicable post-delivery bank-submission context but no Accounts-verified actual bank credit exists.

### Disbursed MTD

Count of **Accounts-verified bank-credit/disbursement events** whose actual credit/value date falls in the selected month.

Do not use a manually advanced Deal stage as disbursement truth.

### Delivery → Disbursement

Current legacy KPI target is 14 days.

The duration remains a valid analytical metric; whether 14 days remains the future governed SLA is tracked as an OPEN POLICY.

## 26. Stock KPI reconciliation with the July dashboard guide

The July KPI guide is retained as historical dashboard evidence, not the final authority where later confirmed rules exist.

### Free Stock

Legacy formula:

`FREE STOCK = YES`

DMSv3 authoritative definition:

**no effective Reservation + no active Allocation + otherwise operationally eligible under the governed stock policy.**

A legacy FREE STOCK flag may be shown during reconciliation but cannot authorize availability by itself.

### OBR / On Hands

Later baseline supersedes the July shorthand.

- **On Hands** = confirmed physical receipt evidence.
- **OBR** = customer-allocated vehicle not yet physically received.
- unallocated pre-receipt stock = In Transit.

### Forecast YES / 50-50 / NO

Legacy Forecast values remain historical evidence.

Target forecast must derive from:

- reconciled canonical Booking/Vehicle facts;
- current blockers/readiness;
- versioned management assumptions;
- source freshness;
- exact cohort lineage.

No legacy Forecast field becomes target truth automatically.

## 27. Lifecycle KPI dimensions are independent

Management may present a sequential funnel, but KPI populations must come from independent event/fact dimensions:

- Booking;
- Financing;
- Reservation;
- Allocation;
- Transfer;
- Registration;
- Delivery;
- Invoice Submission;
- Disbursement.

A row can violate expected chronology or contain a later physical fact while an earlier workflow defect remains open. KPI logic must preserve both the fact and the exception instead of forcing one status backward.

## 28. Historical acronym/term correction

For DMSv3 analytics:

- **D2D** means external-dealer transfer boundary, not Door-to-Door delivery.
- **OBR** follows the later established stock-control meaning above.
- **VAA Date** remains a procurement/vehicle-aging evidence date; do not equate it automatically to outlet receipt without the field-authority contract.
- **BG DATE** remains unresolved and must not be silently renamed Booking Date or Deposit Date.


## 29. July 2026 Inventory Dashboard KPI catalogue — migration reference

The July management-approved KPI guide remains part of the migration contract. Each metric below must either:

- be preserved with its approved meaning;
- be explicitly versioned to a corrected canonical definition; or
- be retired with an approved replacement.

It must not silently disappear during DMSv3 refactor.

### 29.1 New Incoming — This Month

Legacy key: `NEW_INCOMING_THIS_MONTH`

Historical definition:

count Vehicles across S1/S2/S3 whose VAA Date falls in the current calendar month.

Target treatment:

- retain the metric concept;
- do not finalize the canonical formula until VAA Date semantics/source authority are resolved;
- replace S1/S2/S3 dependence with canonical Vehicle/procurement facts.

### 29.2 Carry Forward

Legacy key: `CARRY_FORWARD_AGING_POOL`

Historical definition:

S1 Vehicles with valid chassis and VAA Date before the current month.

Target treatment:

- retain month-based Carry Forward concept;
- derive from canonical active stock + governed VAA/procurement date;
- do not depend on S1 row membership after cutover.

### 29.3 Inventory aging buckets

Historical VAA aging buckets:

- `AGING_0_30` = 0–30 days
- `AGING_31_60` = 31–60 days
- `AGING_61_90` = 61–90 days
- `AGING_90_PLUS` = 91+ days

Current legacy population = valid-chassis S1 rows.

Target treatment:

- retain bucket labels unless management versions them;
- use canonical in-scope stock population;
- use the confirmed VAA/procurement aging date after field-authority resolution;
- keep exact drill-down.

### 29.4 Free Stock

Legacy key: `FREE_STOCK`

Historical formula:

`FREE STOCK = YES`.

This formula is **superseded**.

DMSv3 availability:

**FREE = no effective Reservation + no active Allocation + operational eligibility under current stock policy.**

Preserve the legacy flag only for reconciliation/exception reporting.

### 29.5 Forecast YES / 50-50 / NO

Historical keys:

- `FORECAST_COLUMN_YES`
- `FORECAST_COLUMN_50_50`
- `FORECAST_COLUMN_NO`

Historical source: legacy Forecast column.

Target treatment:

- retain historical values as source observations;
- canonical forecast is derived from reconciled facts + versioned forecast/readiness policy;
- manager forecast is recorded separately from system projection;
- historical snapshots preserve what management saw.

### 29.6 Legacy Forecast Register / FOCUS REG labels

Historical labels include:

- PENDING SIGN AGREEMENT
- PENDING COMPLETE LOU T & C
- PENDING DEPOSIT
- PENDING REDEEM SOLA
- PENDING CONTRA SOLA
- PENDING EHAK
- CUSTOMER REJECTS OBR
- READY REGISTER (OBR)
- PENDING TENDER / BID NO
- PENDING CLEAR SABAH EKSAIS
- REGISTERED.

Target treatment:

- preserve source labels for migration/report comparison;
- map to canonical prerequisite/blocker facts only where deterministic;
- do not store one free-text Focus status as target truth;
- REGISTERED comes only from actual Registration fact, never readiness.

### 29.7 Loan Submission With Stock

Legacy key: `LOAN_SUBMISSION_WITH_STOCK`

Historical definition:

S1 Vehicles where `PENDING LOAN 1` is populated.

Target treatment:

define from canonical Financing + Vehicle/stock relationship rather than a populated legacy column. Preserve the legacy metric only until the canonical population is agreed and parity-tested.

### 29.8 Pending Registration

Legacy key: `PENDING_REGISTRATION`

Historical dashboard formula:

LOU present while REG DATE, DELIVERY DATE, DISB DATE and INVOICE DATE are blank.

This is a **legacy projection**, not the target eligibility rule.

Target Pending Registration should use canonical Deal/Vehicle + actual Registration absence + approved registration readiness/blocker model.

### 29.9 Registered MTD

Legacy key: `REGISTERED_MTD`

Historical definition:

REG DATE falls in current calendar month across S1/S2/S3.

Current governed authority:

Master Inventory / authoritative Registration fact population.

Target:

canonical actual Registration event after reconciliation/cutover.

### 29.10 Pending Delivery

Legacy key: `PENDING_DELIVERY`

Historical definition:

REG DATE exists, DELIVERY DATE and DISB DATE blank.

Target:

actual Registration exists + authoritative Delivery absent, subject to active/cancelled commercial-case rules.

### 29.11 Pending Disbursement

Legacy key: `PENDING_DISBURSEMENT`

Historical definition:

DELIVERY DATE and INVOICE DATE exist; DISB DATE blank.

Target financed definition:

authoritative Delivery exists
+ applicable bank-submission / Invoice Submitted context exists
+ no Accounts-verified bank credit/disbursement.

Cash/non-bank paths excluded.

### 29.12 Disbursed MTD

Legacy key: `DISBURSED_MTD`

Historical definition:

DISB DATE in current calendar month across S1/S2/S3.

Target:

Accounts-verified actual bank-credit/disbursement event using credit/value date.

### 29.13 Contra Sola RHB — Redeemed / Eligible

Legacy key: `CONTRA_SOLA_RHB_PENDING_WORKFLOW`

Historical numerator:

S2 rows with CONTRA SOLA = YES-RHB.

Historical denominator:

unique S1+S2 Vehicles whose FULL PAYMENT TYPE contains RHB.

Target treatment:

preserve the historical KPI for reconciliation until Contra/SOLA/payment-domain authority is fully migrated. Do not recreate the metric from bank name alone.

### 29.14 Contra Sola MBB — Redeemed / Eligible

Legacy key: `CONTRA_SOLA_MBB_PENDING_WORKFLOW`

Historical numerator:

S2 rows with CONTRA SOLA = YES-MBB.

Historical denominator:

unique S1+S2 Vehicles whose FULL PAYMENT TYPE contains MBB.

Same target treatment as RHB Contra Sola.

### 29.15 TT / CN — Pending Delivery

Legacy key: `TT_CN_NO_PENDING_WORKFLOW`

Historical definition:

S2 rows where CONTRA SOLA is blank/NO and FULL PAYMENT TYPE does not contain RHB/MBB.

This is retained as a legacy payment-workflow classification pending canonical payment-type/SOLA mapping.

### 29.16 TT / CN — Active Workflow

Legacy key: `TT_CN_NO_ACTIVE_WORKFLOW`

Historical definition:

S1+S2 rows under the same non-Contra/non-RHB/non-MBB condition.

Target treatment:

version rather than silently translating this into Cash/Loan status.

### 29.17 Pending Full Payment

Legacy key: `PENDING_FULL_PAYMENT`

Historical definition:

S1 rows where FULL PAYMENT DATE is blank.

Target:

derive customer-settlement/readiness from Accounts-owned receipts/payment allocation and the applicable workflow policy. Legacy FULL PAYMENT DATE remains evidence during reconciliation.

## 30. July lifecycle dashboard — reporting projection only

Historical dashboard sequence:

**Booking → Loan Submission → LOU Approved → Pending Registration → Pending Delivery → Pending Invoice Submission → Pending Disbursement**

This sequence remains useful as a management funnel visualization.

It is **not** a single canonical state machine.

DMSv3 metric cards/drill-down must derive each population from its owning facts and make source freshness/reconciliation visible.
