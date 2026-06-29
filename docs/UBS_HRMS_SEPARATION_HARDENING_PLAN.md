# UBS / HRMS Separation and UBS Admin Hardening Plan

## Current Coupling Points Found

- Both UBS and `apps/hrms-web` currently consume the shared `@flc/supabase` browser client, so database separation depends on deployment environment rather than code-level ownership.
- UBS `UserManagement` imports `listEmployeeDirectory` from `src/services/hrmsService`, loads HRMS employees, links UBS profiles to `employee_id`, and exposes HRMS-only/main-app access toggles.
- UBS auth profile rows include HRMS-facing fields such as `employee_id` and `portal_access_only`.
- Main UBS routing redirects some `portal_access_only` users into HRMS workspace paths.
- Shared auth package owns global app roles, portal-only checks, profile writes, invite calls, route role groups, and section permissions.
- `role_sections` contains an `HRMS` section, so UBS role-section state can still reference HRMS navigation.
- HRMS role assignments are stored in `hrms_roles` and `employee_hrms_role_assignments`; those are separate workflow roles but still linked back to shared `profiles`.

## Shared User/Auth/Role/Permission Dependencies

- User/profile source: `auth.users`, `profiles`
- UBS app roles: `profiles.role`, `AppRole`
- Data scope: `profiles.access_scope`
- Branch assignment: `profiles.branch_id`
- Section permissions: `role_sections`
- Portal-only behavior: `profiles.portal_access_only`
- HRMS identity/workflow links: `profiles.employee_id`, `employees`, `hrms_roles`, `employee_hrms_role_assignments`
- Invite flow: `packages/auth/src/profileService.ts` -> `supabase/functions/invite-user`
- Password reset flow: `packages/auth/src/authService.ts` -> Supabase Auth

## Database Tables Involved

- UBS: `profiles`, `companies`, `branches`, `role_sections`, `column_permissions`, `module_settings`, `audit_logs`, internal-request tables, reporting tables.
- HRMS: `employees`, `departments`, `job_titles`, `hrms_roles`, `employee_hrms_role_assignments`, HRMS leave/attendance/payroll/appraisal tables.
- Shared today: `auth.users`, `profiles`, `branches`, `companies`, `audit_logs`, and the Supabase Auth session store.

## API Routes / Edge Functions Involved

- `invite-user`
- `delete-user`
- `update-user-status`
- Supabase Auth password reset endpoints
- Internal request services and RPCs
- Admin branch/profile/permission services
- HRMS services under `src/services/hrms*` and `apps/hrms-web/src/services/hrms*`

## Frontend Routes Involved

- UBS: `/login`, `/signup`, `/reset-password`, `/admin/users`, `/admin/branches`, `/portal/*`, `/tickets/*`, `/reports`, all UBS module routes. The legacy `/admin/role-permissions` URL redirects to `/admin/users`.
- HRMS: `/hrms/*` in the legacy root app and dedicated `apps/hrms-web` routes.

## Auth / Session Dependencies

- UBS and HRMS must not share the same Supabase project, Auth user table, browser storage key, or profile table.
- Interim code must make HRMS data-source selection explicit. Long-term, HRMS should use its own Supabase package/client and own auth/profile service.
- Future SSO can sit above both apps, but local app profiles, roles, permissions, and admin operations must remain separately owned.

## Permission Dependencies

- UBS route guards use `RequireRole` plus `role_sections`.
- UBS branch/data scoping uses `profiles.branch_id` and `profiles.access_scope`.
- HRMS workflow permissions use HRMS role assignment data and must not drive UBS role decisions.
- Backend/RLS remains the authoritative enforcement point; frontend guards are UX gates only.

## Migration / Cleanup Risks

- Hard-deleting roles can break profiles, audit logs, historical tickets, and RLS assumptions.
- Removing `employee_id` from shared profile logic before HRMS has its own profile database can break HRMS.
- Existing companies may have DB-seeded `role_sections` that differ from TypeScript defaults.
- Invites created before branch enforcement may have `branch_id = null`; cleanup migration/reporting is needed before making stricter DB constraints.
- Production Supabase Auth settings must be changed carefully because redirect URLs affect invite and password reset flows.

## Fix Order

1. Stop UBS Admin from depending on HRMS employee/user data.
2. Require UBS invite branch assignment end to end.
3. Make HRMS Supabase/Auth configuration explicit and separate from UBS deployment config.
4. Remove HRMS from UBS navigation/route access except as an external link if intentionally configured.
5. Add UBS-owned role and permission tables or harden current `role_sections`/permission matrix behind a UBS namespace.
6. Add safe role cleanup: preserve Super Admin, audit current assignments, migrate users, then deactivate confusing roles.
7. Harden branch scoping across UBS services and reports.
8. Browser-test admin flows and add regression coverage.

## Testing Strategy

- Unit tests for auth/profile invite payloads and validation.
- Edge-function tests or contract tests for invite validation, branch persistence, admin authorization, and duplicate email handling.
- Browser tests for `/admin/users` invite, branch assignment, deactivate/reactivate, reset password action visibility, and unauthorized direct route access.
- Module tests for branch-scoped dashboards, requests, reports, exports, and request setup.
- Dedicated HRMS smoke proving it uses its own auth/config surface and does not depend on UBS profiles.

## Rollback Risk

- Low for UBS UI removal of HRMS employee linking: restores by reverting the `UserManagement` patch.
- Medium for invite branch enforcement: existing branchless invite workflows will fail until admins select a branch.
- High for physical database separation: requires infrastructure/environment rollout and data migration, not just app code.

## Regression Test Plan

- Add tests proving `inviteUser` sends `branch_id`.
- Add tests proving UBS invite validation rejects missing branch.
- Add tests proving HRMS-only toggles do not appear in UBS user management.
- Add route/access tests proving HRMS routes are absent from UBS navigation.
- Add RLS/API checks for unauthorized invite/status/profile mutations.
- Add browser tests for branch-scoped users across internal requests and reports.

## Phase 1 Started

This first implementation slice removes the UBS admin dependency on HRMS employee directory data, removes HRMS-only invite language from UBS user management, and wires `branch_id` through UBS invites so invited users are branch-assigned immediately.

## Phase 2 Started

- Added a standalone local Supabase CLI project for `apps/hrms-web` under `apps/hrms-web/supabase` with its own project id and non-conflicting local ports.
- Added local `VITE_HRMS_SUPABASE_*` env wiring and HRMS web proxy path `/__hrms_supabase`.
- Bootstrapped repeatable local HRMS admin provisioning through `npm run hrms:bootstrap:local`.
- Split UBS section defaults from HRMS section defaults so UBS role-permission editing no longer exposes HRMS as a main-app section.
- Hardened UBS runtime permissions to ignore stale `HRMS` rows that may still exist in `role_sections`.
- Removed HRMS from UBS main navigation while keeping direct `/hrms` compatibility redirects to the dedicated HRMS workspace.
- Tightened pending-user activation so activation cannot create branchless non-global UBS users.
