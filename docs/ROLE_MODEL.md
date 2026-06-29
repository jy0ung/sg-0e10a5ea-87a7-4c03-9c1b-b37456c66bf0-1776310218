# Role Model

The current app has several access concepts that look like "roles" but are not the same thing.

## Global App Role

Stored on `profiles.role`.

Examples: `super_admin`, `company_admin`, `director`, `manager`, `sales`, `accounts`, `portal_admin`.

This is the coarse identity used for route entry and admin-level actions. It is not enough by itself to decide row-level data access.

## Access Scope

Stored on `profiles.access_scope`.

Values: `self`, `branch`, `company`, `global`.

This controls the user's data boundary. A `manager` with `branch` scope and a `manager` with `company` scope are not equivalent.

## Branch Assignment

Stored on `profiles.branch_id`.

This is the concrete branch used when `access_scope = 'branch'` and for branch-bound UBS workflows. UBS invites must assign a branch immediately.

## UBS Section Permissions

Stored in `role_sections` and surfaced by the UBS role-permission editor.

UBS section defaults intentionally exclude HRMS. HRMS is no longer a UBS module permission; it is a separately hosted app with its own backend/env and workflow access model.

## Portal Roles

Examples: `portal_admin`, `portal_manager`, `portal_staff`.

These are internal-request/customer-portal roles. They should not be treated as HRMS roles or general UBS hierarchy roles.

## HRMS Workflow Roles

Stored in HRMS tables such as `hrms_roles` and `employee_hrms_role_assignments`.

These drive HRMS workflows such as leave approval, payroll visibility, and appraisal participation. They are separate from UBS global app roles. HRMS route access may use the global app role as a coarse entry gate, but workflow authorization must come from HRMS role assignments and RLS/backend checks.

## Enforcement Boundary

Frontend route guards and section permissions are UX gates. Database RLS, RPC checks, and edge-function authorization remain authoritative.
