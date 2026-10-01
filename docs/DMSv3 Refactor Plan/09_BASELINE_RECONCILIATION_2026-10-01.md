# 09 — Baseline Reconciliation Log — 2026-10-01

**Purpose:** audit trail of how the initial DMSv3 SOT was reconciled against earlier FLC project baselines and evidence.

## 1. Sources revisited

Reconstruction reviewed:

- FLC Operations Platform PRD v1.1 Established Baseline, dated 2026-09-16;
- FLC Inventory Dashboard KPI Reference Guide v1.0, dated 2026-07-18;
- FLC Data Analysis project conversation decisions through 2026-10-01;
- historical project artifacts around reservation/allocation, registration and delivery;
- live Master Data / Master Booking & Stock / Master Report Plan evidence previously used to create the SOT;
- current UBS main at 52d72dae23f4d30a1e8fc0d529dabd9c939f8b57.

## 2. Exact historical file lookup result

The exact PRD/KPI filenames were not present as earlier Project conversation files under those names before the current upload.

The Project/Library does contain extensive earlier source artifacts from the clean-sheet DMS work, including:

- stock request/reservation/allocation implementation evidence;
- 3/7/3 reservation policy evidence;
- registration-readiness and actual-registration reconnaissance;
- delivery/disbursement reconnaissance;
- Master RO / Inventory / Control Tower reconciliation analysis;
- legacy Apps Script and workbook artifacts.

Therefore the baseline is reconstructable even though the exact prior exported PRD file was not retained in the Project file list under the same name.

## 3. Material corrections to the initial DMSv3 SOT

### R-01 — FLC Booking/Case vs Proton Retail Order

**Initial SOT:** treated Deal creation too closely as DMS Prospect/RO → Booking.

**Reconciled:** FLC Booking/Case is a separate local case that may exist before Proton creates the official Booking No.

Official Proton Booking/Retail Order is a later/upstream DMS event linked to the local case.

### R-02 — Booking MTD

**Initial SOT:** defined Booking MTD from generic Booking Date population.

**Reconciled:** official Booking MTD is the Master RO / Proton Retail Order population under the governed calendar and cancellation/deletion contract.

A local FLC Cases Created MTD metric must be separate if required.

### R-03 — Lead requirement

**Initial SOT:** diagram could imply Lead always precedes Prospect.

**Reconciled:** Lead is optional; Direct Prospect is first-class.

### R-04 — Reservation vs Allocation

**Initial target schema:** combined reservation/allocation too closely under deal_vehicle_assignments.

**Reconciled:** stock request, reservation, reservation terms, allocation, reallocation and waiting-for-stock demand are distinct transactional concepts.

### R-05 — Reservation policy

Added confirmed versioned 3/7/3 working-day hold terms, extension/pre-emption behavior and “expiry is not auto-release.”

### R-06 — Business calendar

Added Sabah-aware working calendar: Mon–Fri 08:00–17:00; Sat 08:00–13:00; Sun/holidays non-working.

### R-07 — Stock authority

Added manager-controlled authoritative allocation and SA/request separation.

### R-08 — Vehicle↔Booking cardinality

Clarified no permanent lifetime Vehicle.bookingId; allocation history represents sequential commercial control.

### R-09 — OBR

July KPI guide defined OBR as received-at-branch awaiting processing.

Later confirmed baseline defines OBR as customer-allocated but not yet physically received; received stock is On Hands.

Later baseline wins.

### R-10 — Free Stock

July KPI guide used FREE STOCK=YES.

Later confirmed baseline derives Free/Reserved/Allocated from authoritative stock-control facts.

Legacy flag becomes migration evidence only.

### R-11 — D2D acronym

July KPI guide used D2D as Door-to-Door delivery.

Later established DMS baseline uses D2D as the external-dealer transfer boundary.

DMSv3 uses the later definition.

### R-12 — Registration

Expanded target rules to preserve:

- readiness ≠ actual Registration;
- actual externally completed result;
- in-transit is not automatically a registration blocker;
- active allocation context;
- immutable corrections;
- PRE-REGISTER/sequential case behavior.

### R-13 — Cash

Initial SOT kept the cash customer-settlement gate open.

Reconciled confirmed rule:

**cash credit confirmation is required before Registration.**

Cash does not traverse bank Invoice Submitted/Disbursement.

### R-14 — Delivery payment rule

Initial SOT treated the payment gate as mostly open policy.

Reconciled confirmed rule:

- normal Delivery requires customer-payable cleared;
- Director exception may allow outstanding balance;
- outstanding amount remains visible.

Other non-financial delivery prerequisites can remain policy-driven.

### R-15 — Invoice Submitted

Added the financed post-delivery milestone:

signed VDO + VSO submitted to bank → Invoice Submitted.

This is a financing/document event, not a universal Deal stage.

### R-16 — Disbursement verification

Initial SOT asked which evidence verifies Disbursement.

Reconciled confirmed rule:

Accounts verifies actual bank-statement credit; Disbursement Date is actual credit/value date.

### R-17 — Official Receipt

Added confirmed rule:

OR only after confirmed credit; one OR per payment transaction.

### R-18 — Commercial terms

Added stronger rule that commercial terms are immutable recorded facts, not authorization to infer pricing/OTR/customer-payable formulas.

## 4. Historical KPI guide retained without becoming authority

The July KPI guide remains valuable for:

- stock aging and MTD terminology;
- legacy pipeline reporting;
- historical Forecast/Focus labels;
- Pending Delivery;
- Pending Invoice Submission;
- Pending Disbursement;
- Disbursed MTD;
- Contra/TT/CN legacy reporting.

But conflicting shorthand definitions are resolved by the later established baseline.

## 5. Historical technical architecture deliberately NOT imported

The historical PRD's Fastify/Prisma/PostgreSQL-18 modular-monolith implementation is not the current UBS repository.

No DMSv3 SOT change should force a framework/database-layer rewrite based on that old implementation.

The business rules have been reconciled into the current UBS architecture instead.

## 6. Result

After this reconciliation, the DMSv3 SOT should be read as:

**current FLC business baseline + current UBS technical architecture + additive migration from legacy sources.**

Not:

**a copy of the old flc-dmsv2 implementation.**
