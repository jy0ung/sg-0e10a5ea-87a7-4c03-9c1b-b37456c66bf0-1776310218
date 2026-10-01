# 07 — Evidence Register

**Status:** evidence index for the DMSv3 SOT  
**Review date:** 2026-10-01  
**Repository baseline:** main@e0c2da3add7e2f80364173d9df6efc8e58e4b497

No individual customer sample values are reproduced in this SOT. Evidence extraction is limited to structure, definitions, rules, formulas and aggregated metrics.

## 1. Business-confirmed project decisions

Confirmed in the FLC Data Analysis project:

1. Lead comes from DMS.
2. Prospect comes from DMS.
3. Customer lifecycle continues:
   DMS Lead → DMS Prospect → Booking → Loan Submission → Registration → Delivery → Disbursement.
4. Booking may be **with or without deposit**.
5. The current lifecycle should be redesigned/refactored rather than preserving the generic 11-stage Deal model.
6. Target schema should be designed before implementation to avoid schema-by-slice drift.

These decisions are encoded in this SOT.

## 2. Live Google Sheets evidence

### A. FLC Master Report Plan

Spreadsheet ID:

**1Lx3Jm4rGxVWj1ZsSEFn5oUo8q9aiP5iXqwdn7WRgYa8**

Reviewed tab:

- Overview

Evidence used:

- planned Stocks Overview;
- Payment Status;
- Loan & Disbursement Status;
- Registration Status;
- Booking Status;
- current dashboard implementation maturity notes.

### B. Master Data

Spreadsheet ID:

**1YX03mdetesKXYvnYQ4OWC0rCyOBcq_gAO3D513NX5cA**

Reviewed metadata and relevant tabs:

- Master Leads (DMS)
- Master Prospects (DMS)
- Prospects Dashboard
- REF - Prospect Rating Rules
- Customer Market Profile
- Master RO (DMS)
- Master Inventory (OUTLET)
- Disbursement
- Stocks
- REF - Sales Advisors
- related hidden calculation/reference layers.

Evidence used:

#### Master Leads (DMS)

- DMS Lead fields and source dimensions;
- SA fields;
- model/variant/colour intent;
- Event/source dimensions;
- lead creation/conversion/assignment dates.

#### Master Prospects (DMS)

- Prospect Code;
- Lead ID;
- Booking ID;
- status/progress/rating codes;
- SA Code;
- Event/source;
- follow-up count/dates;
- Booking Money;
- created date.

#### Prospects Dashboard

- Prospect cohort definitions;
- Prospect→Booking conversion;
- event/non-event attribution;
- Outlet/Model/SA metrics;
- unbooked aging;
- action exceptions;
- follow-up command centre;
- event/campaign performance.

#### REF - Prospect Rating Rules

- Hot/Warm/Cold mappings;
- 3/7/7-day SLA;
- open/closed status mappings;
- Close-Win/Close-Lost management mapping.

#### Customer Market Profile

- demographic KPI definitions;
- age bands;
- conversion by age/model/event;
- demographic coverage;
- IC/DOB privacy/quality rules.

#### Master Inventory (OUTLET)

Used indirectly through the governed Registration Actual layer as the authoritative Registration fact source.

### C. Master Booking & Stock

Spreadsheet ID:

**1JeqUl0ojTbcedEo1ykv7yaaRgcBLXu3mFEY1ord3X_w**

Relevant tabs reviewed:

- UAT - Control Tower
- UAT - Settings
- UAT - Operating Guide
- UAT - Data Contract
- UAT - Daily KPI Snapshot
- UAT - Acceptance Tests
- UAT - Registration Actual
- UAT - Forecast Cohorts
- LOU Summary
- Booking Report
- Booking Derived Status DB
- UAT - Booking Register metadata
- UAT - Action Queue metadata
- UAT - SA Performance metadata
- UAT - Target Governance metadata
- Booking Manual Updates DB metadata.

Evidence used:

#### UAT - Control Tower

- current lifecycle headline;
- company/outlet KPIs;
- Pending LOU aging and actions;
- management attention queue.

#### UAT - Settings

- Booking→Loan warning/max;
- LOU aging bands;
- Allocation 3/5-day SLA;
- Registration 7-day SLA;
- controlled status/bank lists;
- DMS UPSERT/manual-write separation.

#### UAT - Operating Guide

- Booking No identity;
- current physical-stage precedence;
- pre-LOU allocation breach;
- date integrity;
- Inventory boundary;
- SA identity/outlet preservation;
- Action Queue priority;
- freshness model;
- active/closed treatment.

#### UAT - Data Contract

- 24 historical snapshot field definitions;
- authoritative source/grain;
- history rules;
- C/F LOU opening baseline.

#### UAT - Daily KPI Snapshot

- live preview versus static history;
- current daily metric vocabulary.

#### UAT - Registration Actual

Explicit rule:

> authoritative Registration event = Master Data → Master Inventory (OUTLET) → REG DATE.

#### UAT - Forecast Cohorts

- unique RO↔Inventory reconciliation requirement;
- DMS-only rows visible but unweighted;
- actual Registration separated from forecast.

#### LOU Summary

- current normalized loan/LOU categories;
- rejection reason categories;
- Cash/New/Pending Approval mapping notes.

#### UAT - Acceptance Tests

Used as a **rule/regression inventory**, not as proof that the workbook is defect-free.

The sheet contains active PASS/FAIL/ACTION/BLOCKED checks. Therefore:

- its expected/control definitions are valuable evidence;
- current spreadsheet outputs must not be assumed correct merely because a formula exists;
- DMSv3 should automate the intended control and reconcile the actual result.

## 3. Repository evidence — architecture

### docs/UNIFIED_BUSINESS_SUITE_ROADMAP.md

Evidence:

- Deals canonical local Sales workflow;
- DMS upstream authority;
- modules own writes;
- Employee/Profile separation;
- Finance truth;
- additive convergence.

### docs/BUSINESS_DATA_DICTIONARY.md

Evidence:

- Customer;
- Deal;
- DMS Retail Order;
- legacy Sales Order;
- Vehicle;
- Sales Advisor;
- Business Date;
- Source Record;
- Payment/Collection definitions.

### docs/DOMAIN_OWNERSHIP_MATRIX.md

Evidence:

- authoritative domain boundaries for Deal, DMS, Vehicle, Employee, Accounts, Finance, Commission, Workflow and Analytics.

## 4. Repository evidence — current Sales/DMS implementation

### supabase/migrations/20260510120000_dms_legacy_sync_foundation.sql

Evidence:

- sync_runs;
- dms_raw_sales_orders;
- dms_raw_vehicle_stock;
- dms_raw_collections;
- dms_raw_order_vehicle_matches;
- dms_raw_deliveries;
- dms_raw_leads;
- dms_raw_prospects;
- SOA/master-data staging;
- reconciliation boundaries.

### supabase/migrations/20260511000000_dms_normalizer_contracts.sql

Evidence:

- per-field source authority;
- overwrite rules;
- DMS vs UBS-local distinctions;
- conflict-review pattern.

### supabase/migrations/20260525200000_phase3f_lead_intake.sql

Evidence:

- DMS Lead/Prospect unified feed;
- local follow-up notes;
- explicit statement that conversion is a separate flow;
- current manual handoff behavior.

### supabase/migrations/20260621000000_deal_lifecycle.sql

Evidence:

- existing 11-stage Deal model;
- deal_loan;
- deal_insurance;
- deal_registration;
- direct same-company RLS write posture.

### supabase/migrations/20260621010000_deal_legacy_migration.sql

Evidence:

- legacy order→Deal mappings;
- known incorrect “New without Deposit → lead” interpretation for DMSv3;
- old completion/status migration semantics.

### src/services/dealService.ts

Evidence:

- client/service stage transition table;
- direct Deal update;
- direct loan/registration status updates;
- current responsible-party/action labels.

### src/pages/sales/LeadIntakeDetail.tsx

Evidence:

- current DMS Lead/Prospect detail;
- local follow-ups;
- “Convert to Sales Order” navigation handoff.

### src/pages/sales/NewDeal.tsx

Evidence:

- new Deal currently starts as Lead;
- manual customer/commercial entry;
- current deposit field.

## 5. Repository evidence — KPI/rules

### src/data/kpi-definitions.ts

Seven current Auto Aging cycle KPI definitions and default SLAs.

### src/config/autoAgingColumnOwners.ts

Five operational owner groups:

- Stock In
- Deposit Payment
- Full Payment
- Outlet Admin
- Sales Manager.

### src/config/autoAgingFieldLabels.ts

Canonical display labels for current Auto Aging lifecycle fields.

### src/lib/glossary.ts

Current generic Deal/Vehicle/Finance term definitions.

Where the glossary conflicts with this SOT, this SOT wins for DMSv3.

### supabase/migrations/20260526000000_phase4b_role_aware_home.sql

Evidence:

- kpi_definitions;
- kpi_role_defaults;
- formula JSONB concept;
- initial generic KPI seeds.

### apps/hrms-web/src/lib/customKpiFormula.ts

Historical/secondary KPI formula engine and preset catalogue.

Useful as evidence of metrics already used, but not the DMSv3 authority when a preset conflicts with current governed rules.

### supabase/migrations/20260927090000_sales_target_employee_identity.sql

Evidence:

- Employee-backed Sales target identity;
- booking-date period;
- current total_deals/closed_deals/revenue actuals;
- no name-based identity inference.

### supabase/migrations/20260416000001_migration_soft_delete_and_mappings.sql

Evidence:

- current payment-method mappings:
  Cash, Loan, Government.

### supabase/migrations/20260416200001_migration_phase10_remaining_gaps.sql

Evidence:

- payment-type master including Cash, Loan, Government, Trade-In.

## 6. Known evidence limitations

### Apps Script source

The current workbook Operating Guide notes that bound Apps Script source is not exposed through the Sheets connector.

Therefore this SOT does not claim to have inspected every script that republishes current caches/stock.

Any script migration must separately verify it preserves:

- Booking No keying;
- manual/system field ownership;
- source freshness;
- current mapping/controls.

### Official DMS codebook

Some mappings are management-approved based on observed DMS data but not yet independently confirmed against an official Proton codebook.

Examples include status 95041005.

Do not generalize observed codes beyond documented evidence.

### First Source / Second Source / Channel

Current dashboard intentionally avoids presenting raw codes as official management classifications until mappings are confirmed.

### BG DATE

Current code artifacts conflict on BG DATE semantics.

See 08_OPEN_POLICY_DECISIONS.md.

## 7. Evidence refresh rule

Before implementing a DMSv3 slice:

1. refresh repository main;
2. inspect this SOT;
3. refresh only the live sources relevant to the slice;
4. record any business-rule change in this folder;
5. do not silently replace a rule because a current spreadsheet formula is broken.

Current source defects and business definitions are different things.
