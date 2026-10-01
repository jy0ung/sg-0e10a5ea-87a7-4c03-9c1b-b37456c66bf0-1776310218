## DMSv3 Sales lifecycle source of truth

**Effective 2026-10-01:** all detailed Sales/DMS lifecycle, KPI, workflow-rule, source-ownership, target-schema and cutover work is governed by [DMSv3 Refactor Plan](DMSv3%20Refactor%20Plan/README.md). When an older Sales/Auto Aging/Deal workflow description conflicts with that folder, the DMSv3 SOT wins. Programme-wide identity, RLS, domain ownership, Finance and safety rules in this roadmap remain authoritative.

# FLC Unified Business Suite Roadmap

**Status:** Active execution roadmap (rebaselined 2026-09-27)
**Date:** 2026-09-22  
**Scope:** Fook Loi Unified Business Suite (UBS) across Platform, HRMS, Internal Requests, Sales, Inventory, Purchasing, Accounts, Finance, and Analytics.

## Purpose

FLC UBS is one internal business platform composed of independently owned business domains. The suite must feel unified to users while preserving clear data ownership, security boundaries, auditable state transitions, and replaceable implementations.

This roadmap does not authorize a big-bang rewrite. Existing production-proven services, migrations, RLS policies, workflows, and packages remain the foundation. New work should converge the current system toward the target model incrementally.

## Programme status — 2026-09-27

This roadmap and [programme #47](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/47) are the refactor control plane. The [identity migration map](BUSINESS_CORE_IDENTITY_MIGRATION_MAP_2026-09-23.md) defines identity contracts; the [reconciliation runbook](BUSINESS_CORE_IDENTITY_RECONCILIATION.md) defines measurement. Older implementation/gap assessments are historical when they disagree with these sources.

Statuses describe architectural convergence, not whether a module has existing features. **Not Started** means convergence has not been systematically executed; **In Progress** means implementation or evidence remains; **Exit Criteria Met** requires every stated exit criterion and its evidence. No epic currently has sufficient evidence for Exit Criteria Met.

| Epic | Status | Landed work / remaining exit evidence |
|---|---|---|
| 0 — Platform Safety | In Progress | Repository release, rollback and backup/restore automation landed. Admin Backup & Recovery has a manual encrypted export slice; provider destinations and restore remain. #48 still requires final production evidence and does not block Dev/UAT feature work. |
| 1 — Unified Business Core | In Progress | Employee/account separation, Deal ownership, Sales assignments, migration map and reconciliation pack landed. Authoritative full reconciliation is blocked by production schema lag. |
| 2 — HRMS | In Progress | Job Title, Department, Leave Type, Holiday, role authority, history preservation and atomic Sales assignments landed. Broader lifecycle contracts and exit evidence remain. |
| 3 — Workflow + Unified Inbox | In Progress | Canonical routing and atomic review landed. Assigned Internal Request approvals now reach the Inbox with matching reviewer ticket access. Wider aggregation and cross-domain outcome commands remain. |
| 4 — Internal Requests | In Progress | Canonical flow selection and HRMS-role review authority landed. Broader domain-command integration remains. |
| 5 — Sales + Inventory | In Progress | Employee-backed Deals, Vehicle import safeguards, and Employee-backed targets/reports (#94, PR #95) landed. Legacy identity reconciliation and production release remain separate. |
| 6 — Commission | In Progress | Employee-backed rules/records, guarded calculation and audited transitions landed. Rule catalogue, reversals and payout/Finance handoff still need UAT and implementation. |
| 7 — Purchasing | Not Started | Existing functionality; convergence not systematically executed. |
| 8 — Accounts | Not Started | Existing functionality; convergence not systematically executed. |
| 9 — Finance | Not Started | Existing functionality; convergence not systematically executed. |
| 10 — Unified Analytics | Not Started | Existing reports; canonical cross-domain read models remain. |

### Verified merge record, PRs #74–#93

Verified against `origin/main@3a0da12df47a61d1a8ee081d3a9e14af44ec873f` and GitHub on 2026-09-27. Gaps in numbering are issues, not missing merged PRs.

| PR | Merge | Contribution |
|---|---|---|
| #74 | `317fba7` | Canonical Approval Flow resolution and pin safety |
| #76 | `5a73286` | Atomic, concurrency-safe Internal Request review |
| #79 | `2556284` | Public Holiday authority |
| #81 | `5462064` | Employee history deletion protection |
| #83 | `859d5c4` | Approval UI follows HRMS roles |
| #84 | `d8ea61d` | Workflow implementation record |
| #85 | `1cfc8fa` | Atomic Employee/Sales assignment |
| #86 | `8f520ef` | Workforce integrity implementation record |
| #87 | `ec0c1f8` | P0 release-safety rebaseline |
| #88 | `c5f3153` | Encrypted backup SSH transport |
| #89 | `fb20a86` | Canonical Business Core identity map |
| #91 | `b7b6825` | Read-only identity reconciliation pack |
| #93 | `3a0da12` | Stop name-based Vehicle salesperson assignment |

### Current checkpoint and dependency order

[Web application UAT checkpoint](UBS_WEB_UAT_CHECKPOINT_2026-09-27.md) separates completed repository work, functional gaps and eventual production-infrastructure evidence. PRs #95–#97 are merged on `main`. The functional web application is now the priority; #48 production recovery evidence proceeds independently.

[Business Core reconciliation and Sales identity evidence](BUSINESS_CORE_RECONCILIATION_2026-09-27.md) records the measured limits and the implementation/rollout contract.

1. Rebaseline tracking and supersede contradictory architecture guidance.
2. Measure authoritative identity debt read-only; resolve schema prerequisites through a separately authorized release.
3. Implement Employee-backed targets and salesperson reports additively; validate in disposable infrastructure.
4. Rerun the full reconciliation on the compatible authoritative schema before production promotion.
5. Converge Commission identity, then introduce canonical Vehicle ownership with deterministic evidence.
6. Migrate remaining Profile workforce callers; physical FK hardening and compatibility retirement come last.

#48 remains open independently. Repository tests never stand in for production recovery or governance evidence; missing final production infrastructure must not stop Dev/UAT feature development.

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

**Objective:** Make production releases and recovery trustworthy while web application feature work continues on isolated Dev/UAT infrastructure.

Outcomes:
- production deploy verification cannot false-red after a successful promotion;
- production deploy requires an explicit release boundary instead of CI-green implying production permission;
- required database migrations/schema compatibility are checked before application promotion;
- database backup completes successfully and a restore drill is evidenced;
- branch/release governance is strengthened.

This remains a production release requirement. It proceeds in parallel with application implementation and does not gate ordinary Dev/UAT feature work. Provider-neutral [Admin Backup & Recovery](ADMIN_BACKUP_RECOVERY_PRODUCT.md) is a separate product capability.

### Epic 1 — Unified Business Core

**Audit baseline — 2026-09-23:** `docs/BUSINESS_CORE_IDENTITY_MIGRATION_MAP_2026-09-23.md` records the current-to-canonical identity map required by #49. It confirms Employee as workforce truth, Profile as account truth, module/HRMS-role assignments as separate authority relationships, Employee-backed Deal ownership, and the legacy `sales_advisors` table as compatibility only.

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

**Implementation record — 2026-09-22:**
- Employee hard-delete is now reserved for genuinely unused/erroneous workforce rows. Historical leave balances/requests, attendance, payroll items, and appraisal items use restrictive Employee ownership so deleting an Employee cannot erase HR history (PR #81, merge `5462064`).
- HRMS Employee creation and updates now use one database-owned atomic mutation command. When `primary_role='sales'`, the canonical Sales Advisor module assignment is active; when the role leaves Sales, that assignment is deactivated in the same transaction. Same-company Branch/manager/Department/Job Title references are validated before mutation (PR #85, merge `1cfc8fa`).
- The normal lifecycle for an Employee with business history is `active -> inactive/resigned`, not hard delete.
- Pending-invite/auth cleanup occurs only after the Employee deletion succeeds; linked active user accounts block hard delete. Live local-Supabase readiness passed **164/164** tests, including **6/6** dedicated Employee-history deletion cases.
- This integrity merge was not deployed to production as part of the refactor sequence.

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

**Implementation record — 2026-09-22:**
- Internal Request flow resolution now uses canonical Profile -> Employee workforce identity for Department authority, validates pinned flows, and resolves condition/match-priority precedence deterministically (PR #74, merge `317fba7`).
- Internal Request approval review is now one concurrency-safe database command across Decision, Instance, Ticket, and Activity state. Stale rendered Steps fail as an explicit `PT409` conflict instead of a retryable PostgreSQL serialization error (PR #76, merge `5a73286`).
- Workspace approval permission now follows the materialized specific Profile or active same-company HRMS Role assignment through Profile/Employee identity. App-level admin role is not approval authority (PR #83, merge `859d5c4`).
- The Inbox now obtains pending Internal Request approvals from a server-scoped reviewer query. Matching ticket RLS grants current reviewers access and retains read-only access for prior decision makers; the review command remains the sole decision write path.
- These merges were code/integrity changes only; no production deployment was performed as part of this refactor sequence.

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

**Implementation record — 2026-09-27:** Nullable Employee identity preserves unresolved historical Commission rows without name matching. New rules use active Sales Advisor Employee IDs. Commission-owned backend commands calculate idempotent delivery-month earnings with rule/source snapshots and audit entries, then guard approval/payment transitions. `paid` remains an operational state, not proof of payroll disbursement or Finance posting. See [Commission identity contract](COMMISSION_EMPLOYEE_IDENTITY_2026-09-27.md).

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

The architectural dependency sequence is:

```
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

Production Platform Safety (#48) runs in parallel; its final infrastructure evidence gates production promotion, not functional web-app implementation. Admin Backup & Recovery product capability is tracked in the [web UAT checkpoint](UBS_WEB_UAT_CHECKPOINT_2026-09-27.md).

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
