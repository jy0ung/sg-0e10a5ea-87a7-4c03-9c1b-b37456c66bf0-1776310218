# Domain Ownership Matrix

**Status:** Architecture baseline  
**Date:** 2026-09-22

This document defines which FLC UBS domain is authoritative for each major business concept and how other domains may interact with it.

| Entity / capability | Authoritative domain | Canonical identity / state | Other domains may read | Other domains may write |
|---|---|---|---|---|
| Company | Platform / Core | `company_id` | All scoped modules | Only Core/Admin contracts |
| Branch / Outlet | Platform / Core | `branch_id` | All scoped modules | Only Core/Admin contracts |
| Department | HRMS / People | `department_id` | Workflow, Requests, Analytics | HRMS/Admin contracts only |
| Employee | HRMS / People | `employee_id` | Sales, Requests, Workflow, Payroll, Analytics | HRMS contracts only |
| User Account / Profile | Identity & Access | `profile_id/auth user id` | Modules needing login identity | Auth/Admin contracts only |
| App Role / Data Scope | Identity & Access | role/scope assignment | Route UX + RLS helpers | Auth/Admin contracts only |
| HRMS organisational role | HRMS / People | HRMS role assignment | Workflow, HRMS UX | HRMS contracts only |
| Approval runtime | Workflow | `approval_instance_id` | Domain adapters, Inbox | Workflow engine only |
| Internal Request | Internal Requests | `ticket/request id` | Workflow, Analytics | Requests service only |
| Customer | Sales / CRM | `customer_id` | Accounts, Analytics, DMS reconciliation | Sales/customer contracts |
| Deal | Sales / CRM | `deal_id` | Inventory, Accounts, Commission, Analytics | Sales contracts only |
| DMS Retail Order evidence | Integration / DMS | source record identity | Sales, Reconciliation, Analytics | Integration pipeline only |
| Vehicle / Chassis | Inventory / Vehicle domain | `vehicle_id` + chassis identity | Sales, Accounts, Commission, Analytics | Inventory/vehicle contracts |
| Sales Advisor assignment | Sales + HRMS relationship | advisor record linked to `employee_id` | Sales, Commission, Analytics | Sales assignment contract; HR data remains HRMS-owned |
| Commission Rule | Commission domain | versioned rule id | Sales, Payroll, Finance | Commission contracts only |
| Commission Earning | Commission domain | earning/accrual id | HRMS Payroll, Accounts, Finance, Analytics | Commission engine only |
| Supplier | Purchasing / Commercial master | `supplier_id` | Accounts, Finance, Analytics | Purchasing/Admin master-data contract |
| Purchase Order | Purchasing | `purchase_order_id` | Accounts, Finance, Analytics | Purchasing contracts only |
| GRN | Purchasing | `grn_id` | Accounts, Finance | Purchasing contracts only |
| Purchase Invoice | Purchasing / AP handoff | purchase invoice id | Accounts, Finance | Purchasing/AP contracts only |
| AR / customer settlement | Accounts | receivable/payment identity | Sales, Finance, Analytics | Accounts contracts only |
| AP / supplier settlement | Accounts | payable/payment identity | Purchasing, Finance, Analytics | Accounts contracts only |
| GL Account | Finance | account id | Accounts, Reporting | Finance contracts only |
| Journal Entry | Finance | journal entry id | Reporting / Audit | Finance posting contracts only |
| Accounting Period | Finance | period id | Accounts, Reporting | Finance contracts only |
| Audit Event | Platform / Audit | audit event id | Authorized governance/reporting | Audited service/RPC only |
| Notification | Platform / Notifications | notification id | User experiences | Notification service only |
| Analytics Read Model | Analytics | derived/reporting identity | Management surfaces | Rebuilt from source domains; never authoritative write-back |

## Rules

1. **Read sharing does not imply write ownership.**
2. Cross-domain writes must call the owning domain's service/RPC/command.
3. Page components must not coordinate multi-domain database writes.
4. RLS remains authoritative even where UI/domain checks exist.
5. Name, email, NRIC, chassis display text, or other descriptive fields must not become cross-domain join keys when a canonical ID exists.
6. Legacy compatibility columns may remain temporarily, but new integrations must use canonical IDs.
7. Domain-owned state transitions must be atomic when partial completion would create inconsistent business truth.
8. Sensitive HRMS and Finance data remain independently authorized even when the canonical identity is shared.

## High-priority convergence items

- `profiles.employee_id` remains the canonical User -> Employee link.
- `sales_advisors.employee_id` should become the durable Sales Advisor -> Employee link for new work.
- `deals` remains the canonical FLC sales workflow; legacy Sales Orders are compatibility/history only.
- `approval_instances` / `approval_decisions` remain the canonical approval runtime.
- Operational modules must post to Finance through backend contracts instead of direct journal row writes.
