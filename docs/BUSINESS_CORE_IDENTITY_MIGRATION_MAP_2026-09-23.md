# Business Core Identity Migration Map

**Status:** Audit baseline  
**Date:** 2026-09-23  
**Programme:** #47  
**Epic:** #49  
**Baseline:** `main@3fb91dd`

This audit maps the current repository identity model to the canonical FLC UBS model before any destructive schema cleanup. It reflects current generated database types, current service ownership, and the September 2026 identity migrations already merged to `main`.

## Classification legend

- **CURRENT** — current physical/runtime representation.
- **CANONICAL** — authoritative identity/state for new integrations and business logic.
- **COMPATIBILITY** — retained temporarily for existing callers, actor context, imports, or historical display.
- **MIGRATE** — callers/data that should move to the canonical identity.
- **RETIRE LATER** — remove only after reconciliation, caller migration, and release evidence.

## Canonical identity rules

1. `companies.id` is the tenant/company identity.
2. `branches.id` is the branch/outlet identity.
3. `departments.id` and `job_titles.id` are HRMS organisation identities.
4. `employees.id` is the canonical workforce/person identity for internal staff.
5. `profiles.id` is the authenticated application/account identity.
6. `profiles.employee_id` is the optional User -> Employee relationship.
7. `employee_module_assignments` represents operational module staffing.
8. `employee_hrms_role_assignments` represents HRMS/workflow organisational authority.
9. `deals.sales_advisor_employee_id` is the canonical Deal owner identity.
10. Names, email, NRIC, phone, staff code, and salesperson-name snapshots are matching/display attributes, not cross-domain join keys.

## Current-to-canonical map

| Area / field | CURRENT | CANONICAL | COMPATIBILITY | MIGRATE | RETIRE LATER |
| --- | --- | --- | --- | --- | --- |
| Company | `companies.id` (text) | `companies.id` | none | Add/validate company FKs where safe | duplicated company text in domain tables where a canonical FK exists |
| Branch / Outlet | `branches.id` + `branches.company_id -> companies.id` | `branches.id` | branch codes/names in imports and operational snapshots | Prefer branch ID for new operational relationships | branch-code/name joins where ID exists |
| Department | `departments.id`, `company_id`, `head_employee_id -> employees.id` | `departments.id` | profile department fields | Workforce/workflow callers to Employee Department | duplicated Profile department ownership |
| Job Title | `job_titles.id`, `company_id`, optional `department_id -> departments.id` | `job_titles.id` | profile job-title fields | Workforce callers to Employee job title | duplicated Profile job-title ownership |
| Employee | `employees.id` with company/branch/manager/department/job-title/workforce fields | `employees.id` | `legacy_profile_id`, coarse `primary_role` | All workforce, Sales staffing, approval routing, payroll/commission ownership | legacy profile-backed workforce identity after reconciliation |
| User / Profile | `profiles.id` keyed to authenticated user | `profiles.id` for account/actor identity | workforce fields duplicated on Profile | Keep account/security fields; resolve workforce through `employee_id` | duplicated HR/workforce fields after all callers migrate |
| User -> Employee | nullable `profiles.employee_id -> employees.id`; partial unique index | `profiles.employee_id` | `employees.legacy_profile_id` for migration lineage | Reconcile missing/incorrect links | legacy profile identity once no runtime caller requires it |
| App role | `profiles.role` | IAM/app capability grouping | `employees.primary_role` is coarse workforce/UI compatibility | Separate route/app authority from workforce identity | any use of app role as HRMS/workflow authority |
| Data scope | `profiles.access_scope`, branch/company context, RLS helpers | IAM/RLS scope | route helper assumptions | Keep independent from HRMS role/job title | implicit scope derived from workforce title/name |
| HRMS role | `hrms_roles` + `employee_hrms_role_assignments` | HRMS role assignment by Profile/Employee identity | dual Profile/Employee assignment support during convergence | Prefer Employee identity where workforce-backed | direct app-role substitution for HRMS authority |
| Module staffing | `employee_module_assignments` | assignment row keyed by Employee/module/assignment role | `employees.primary_role` compatibility | Derive module staff lists from assignments | module-specific person tables used as authoritative staff stores |
| Sales Advisor | runtime list/create now derives Employee + `sales/sales_advisor` assignment | Employee + active module assignment | legacy `sales_advisors` person table | Read/create/update through package-owned canonical service | independent writes to legacy `sales_advisors` person table |
| Deal salesperson | `deals.sales_advisor_employee_id -> employees.id`; `sales_advisor_id -> profiles.id`; name snapshot | `sales_advisor_employee_id` | Profile ID as actor/login compatibility; `sales_advisor_name` as historical display snapshot | Backfill/reconcile remaining null canonical Employee IDs | Profile ID as salesperson identity after all callers migrate |
| Vehicle salesperson | `vehicles.salesman_id` + `salesman_name` compatibility fields | Employee-backed salesperson identity is target for cross-module logic | DMS/import salesperson identifiers and display text | Reconcile before introducing/rewiring canonical FK | name-based reporting/commission joins |
| Historical HR ownership | leave/attendance/payroll/appraisal rows reference Employee | Employee FK | none | Keep restrictive history FKs | cascade deletion of historical HR facts |

## Exact repository state

### Company and Branch

- `branches.company_id` has a generated FK to `companies.id`.
- `companies.id` is text and remains the tenant key used throughout the application.
- Many business tables already have explicit company FKs, but this is not universal; company scoping still also relies on RLS and command validation.

**Decision:** Company and Branch are already canonical. New relationships should use their IDs, not names or codes. Legacy/import branch codes remain source evidence and reconciliation keys only.

### Department and Job Title

- `departments.head_employee_id -> employees.id` is canonical.
- `job_titles.department_id -> departments.id` exists.
- `employees.department_id -> departments.id` and `employees.job_title_id -> job_titles.id` exist.
- `departments.company_id` and `job_titles.company_id` are tenant columns; current generated relationships do not expose company FKs for these tables.

**Decision:** Employee Department and Job Title are canonical workforce attributes. Profile copies are compatibility fields only.

### Employee

`employees` is the canonical workforce master.

Current relationships include:
- `manager_employee_id -> employees.id`;
- `department_id -> departments.id`;
- `job_title_id -> job_titles.id`.

Current generated relationships do **not** expose:
- `employees.company_id -> companies.id`;
- `employees.branch_id -> branches.id`.

However, `mutate_employee_with_assignments(...)` validates same-company Branch, manager Employee, Department, and Job Title before Employee create/update. This means the supported write path has stronger tenant integrity than the raw physical FK graph.

PR #81 also made historical leave balances/requests, attendance, payroll items, and appraisal items deletion-restrictive. An Employee with business history follows the lifecycle `active -> inactive/resigned`; hard delete is only for genuinely unused/erroneous rows.

**Migration requirement:** Do not add physical company/branch FKs blindly. First reconcile orphan/mismatched production values, then add constraints only after compatibility impact is proven.

### Profile

`profiles` remains the authenticated application-account identity and contains:
- login-facing identity fields;
- `role`, `access_scope`, account `status`, portal flags;
- `employee_id`;
- duplicated workforce attributes such as branch, department, job title, manager, staff code, IC/contact, join/resign dates, name/email.

Current generated FKs include:
- `employee_id -> employees.id`;
- `department_id -> departments.id`;
- `job_title_id -> job_titles.id`;
- `manager_id -> profiles.id`.

A partial unique index on `profiles.employee_id` allows at most one linked login per Employee.

**Decision:** Keep account/security state on Profile. New HR/workforce integrations must resolve through `profiles.employee_id` and then use Employee data.

### Module and HRMS role assignments

`employee_module_assignments` is the canonical module-staffing relationship. The Sales Advisor runtime now uses:
- `module_key = 'sales'`;
- `assignment_role = 'sales_advisor'`;
- `active = true`.

PR #85 made Employee `primary_role` and the Sales Advisor assignment one database transaction through `mutate_employee_with_assignments(...)`.

`employee_hrms_role_assignments` is separate and links HRMS organisational authority to either Employee or Profile identity. Workflow permission must not be inferred from `profiles.role`.

**Decision:** App role, data scope, module staffing, and HRMS organisational authority remain separate concepts.

### Sales Advisor

The physical legacy `sales_advisors` table still exists and contains duplicated person attributes (code, name, IC, email, contact, dates, branch code, status). Current generated relationships show only its company FK; it has **no Employee FK**.

This table is therefore not the canonical Sales Advisor identity despite older documentation that described an `employee_id` relationship.

Current runtime behavior has already converged:
- `packages/hrms-services/src/employee/salesAdvisorService.ts` lists Advisors from active module assignments plus Employees;
- create uses `create_sales_advisor_employee(...)`, which creates Employee + assignment atomically;
- the legacy `sales_advisors` table is intentionally not written by that command.

**Decision:** Treat `sales_advisors` as legacy/import compatibility only. Do not add new business logic that depends on it as a person master.

### Deal ownership

PR #65/September identity work added:
- `deals.sales_advisor_employee_id -> employees.id ON DELETE RESTRICT`;
- same-company enforcement;
- deterministic backfill from `deals.sales_advisor_id -> profiles.employee_id`;
- an exception/reconciliation query for unmapped Deals.

Current Deal creation dual-writes:
- canonical Employee ID when the current Profile is linked;
- Profile ID for temporary compatibility;
- salesperson name as display snapshot.

Current filtering supports Employee ID.

**Decision:** Analytics, commission, payroll, cross-module automation, and new Sales integrations use `sales_advisor_employee_id`. `sales_advisor_id` remains temporary account/actor compatibility only.

### Vehicle/advisor compatibility

`vehicles` still contains `salesman_id` and `salesman_name` along with DMS/import source fields. These remain compatibility/source-facing fields and should not be assumed to equal canonical Employee identity.

**Decision:** Do not convert Vehicle salesperson identity by name. Reconcile source salesperson identifiers against canonical Employees/assignments and preserve DMS provenance.

## Duplicate attributes and authority

| Attribute | Authoritative owner | Compatibility copies |
| --- | --- | --- |
| Employee name | `employees.name` | `profiles.name`, legacy Sales Advisor name, Deal/Vehicle display snapshots |
| Work email | `employees.work_email` for workforce | `profiles.email` is login/account email; legacy Sales Advisor email |
| Staff code | `employees.staff_code` | `profiles.staff_code`, legacy Sales Advisor code |
| NRIC / IC | `employees.ic_no` | `profiles.ic_no`, legacy Sales Advisor IC |
| Contact | `employees.contact_no` | `profiles.contact_no`, legacy Sales Advisor contact |
| Branch | `employees.branch_id` for workforce placement | Profile branch, legacy branch code/name snapshots |
| Department | `employees.department_id` | `profiles.department_id` |
| Job title | `employees.job_title_id` | `profiles.job_title_id` |
| Manager | `employees.manager_employee_id` | `profiles.manager_id` |
| Employment dates/status | Employee fields | Profile/legacy advisor copies |
| App access role/scope | Profile/IAM | Employee `primary_role` is not an IAM replacement |
| Sales staffing | active Employee module assignment | Employee `primary_role='sales'` as coarse compatibility signal |

## Reconciliation required before destructive cleanup

1. Profiles with no `employee_id` that represent real employees.
2. Profiles linked to Employees in a different company or with divergent workforce attributes.
3. Employees with invalid/mismatched `branch_id`, Department, Job Title, or manager references created before the atomic mutation command.
4. Deals where `sales_advisor_employee_id IS NULL`.
5. Deals whose compatibility Profile and canonical Employee represent different people/companies.
6. Legacy `sales_advisors` rows with no deterministic Employee/module-assignment match.
7. Vehicle salesperson fields that cannot be deterministically reconciled to Employee identity.
8. Name-based reporting/commission joins that still bypass canonical IDs.

No reconciliation should guess by name alone. Staff code, email, NRIC, phone, and source IDs may be used as evidence, but ambiguous matches must go to an exception queue/review.

## Security and RLS impact

- RLS remains authoritative for tenant/data isolation.
- Profile role and access scope remain IAM concerns.
- HRMS organisational roles remain assignment-driven and are separate from app role.
- Employee-backed workflow routing must verify same-company Employee/Role assignment.
- Cross-company Employee references are rejected by the supported Employee mutation command and Deal owner trigger.
- Any future physical FK hardening must preserve current RLS behavior and not widen access merely because identity becomes more canonical.

## Caller and service impact

### Already canonicalized

- HRMS Employee directory reads/writes Employees.
- Sales Advisor list/create is package-owned and Employee/module-assignment backed.
- Deal creation/filtering supports canonical Employee salesperson identity.
- Internal Request workflow routing uses canonical Employee Department/manager/HRMS-role identity.
- Employee Sales role ↔ Sales Advisor assignment is atomic.

### Compatibility callers still requiring audit/migration

- callers using duplicated workforce fields directly from `profiles`;
- any direct runtime use of legacy `sales_advisors`;
- name-based `resolveNamesToIds` compatibility helpers;
- vehicle/commission/report logic using salesperson names or legacy IDs rather than Employee ID;
- older analytics exports that assume Profile ID is the salesperson identity.

## Reporting impact

Management and analytical models should use:
- Employee ID for workforce/person dimensions;
- Branch/Department/Job Title IDs for organisation dimensions;
- Deal `sales_advisor_employee_id` for salesperson attribution;
- snapshot names only for display/history;
- DMS/source IDs for lineage, not canonical joins.

Historical reports should retain display snapshots where needed, but canonical fact-to-person relationships should be Employee-backed.

## Safe migration sequence from the current baseline

1. **Audit and reconciliation only** — run exception queries for Profile/Employee, Deal owner, legacy Sales Advisor, and Vehicle salesperson mappings.
2. **Stop new compatibility debt** — prohibit new direct person writes to `sales_advisors`; use canonical Employee/module assignment services.
3. **Migrate remaining Deal/report/commission callers** to Employee ID.
4. **Migrate Profile workforce reads** to Employee-backed selectors while leaving account/IAM reads on Profile.
5. **Add validated physical organisation constraints** only after production reconciliation proves no incompatible rows.
6. **Introduce Vehicle/commission Employee ownership** additively with source reconciliation; never name-backfill ambiguously.
7. **Measure compatibility usage** for Profile workforce fields, `deals.sales_advisor_id`, and legacy `sales_advisors`.
8. **Retire later** only after zero runtime callers, data reconciliation, rollback plan, and release evidence.

## Rollback and compatibility requirements

- Additive canonical fields remain nullable until reconciliation is complete.
- Keep old Profile/legacy fields readable during migration.
- Dual-write only where required and database-owned when partial failure would create conflicting truth.
- Never drop legacy columns/tables in the same release that first stops writing them.
- Preserve deterministic reconciliation scripts and exception counts before/after each migration.
- Database-ahead/application-rollback compatibility must be maintained for production release safety.
- No destructive data migration is authorized by this audit.

## Corrections to older documentation

Two older statements are now explicitly superseded:

1. `sales_advisors.employee_id` is **not** present in current generated schema. The canonical Sales Advisor relationship is Employee + `employee_module_assignments`.
2. Employee company/branch integrity is not represented by generated physical company/branch FKs. The supported mutation RPC currently validates these references transactionally; physical constraints require reconciliation before introduction.

## Exit conclusion

The canonical identity model is sufficiently established to specify the next implementation slices without guessing:

- **Employee** is workforce truth.
- **Profile** is login/account truth.
- **Module assignment** is operational staffing truth.
- **HRMS role assignment** is organisational/workflow authority.
- **Deal salesperson** is Employee-backed.
- **Legacy Sales Advisor and salesperson-name fields** are compatibility/source data, not new authoritative identities.

The next implementation work should therefore focus on reconciliation and remaining caller migration, not on creating another person table or reviving Profile-backed Sales ownership.
