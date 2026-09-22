# FLC UBS Business Data Dictionary

**Status:** Architecture baseline  
**Date:** 2026-09-22

This dictionary defines the canonical meaning of shared business terms. It is intentionally conceptual; physical columns may retain legacy names during migration.

| Term | Canonical meaning | Source / owner | Important distinction |
|---|---|---|---|
| Company | FLC legal/operating entity used for tenancy and reporting scope | Platform/Core | Not a branch |
| Branch / Outlet | Operating location under a company | Platform/Core | Can differ from department/cost centre |
| Department | Organisational unit for workforce and management structure | HRMS | Not a security role |
| Employee | A person employed/engaged by FLC | HRMS | Can exist without a login |
| User / Profile | An authenticated application identity | Identity & Access | May link to one Employee |
| App Role | Coarse application capability grouping | Identity & Access | Not job title, HRMS role, or data scope |
| Data Scope | Which tenant/branch/self records a user may access | Identity & Access / RLS | Separate from app role |
| Job Title | HR position/title held by an employee | HRMS | Not an application role |
| HRMS Role | Organisational HR/workflow authority assignment | HRMS | Orthogonal to app role |
| Approval Authority | Who may approve a workflow step and under what routing rule | Workflow | Can depend on HRMS role, manager, amount, etc. |
| Customer | Canonical FLC customer party record | Sales/CRM | DMS records may be upstream evidence needing reconciliation |
| Deal | Canonical local FLC sales workflow | Sales | New sales workflow investments use Deals |
| Retail Order / RO | Proton DMS retail-order evidence/source record | DMS Integration | Upstream source evidence; not the local Deal entity |
| Sales Order | Legacy FLC workflow/history object | Sales compatibility | Read-only/deprecation path; do not revive for new workflow |
| Vehicle | Canonical FLC operational vehicle/stock record | Inventory/Vehicle | Chassis number is a strong business identifier but not a substitute for internal FK everywhere |
| Sales Advisor | Active Sales module assignment for an Employee | Sales + HRMS relationship | Do not duplicate the employee as a second person record; legacy `sales_advisors` rows are compatibility only |
| Supplier | External vendor party | Purchasing/Commercial master | Separate from customer |
| Purchase Order | Approved commitment to buy goods/services | Purchasing | Precedes GRN/invoice where applicable |
| GRN | Goods Receipt Note confirming receipt | Purchasing | Operational receipt, not supplier invoice |
| Purchase Invoice | Supplier billing document | Purchasing/AP handoff | Drives payable lifecycle after validation |
| Receivable | Amount owed to FLC | Accounts | Operational subledger, not GL itself |
| Payable | Amount FLC owes | Accounts | Operational subledger, not GL itself |
| Payment / Collection | Settlement event against receivable/payable | Accounts | Should be append-only/immutable where possible |
| Commission Rule | Versioned deterministic rule for earning commission | Commission | Must record effective version |
| Commission Earning | Calculated employee entitlement/accrual from qualifying business activity | Commission | Payment may occur later via payroll/AP |
| Payroll Item | Employee pay-period component | HRMS Payroll | May consume commission earnings but does not calculate Sales rules |
| GL Account | Finance chart-of-accounts account | Finance | Accounting classification |
| Journal Entry | Balanced accounting posting | Finance | Must be created through Finance posting contracts |
| Accounting Period | Finance period controlling posting/close | Finance | Not merely a report date filter |
| Internal Request | Employee/company service request | Internal Requests | Request workflow does not own the target domain state |
| Business Event | Durable notification that a committed business fact occurred | Platform Integration | Used for cross-domain reactions |
| Source Record | Raw/normalized evidence from an upstream system | Integration | Preserves provenance; may not be canonical FLC state |
| Business Date | Date the business event economically/operationally belongs to | Owning domain | May differ from created_at |
| Audit Event | Security/business trace of who changed or decided what | Audit | Not a replacement for domain history tables |

## Canonical identity rules

- Prefer stable internal IDs for relationships.
- Preserve external IDs such as DMS record IDs for lineage and reconciliation.
- Do not join operational domains by display names.
- NRIC, email, phone, chassis number, registration number, and staff code may assist matching but are not universal cross-domain foreign keys.
- Every important transactional record should carry company scope, timestamps, actor/source lineage, and business date where relevant.

## Current repository anchors

Current production code already contains important pieces of the target model:

- `employees` is the workforce record.
- `profiles.employee_id` links login identity to workforce identity.
- Sales Advisor runtime identity is derived from `employees` plus active `employee_module_assignments`; the legacy `sales_advisors` table remains compatibility/import data and has no Employee FK in the current generated schema.
- `deals` is the canonical local Sales workflow.
- `approval_instances` and `approval_decisions` are the canonical approval runtime.
- Finance foundations already include accounts, accounting periods, journal entries, journal entry lines, and posting/trial-balance RPCs.

The convergence programme should strengthen these relationships instead of introducing competing entities.
