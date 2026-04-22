# Workforce Identity And Module Access Plan

## Goal

Make HRMS the single source of truth for internal staff records without turning HRMS into the authentication system.

This plan separates three concerns that are currently mixed together:

1. authentication identity
2. workforce master data
3. module access and role assignment

## Current State

The current app already reuses `profiles` across HRMS and non-HRMS surfaces, which is directionally correct.

However, `profiles` currently carries too many responsibilities at once:

- auth-linked user identity
- session profile used by `AuthContext`
- employee master data used by HRMS
- coarse app role assignment
- module-specific staff categorisation such as Sales Advisor

That coupling is now a constraint.

### Structural Issue

`profiles` originated as an auth-bound table keyed by `auth.users.id`, but the HRMS employee flow is now trying to create workforce records directly.

That means the system is currently mixing:

- people who are employees
- people who have login accounts
- people who should have access to a specific module

Those are related concepts, but they are not the same record.

## Recommendation

Use this target model:

### 1. Auth Identity

`auth.users`

Purpose:

- email/password login
- password reset
- sessions
- invites

This remains the credential source.

### 2. Account Profile

`profiles`

Purpose:

- lightweight application account record
- session hydration for the web and mobile apps
- account activation state
- link to workforce record

This should stop being the workforce master over time.

### 3. Workforce Master

`employees`

Purpose:

- canonical employee directory
- staff code
- reporting line
- department
- job title
- branch
- employment dates
- employment status
- HRMS directory record for internal staff

This becomes the system of record for employee details.

### 4. Module Staffing / Assignments

`employee_module_assignments`

Purpose:

- derive which employees belong to which operational modules
- derive module-specific staff lists such as Sales Advisors
- support future assignments such as payroll admin, approver, inventory controller, purchasing clerk

This replaces the need for separate staff databases per module.

## What This Means In Practice

### Employee Directory

The HRMS Employee Directory becomes the canonical place to create and maintain workforce records.

### User & Roles

User & Roles becomes the place to manage:

- whether a login account exists
- which employee the account is linked to
- which modules the employee is assigned to
- which permissions the linked account receives

### Sales Advisor

Sales Advisor should be derived from the workforce model, not stored in a separate user store.

Target rule:

- an employee exists in `employees`
- that employee has an assignment in `employee_module_assignments`
- `module_key = 'sales'`
- `assignment_role = 'sales_advisor'`

The Sales module can then query assigned sales staff instead of maintaining a separate database.

The same pattern should be used for future staff groups.

## Data Model

### `employees`

Canonical workforce record.

During the transition, `employees.primary_role` may remain as a coarse compatibility field for current UI surfaces while the system moves toward assignment-driven access.

Core fields:

- `id`
- `company_id`
- `branch_id`
- `manager_employee_id`
- `primary_role`
- `staff_code`
- `name`
- `work_email`
- `ic_no`
- `contact_no`
- `join_date`
- `resign_date`
- `status`
- `department_id`
- `job_title_id`

### `profiles.employee_id`

Links a login account to an employee record.

This allows:

- employee exists before account provision
- account can be created later
- non-employee accounts can still exist when needed

### `employee_module_assignments`

Flexible assignment table for module participation.

Core fields:

- `employee_id`
- `company_id`
- `module_key`
- `assignment_role`
- `is_primary`
- `active`
- `effective_from`
- `effective_to`

Examples:

- `sales / sales_advisor`
- `sales / sales_manager`
- `hrms / hr_admin`
- `hrms / payroll_admin`
- `inventory / inventory_controller`

## Why This Is Better Than A Single Role Column

The current single `profiles.role` field is too coarse for where the product is headed.

Problems with a single role field:

- one user can only be one thing at a time
- module-specific responsibilities become awkward
- future multi-module staffing requires exceptions
- employee identity and application access stay tightly coupled

Benefits of assignment-based access:

- one employee can participate in multiple modules
- staff categories become derivable instead of duplicated
- HRMS owns staff data while security stays in auth plus permission layers
- module access becomes composable and future-proof

## Recommended Transition Strategy

### Phase 1: Additive Foundation

Add:

- `employees`
- `profiles.employee_id`
- `employee_module_assignments`

Backfill current `profiles` rows into `employees` and link them.

Do not break existing code yet.

### Phase 2: Read Model Migration

Refactor HRMS services so the Employee Directory reads and writes `employees` instead of `profiles`.

Keep `profiles` only for account/session data and the account-to-employee link.

### Phase 3: Module Derivation

Refactor module-specific staff surfaces to derive their staff lists from `employee_module_assignments`.

Initial target:

- Sales Advisor list

Follow-on targets:

- HR admins
- payroll users
- approval operators
- future inventory or purchasing staff groups

### Phase 4: Permission Refactor

Move route and feature gating away from depending only on `profiles.role`.

Use:

- account-level identity from `profiles`
- section visibility from `role_sections`
- module staffing from `employee_module_assignments`
- future fine-grained grants where required

### Phase 5: Compatibility Cleanup

After the app no longer depends on employee data living in `profiles`, reduce `profiles` to account-facing fields only.

Potential long-term fields retained on `profiles`:

- `id`
- `email`
- `name`
- `employee_id`
- `status`
- `access_scope`
- minimal fallback role during transition

## Immediate Implementation Decision

Do not create separate user databases for Employee Directory, User & Roles, Sales Advisor, or future staff categories.

Instead:

- one workforce master in HRMS
- one account layer for login/session
- one assignment layer for module participation

That gives the cleanest enterprise-grade model for this repo.

## First Refactor Targets In This Repo

1. Introduce `employees` and `employee_module_assignments` at the database layer.
2. Link `profiles` to `employees` through `profiles.employee_id`.
3. Backfill existing employee-like `profiles` rows into `employees`.
4. Rebuild `salesAdvisorService` to derive Sales Advisors from employee assignments.
5. Refactor HRMS Employee Directory to use `employees` as its primary store.
6. Convert User & Roles into account linking plus assignment management rather than parallel staff storage.

## Expected Outcome

After this transition:

- HRMS owns employee truth
- module staff lists are derived instead of duplicated
- auth remains cleanly separated
- future modules can reuse the same employee master without inventing new user stores
- access control becomes easier to reason about and safer to evolve