# FLC Unified Business Suite Roadmap

**Status:** Architecture baseline  
**Date:** 2026-09-22  
**Scope:** Fook Loi Unified Business Suite (UBS) across Platform, HRMS, Internal Requests, Sales, Inventory, Purchasing, Accounts, Finance, and Analytics.

## Purpose

FLC UBS is one internal business platform composed of independently owned business domains. The suite must feel unified to users while preserving clear data ownership, security boundaries, auditable state transitions, and replaceable implementations.

This roadmap does not authorize a big-bang rewrite. Existing production-proven services, migrations, RLS policies, workflows, and packages remain the foundation. New work should converge the current system toward the target model incrementally.

## Product direction

The suite is organized around:

- **Platform:** Home, Unified Inbox, notifications, command search, audit, documents, workflow, and shared UX.
- **People / HRMS:** employees, organisation, leave, attendance, payroll, appraisal, and workforce lifecycle.
- **Internal Requests:** cross-department service requests, routing, SLA, collaboration, and resolution.
- **Sales / CRM:** leads/prospects, Deals as the canonical FLC sales workflow, customers, deal lifecycle, collections context, and sales performance.
- **Inventory:** vehicles, chassis, stock state, transfers, reservations, reconciliation, and aging.
- **Purchasing:** requisition intent, purchase orders, GRN, purchase invoices, 3-way match, and supplier lifecycle.
- **Accounts:** operational receivables/payables, collections, payments, aging, bank/cash reconciliation, and subledger operations.
- **Finance:** chart of accounts, journals, general ledger, posting rules, periods, close, trial balance, P&L, balance sheet, and cash flow.
- **Management / Analytics:** canonical read models and KPIs across every domain.

Proton DMS remains an upstream authority for Proton/HQ facts. FLC UBS is authoritative for local workflow, cross-domain operational state, management analytics, approvals, and FLC-owned business decisions.

## Programme principles

1. **One suite, bounded domains.** Modules share canonical identities and contracts; they do not directly own each other's state.
2. **HRMS is the People authority.** The canonical workforce entity is `employees`. A login account is not an employee record.
3. **Deals are the canonical local sales workflow.** Legacy Sales Orders remain compatibility/history only. DMS Retail Order data is upstream evidence, not a reason to revive the legacy Sales Order workflow.
4. **Internal Requests is the shared service-intake layer.** It owns request workflow metadata, not HR, finance, inventory, or other domain state.
5. **One approval runtime.** `approval_instances` and `approval_decisions` remain canonical.
6. **Modules own their writes.** Cross-domain changes happen through a domain service/RPC/command, never through page-level cross-table writes.
7. **Financial truth is backend-enforced.** Ledgers, posting, close, commission liabilities, payroll liabilities, and payment transitions are deterministic and auditable.
8. **Business events decouple domains.** The outbox/event layer is introduced incrementally for cross-domain reactions.
9. **Analytics reads canonical identities.** Employee, company, branch, customer, supplier, vehicle, and business date dimensions must be stable.
10. **No destructive early migration.** Add canonical relationships, reconcile, migrate callers, then retire compatibility fields later.

## Execution roadmap

### Epic 0 — Platform Safety

**Objective:** Make production releases and recovery trustworthy before broad feature work.

Outcomes:
- production deploy verification cannot false-red after a successful promotion;
- production deploy requires an explicit release boundary instead of CI-green implying production permission;
- required database migrations/schema compatibility are checked before application promotion;
- database backup completes successfully and a restore drill is evidenced;
- branch/release governance is strengthened.

This remains P0 and may proceed in parallel with documentation-only architecture work.

### Epic 1 — Unified Business Core

**Objective:** Establish the shared identity and organisation spine.

Canonical relationships:

```
Company
  -> Branch / Outlet
  -> Department / Cost Centre
  -> Employee
  -> optional User Account
```

Work:
- audit `companies`, `branches`, `departments`, `profiles`, `employees`, `job_titles`, `sales_advisors`;
- define canonical keys and compatibility fields;
- keep `profiles.employee_id` as the User -> Employee link;
- reconcile Sales Advisor records to `employees`;
- define data scope and approval authority separately from application role.

Exit criteria:
- each active workforce record has one canonical employee identity;
- application users can link to employees without duplicating HR identity;
- Sales can reference employee-backed advisor identity without changing HR-owned fields.

### Epic 2 — HRMS / People Domain

**Objective:** Make HRMS the authoritative workforce source while preserving dedicated HRMS web/mobile experiences.

Owns:
- employee identity and employment lifecycle;
- branch/department/job/manager assignments;
- HRMS organisational roles;
- attendance, leave, payroll, appraisal, employee documents.

Does not own:
- sales transactions;
- commission calculation rules;
- GL posting;
- purchasing or customer records.

Exit criteria:
- HRMS web and mobile consume the same package-owned services;
- employee changes propagate through explicit contracts;
- sensitive payroll/PII remains HRMS-authorized even though employee identity is shared.

### Epic 3 — Workflow Platform + Unified Inbox

**Objective:** Finish one cross-suite work orchestration layer.

Work:
- keep `approval_instances` / `approval_decisions` canonical;
- retire new usage of legacy `approval_requests`;
- define entity adapters/commands for approved outcomes;
- aggregate approvals, request actions, reconciliation tasks, and operational exceptions into one Inbox.

Exit criteria:
- new modules do not implement their own approval runtime;
- approver routing remains auditable and domain-neutral;
- approved decisions invoke domain-owned commands.

### Epic 4 — Internal Requests

**Objective:** Make Internal Requests the company-wide service-intake and collaboration platform.

Owns:
- request submission, categories, templates, routing, SLA, assignment, comments, attachments, collaboration, resolution.

Does not own:
- employee transfer state;
- financial posting;
- inventory transfer state;
- system authorization assignment;
- purchasing state.

Example:
`Employee Transfer Request -> approval -> HRMS command -> employee assignment update -> audit/event`.

### Epic 5 — Sales + Inventory Canonicalisation

**Objective:** Align local Deal workflow, DMS evidence, vehicle identity, customers, and employee-backed sales ownership.

Work:
- keep Deals canonical for new FLC sales workflow;
- treat DMS RO as upstream source evidence/source-of-truth where applicable;
- link advisor identity to Employee;
- make Vehicle/Chassis identity explicit;
- preserve DMS/raw lineage and reconciliation evidence;
- remove name-based joins from new analytics and automation.

Exit criteria:
- Deal -> Customer -> Vehicle -> Employee relationships are stable;
- DMS reconciliation is explainable;
- management reports use canonical IDs, not display-name matching.

### Epic 6 — Commission Engine

**Objective:** Produce auditable commission earnings from deterministic business rules.

Inputs may include:
- employee / sales assignment;
- Deal;
- vehicle/model/variant;
- branch;
- campaign/plan;
- margin or qualifying value;
- registration/delivery/disbursement milestone.

Output:
- immutable or append-only commission earning/accrual records with rule version and source references.

Commission calculation remains separate from payroll payment and GL posting.

### Epic 7 — Purchasing

**Objective:** Complete the purchase lifecycle.

Target flow:
`Requisition intent -> Purchase Order -> GRN -> Purchase Invoice -> 3-way match -> AP`.

Existing PO/GRN/PI work remains the base. Domain state transitions stay server-enforced.

### Epic 8 — Accounts

**Objective:** Own operational money movement and subledgers.

Owns:
- AR/AP;
- collections;
- customer/supplier payment lifecycle;
- aging;
- bank/cash reconciliation;
- operational settlement status.

Accounts is distinct from Finance: it answers who owes whom, what is due, what was paid, and what remains outstanding.

### Epic 9 — Finance

**Objective:** Own accounting truth.

Existing GL foundations remain authoritative building blocks:
- `accounts`;
- `accounting_periods`;
- `journal_entries`;
- `journal_entry_lines`;
- trial balance/posting RPCs.

Finance owns:
- chart of accounts;
- journals and posting rules;
- period close;
- trial balance;
- P&L;
- balance sheet;
- cash flow;
- accounting policy/versioned mappings.

Operational modules must not write GL rows directly. They emit/post through finance-owned backend contracts.

### Epic 10 — Unified Analytics

**Objective:** Build management reporting on canonical cross-domain read models.

Examples:
- sales by employee and branch;
- revenue/gross margin per advisor;
- commission cost and liability;
- payroll/personnel cost vs branch profitability;
- stock aging and inventory turn;
- AR/AP aging;
- purchasing spend;
- request SLA by department;
- attendance/leave alongside operational performance where appropriate and permitted.

Analytics may combine domains for reading, but must not become a write path back into transactional domains.

## Delivery order

The practical sequence is:

```
Platform Safety
    +
Architecture Baseline
    |
Unified Business Core
    |
HRMS / People
    |
Workflow + Unified Inbox
    |
Internal Requests
    |
Sales + Inventory
    |
Commission
    |
Purchasing
    |
Accounts
    |
Finance
    |
Unified Analytics
```

Some existing modules are already ahead of this sequence. The order describes **architectural convergence and dependency**, not a requirement to stop using capabilities already in production.

## Change-control rule

Every implementation phase must state:
- domain owner;
- canonical entity/ID;
- allowed read dependencies;
- allowed write path;
- migrations and backward compatibility;
- RLS/security impact;
- audit/event impact;
- tests and rollback;
- which compatibility fields or services are being retained or retired.

If a proposed change cannot answer those questions, it is not ready for implementation.
