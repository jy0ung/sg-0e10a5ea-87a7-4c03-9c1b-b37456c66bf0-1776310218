# DMSv3 Refactor Plan — Authoritative Source of Truth

**Status:** ACTIVE — authoritative for FLC Sales / DMS lifecycle refactor  
**Effective date:** 2026-10-01  
**Repository baseline reviewed:** main@52d72dae23f4d30a1e8fc0d529dabd9c939f8b57  
**Scope:** DMS Lead/Prospect, Booking, financing/LOU, vehicle allocation, Registration, Delivery, Disbursement, related KPI/rules, and migration into UBS.

## 1. Authority

This folder is the **single source of truth (SOT)** for future DMSv3 / Sales lifecycle design and refactor work.

Within this folder, [00_RECONSTRUCTED_BASELINE_2026-10-01.md](00_RECONSTRUCTED_BASELINE_2026-10-01.md) is the master business/product baseline. The remaining files are subordinate detailed contracts and must be read consistently with it.

The reconstructed baseline incorporates the established 2026-09-16 FLC Operations Platform PRD business rules while explicitly **not** importing that historical repository's Fastify/Prisma technical architecture into the current UBS implementation.

When a Sales/DMS lifecycle statement elsewhere in the repository conflicts with this folder, this folder wins unless a later approved change updates this folder in the same PR.

Older Sales gap assessments, Phase 5 pipeline plans, the current generic Deal-stage glossary, Auto Aging workbook assumptions, and legacy Sales Order behavior remain useful historical evidence but are **not authoritative for the DMSv3 target** when they conflict with this SOT.

The following programme-wide rules still remain authoritative and are incorporated here rather than replaced:

- Proton DMS is upstream authority for Proton/HQ facts.
- FLC UBS owns local workflow, FLC decisions, approvals, analytics, and cross-domain operational state.
- Deals are the canonical local FLC Sales workflow.
- Legacy Sales Orders are compatibility/history, not the future local workflow.
- Employee is canonical workforce identity; Profile is authenticated account identity.
- Modules own their writes.
- Accounts owns settlement ledgers; Finance owns journal truth.
- RLS is authoritative.
- Changes are additive first; compatibility fields are retired only after reconciliation and caller migration.

## 2. Evidence labels used in this SOT

Every rule must be understood as one of these classes:

| Label | Meaning |
|---|---|
| **CURRENT GOVERNED** | Explicitly encoded in the current FLC control workbooks or active production/UAT operating rules. |
| **BUSINESS CONFIRMED** | Explicitly confirmed by FLC management in this project. |
| **IMPLEMENTED** | Present in the current UBS repository. Implementation does not automatically mean the business design is correct. |
| **TARGET DMSv3** | Approved direction for the refactor; additive implementation and reconciliation are still required. |
| **OPEN POLICY** | Business decision still required. Implementers must not guess it. |
| **LEGACY / COMPATIBILITY** | Historical logic/data retained for reconciliation or backward compatibility; not a new-write authority. |

## 3. Current lifecycle in one line

The reconstructed FLC operating model is:

**DMS Lead or Direct Prospect → FLC Booking/Case → Official Proton Retail Order → Financing/LOU where applicable → Stock Request/Reservation/Allocation → Registration → Delivery → Invoice Submitted where financed → Disbursement/Settlement**

The current spreadsheet Control Tower is a narrower operational projection over part of that lifecycle.

Important nuance:

- Lead is optional; a Direct Prospect is valid.
- Lead and Prospect source facts are DMS-owned.
- FLC Booking/Case and Official Proton Booking/Retail Order are distinct concepts.
- Booking is valid **with or without deposit**.
- Official Booking MTD is the governed Proton Retail Order population from Master RO, not the local FLC-case count.
- Current Control Tower uses LOU and Allocation as operational blocker stages.
- Registration is an authoritative vehicle/registration fact, not merely a Booking Register label.
- Delivery and Disbursement continue after Registration even though the current pre-registration Control Tower treats Registered/Delivered as closed for that queue.
- Cash/non-loan cases must not be forced through fake loan or bank-disbursement milestones.

## 4. DMSv3 normalized lifecycle

DMSv3 preserves every important current milestone but separates ownership correctly:

**DMS Lead / Direct Prospect → FLC Booking/Case → Proton Retail Order reconciliation → Financing/Payment → Stock Control → Registration → Delivery → Settlement/Disbursement → Completed**

Parallel sub-workflows:

- Financing: submission, decision, LOU, selected facility, disbursement.
- Stock control: stock request, reservation, reservation terms, allocation, reallocation and Waiting-for-Stock/LNS.
- Vehicle: shipment, outlet receipt, transfer and physical-state evidence.
- Registration: pending, submitted, registered, plate/document completion.
- Insurance: cover note/policy.
- Payments: optional booking deposit, customer receipts, bank proceeds.
- Inventory/stock readiness.
- Cancellation/rebooking.

LOU, Allocation, Shipment and Outlet Receipt remain important business milestones; they are not discarded. They move out of a single overloaded Deal.stage field into their owning sub-workflows.

## 5. File map

0. [00_RECONSTRUCTED_BASELINE_2026-10-01.md](00_RECONSTRUCTED_BASELINE_2026-10-01.md)  
   Master reconstructed business/product baseline and precedence rules.

1. [01_CURRENT_WORKFLOW.md](01_CURRENT_WORKFLOW.md)  
   Current governed FLC process as evidenced by DMS, Master Data and Master Booking & Stock.

2. [02_KPI_DEFINITIONS_AND_METRICS.md](02_KPI_DEFINITIONS_AND_METRICS.md)  
   Current KPI definitions, formulas, cohorts, SLA thresholds, targets, Auto Aging metrics and migration treatment.

3. [03_BUSINESS_RULES_AND_CONTROLS.md](03_BUSINESS_RULES_AND_CONTROLS.md)  
   Workflow rules, identity, aging, date integrity, allocation, registration, action queue, data quality and source freshness.

4. [04_SOURCE_OF_TRUTH_AND_OWNERSHIP.md](04_SOURCE_OF_TRUTH_AND_OWNERSHIP.md)  
   Which system/domain owns each business fact and how DMS, UBS, Inventory, Accounts, Finance and HRMS interact.

5. [05_TARGET_LIFECYCLE_AND_SCHEMA.md](05_TARGET_LIFECYCLE_AND_SCHEMA.md)  
   DMSv3 target domain model and database contract.

6. [06_MIGRATION_AND_CUTOVER_PLAN.md](06_MIGRATION_AND_CUTOVER_PLAN.md)  
   Additive implementation sequence, reconciliation gates and cutover rules.

7. [07_EVIDENCE_REGISTER.md](07_EVIDENCE_REGISTER.md)  
   Repository and Google Sheets evidence reviewed to create this SOT.

8. [08_OPEN_POLICY_DECISIONS.md](08_OPEN_POLICY_DECISIONS.md)  
   Business questions that are intentionally unresolved and must not be invented during implementation.

9. [09_BASELINE_RECONCILIATION_2026-10-01.md](09_BASELINE_RECONCILIATION_2026-10-01.md)  
   Audit log of the reconstruction and corrections made to the initial DMSv3 SOT.

## 6. Mandatory change-control rule

Any future PR that changes one of the following must update the relevant file in this folder in the **same PR**:

- lifecycle meaning or state transition;
- KPI definition or formula;
- SLA/aging threshold;
- source-of-truth ownership;
- DMS status/code mapping;
- Booking identity;
- financing/LOU rule;
- vehicle allocation gate;
- Registration rule;
- Delivery or Disbursement prerequisite;
- deposit/payment rule;
- cancellation/rebooking rule;
- canonical identity relationship;
- migration/cutover contract.

A code change without the SOT update is incomplete.

## 7. Implementation-agent instruction

For future DMSv3 / Sales lifecycle work:

1. Read this README, `00_RECONSTRUCTED_BASELINE_2026-10-01.md`, and all directly relevant files in this folder first.
2. Refresh live main and compare code to this SOT.
3. Treat current spreadsheets as evidence of the current operating process, not as the target runtime architecture.
4. Do not restore deprecated Deal stages or legacy Sales Order authority because older files mention them.
5. Do not invent an OPEN POLICY.
6. Preserve old data until reconciliation proves the new contract.
7. Build small, reviewable PRs with live disposable tests and no production mutation.

## 8. Important distinction: workbook evidence versus future runtime authority

The connected FLC Google Sheets are highly valuable evidence of the **current governed business process**, KPI definitions, thresholds and exceptions.

They are not the future DMSv3 runtime authority.

The target architecture remains:

**DMS raw evidence → deterministic reconciliation → canonical UBS domain state → event/read models → analytics**

Google Sheets must not become a silent fallback source after DMSv3 cutover.
