# Phase 3 HRMS Web

Status: Formally closed
Started: 2026-04-28
Closed: 2026-04-28

## Objective

Bring the core HRMS experience into a dedicated web app so HR, managers, payroll/admin users, and employees can use HRMS workflows without the broader main application shell.

## Closure Decision

Phase 3 is formally closed.

The dedicated HRMS web app, core route tree, main-app coexistence, UAT path deployment, local route/access evidence, base-path auth redirects, reused-page link audit, approval service coverage, credentialed UAT route smoke, and live UAT approval workflow smoke are complete. HRMS remains mounted at `https://uat.protonfookloi.com/hrms/` while the main app remains at `https://uat.protonfookloi.com/`.

## Delivered Slice 1

- Added `apps/hrms-web` as an npm workspace app.
- Added standalone Vite, TypeScript, Tailwind, and PostCSS configuration.
- Reused the existing root auth, theme, toast, error boundary, module access, and HRMS page components.
- Added an HRMS-branded login page that keeps the existing Supabase auth behavior.
- Configured the app to load Vite environment variables from the repository root.
- Added an HRMS-only layout with HRMS navigation only.
- Mounted Phase 3 priority routes: `/leave`, `/attendance`, `/approvals`, `/appraisals`, `/announcements`, and `/profile`.
- Mounted secondary HRMS routes for continuity: `/leave/calendar`, `/employees`, `/payroll`, `/settings`, and `/approval-flows`.
- Added compatibility redirects from existing main-app HRMS paths such as `/hrms/leave` to the dedicated route shape.
- Kept non-HRMS modules out of the dedicated route tree.
- UAT routing decision, 2026-04-28: keep `https://uat.protonfookloi.com` as the main Fook Loi Group UBS app and mount the dedicated HRMS web app at `https://uat.protonfookloi.com/hrms/` until a separate HRMS subdomain is provisioned.
- Docker/nginx combined deployment now serves the main app at `/` and the HRMS app at `/hrms/`.

## Validation Evidence

- `npm run build --workspace apps/hrms-web`: passed on 2026-04-28.
- Local smoke, 2026-04-28: `npm run dev --workspace apps/hrms-web` starts on `http://localhost:3001/`; `/login` renders the HRMS-branded auth screen.
- UAT image: `flc-bi-uat:phase3-close-20260428`.
- UAT container: `flc-bi-uat`, healthy, bound to `127.0.0.1:8080`.
- UAT `/healthz`: `ok`.
- UAT root title: `Fook Loi Group UBS`.
- UAT HRMS title: `FLC HRMS`.
- Public path smoke: `https://uat.protonfookloi.com/hrms/` redirects anonymous users to `/hrms/login` and renders the HRMS login page.
- UAT deployment verification after Phase 3 close image, 2026-04-28: `npm run verify:uat` passed for health and bundle Supabase URL using `https://uat.protonfookloi.com`.
- Credentialed UAT verification, 2026-04-28: `UAT_LOGIN_REQUIRED=1 npm run verify:uat` passed using the dedicated UAT HRMS admin test account `uat.hrms.admin@flc.test`.
- Authenticated live HRMS route smoke, 2026-04-28: browser login to `/hrms/login` succeeded, then `/hrms/leave`, `/hrms/attendance`, `/hrms/approvals`, `/hrms/appraisals`, `/hrms/announcements`, `/hrms/profile`, `/hrms/employees`, `/hrms/payroll`, `/hrms/settings`, and `/hrms/approval-flows` all rendered under the dedicated HRMS shell with no route error.
- Live HRMS approval workflow smoke, 2026-04-28: seeded a separate employee leave request assigned to the UAT HRMS admin, approved it through `/hrms/approvals`, and verified `leave_requests.status = 'approved'`, `approval_instances.status = 'approved'`, and an `approval_decisions.decision = 'approved'` row. Evidence marker: `Phase3 HRMS approval smoke 1777365975118`; leave `39d24ec8-5f8f-44b0-9a7b-6e17a3fe4dad`; approval instance `33ca26a4-0d48-42f6-a8de-f8a33ceab68b`.
- Live Supabase auth redirect evidence, 2026-04-28: `POST /auth/v1/recover?redirect_to=https://uat.protonfookloi.com/hrms/reset-password` returned HTTP 200.
- Focused HRMS web route/navigation tests, 2026-04-28: `npm run test -- apps/hrms-web/src/App.test.tsx apps/hrms-web/src/layout/HrmsLayout.test.tsx` passed with 2 files and 6 tests.
- Full unit suite after adding HRMS web tests, 2026-04-28: `npm run test` passed with 37 files and 297 tests.
- Full unit suite after final close changes, 2026-04-28: `npm run test` passed with 37 files and 300 tests.
- Dedicated HRMS web browser smoke, 2026-04-28: `npm run test:e2e --workspace apps/hrms-web` passed with 5 Chromium tests covering anonymous protected-route redirect, authenticated disabled-module access block, authenticated HRMS shell load, priority HRMS pages, and legacy nested `/hrms/*` compatibility redirects.
- Focused Phase 3 close tests, 2026-04-28: `npm run test -- src/services/authService.test.ts src/pages/hrms/ApprovalInbox.test.tsx src/services/hrmsService.test.ts` passed with 3 files and 67 tests. Coverage includes `/hrms/reset-password` redirect generation, Approval Inbox source-link path selection for main app versus dedicated HRMS app, and leave/payroll/appraisal approval creation/review/finalisation service behavior.
- Final local validation, 2026-04-28: `npm run typecheck`, `npm run build --workspace apps/hrms-web`, `npm run lint` with 0 errors and 143 existing warnings, and `git diff --check` all passed.
- Supabase auth redirect config updated in `supabase/config.toml` for HRMS signup, forgot-password, and reset-password paths on local, UAT, and production equivalents.
- Reused HRMS page link audit, 2026-04-28: scanned `src/pages/hrms/**` and `apps/hrms-web/src/**` for absolute main-shell links. The only compatibility-dependent source navigation was in Approval Inbox; it now uses dedicated app routes when running in `apps/hrms-web` and main-app `/hrms/*` routes when reused inside the main app.

## Database Table Relationship Mapping

The current model is employee-centric. `profiles` remains the authenticated account/session table. `employees` is the workforce master. Account-to-workforce identity is linked by `profiles.employee_id -> employees.id`.

| Area | Tables | Relationship |
| --- | --- | --- |
| Account and workforce identity | `profiles`, `employees` | `profiles.employee_id -> employees.id`; `employees.legacy_profile_id` preserves historical profile-based employee data; `employees.manager_employee_id -> employees.id`. |
| Organization structure | `employees`, `departments`, `job_titles` | `employees.department_id -> departments.id`; `employees.job_title_id -> job_titles.id`; `departments.head_employee_id -> employees.id`; `job_titles.department_id -> departments.id`. |
| Module staffing | `employee_module_assignments`, `employees` | `employee_module_assignments.employee_id -> employees.id`, keyed by `company_id`, `module_key`, `assignment_role`, and active/effective dates. |
| Leave configuration | `leave_types` | Company-scoped leave type catalog. |
| Leave balances | `leave_balances`, `employees`, `leave_types` | Current ownership migration makes `leave_balances.employee_id -> employees.id`; `leave_balances.leave_type_id -> leave_types.id`; scoped by year. |
| Leave requests | `leave_requests`, `employees`, `leave_types`, `profiles`, `approval_instances` | Current ownership migration makes `leave_requests.employee_id -> employees.id`; `leave_requests.leave_type_id -> leave_types.id`; review columns still point to `profiles`; approval instance links by `approval_instances.entity_type = 'leave_request'` and `approval_instances.entity_id = leave_requests.id`. |
| Attendance | `attendance_records`, `employees` | Current ownership migration makes `attendance_records.employee_id -> employees.id`; unique operational identity is employee plus date. |
| Payroll | `payroll_runs`, `payroll_items`, `employees`, `profiles`, `approval_instances` | `payroll_items.payroll_run_id -> payroll_runs.id`; current ownership migration makes `payroll_items.employee_id -> employees.id`; `payroll_runs.created_by -> profiles.id`; approval instance links by `entity_type = 'payroll_run'`. |
| Appraisals | `appraisals`, `appraisal_items`, `employees`, `profiles`, `approval_instances` | `appraisal_items.appraisal_id -> appraisals.id`; current ownership migration makes `appraisal_items.employee_id -> employees.id`; `appraisal_items.reviewer_id -> profiles.id`; `appraisals.created_by -> profiles.id`; approval instance links by `entity_type = 'appraisal'`. |
| Announcements | `announcements`, `profiles` | `announcements.author_id -> profiles.id`; company-scoped broadcast records. |
| Holidays | `public_holidays` | Company-scoped holiday calendar used by HRMS admin/settings. |
| Approval flow definitions | `approval_flows`, `approval_steps`, `profiles` | `approval_steps.flow_id -> approval_flows.id`; `approval_flows.created_by -> profiles.id`; `approval_steps.approver_user_id -> profiles.id` for specific approver steps. |
| Approval execution | `approval_instances`, `approval_decisions`, `approval_flows`, `approval_steps`, `profiles` | `approval_instances.flow_id -> approval_flows.id`; `approval_instances.requester_id -> profiles.id`; `approval_instances.current_step_id -> approval_steps.id`; `approval_instances.current_approver_user_id -> profiles.id`; `approval_decisions.instance_id -> approval_instances.id`; `approval_decisions.step_id -> approval_steps.id`; `approval_decisions.approver_id -> profiles.id`. |

Important relationship note: older migrations created leave, attendance, payroll item, and appraisal item ownership against `profiles`. Later workforce identity and ownership migrations move those operational records to `employees`. The service layer now reflects that split by using `employees` for workforce records and `profiles` for authenticated users, approvers, authors, and reviewers.

## Frontend Mapping

| UAT path | HRMS route | Component | Access behavior |
| --- | --- | --- | --- |
| `/hrms/login` | `/login` | `apps/hrms-web/src/pages/LoginPage.tsx` | Public auth page. |
| `/hrms/forgot-password` | `/forgot-password` | shared `ForgotPassword` | Public auth recovery page, base-path aware. |
| `/hrms/reset-password` | `/reset-password` | shared `ResetPassword` | Public password reset page, base-path aware. |
| `/hrms/signup` | `/signup` | shared `Signup` | Public invite/signup page, base-path aware. |
| `/hrms/account-pending` | `/account-pending` | shared `AccountPending` | Public account state page. |
| `/hrms/` | `/` | redirect to `/leave` | Protected HRMS shell. |
| `/hrms/profile` | `/profile` | `apps/hrms-web/src/pages/ProfilePage.tsx` | Protected HRMS profile. |
| `/hrms/leave` | `/leave` | `src/pages/hrms/LeaveManagement.tsx` | Protected, requires HRMS module access. |
| `/hrms/leave/calendar` | `/leave/calendar` | `src/pages/hrms/LeaveCalendar.tsx` | Protected, manager-and-up route role. |
| `/hrms/attendance` | `/attendance` | `src/pages/hrms/AttendanceLog.tsx` | Protected, requires HRMS module access. |
| `/hrms/approvals` | `/approvals` | `src/pages/hrms/ApprovalInbox.tsx` | Protected, approval inbox route role. |
| `/hrms/appraisals` | `/appraisals` | `src/pages/hrms/PerformanceAppraisals.tsx` | Protected, appraisal route role. |
| `/hrms/announcements` | `/announcements` | `src/pages/hrms/Announcements.tsx` | Protected, announcement route role. |
| `/hrms/employees` | `/employees` | `src/pages/hrms/EmployeeDirectory.tsx` | Protected, manager-and-up route role. |
| `/hrms/payroll` | `/payroll` | `src/pages/hrms/PayrollSummary.tsx` | Protected, payroll route role. |
| `/hrms/settings` | `/settings` | `src/pages/hrms/HrmsAdmin.tsx` | Protected, HRMS admin route role. |
| `/hrms/approval-flows` | `/approval-flows` | `src/pages/hrms/ApprovalFlows.tsx` | Protected, HRMS admin route role. |
| `/hrms/unauthorized` | `/unauthorized` | shared `UnauthorizedAccess` | Access-denied state. |

Frontend shell and access flow:

- `apps/hrms-web/src/App.tsx` derives `routerBaseName` from Vite `BASE_URL`, so the same app works locally at `/` and in UAT at `/hrms/`.
- `ProtectedHrmsShell` composes `ProtectedRoute`, `ModuleAccessProvider`, `RequireHrmsModule`, and `HrmsLayout`.
- `RequireHrmsModule` checks shared module access for `hrms` before rendering the HRMS route tree.
- `HrmsLayout` exposes only HRMS navigation groups: Self Service, Workforce, and Administration.
- Route-level role filtering uses the existing HRMS role constants from `src/config/hrmsConfig.ts`.

## Backend And Service Mapping

| Service/package | Used for | Main tables/API surface |
| --- | --- | --- |
| `src/services/hrmsService.ts` | Core HRMS workflows: employee directory, leave, attendance, payroll, appraisals, announcements, approval execution helpers. | `employees`, `profiles`, `employee_module_assignments`, `leave_types`, `leave_balances`, `leave_requests`, `attendance_records`, `payroll_runs`, `payroll_items`, `appraisals`, `appraisal_items`, `announcements`, `approval_flows`, `approval_steps`, `approval_instances`, `approval_decisions`. |
| `src/services/hrmsAdminService.ts` | HRMS settings/admin structures. | `employees`, `departments`, `job_titles`, `leave_types`, `leave_balances`, `public_holidays`, `profiles`. |
| `src/services/approvalFlowService.ts` | Approval flow CRUD and approver selectors. | `approval_flows`, `approval_steps`, `profiles`. Specific approver selection currently uses active profiles because approval steps route to authenticated user profiles. |
| `packages/hrms-services` | Shared self-service data layer for web/mobile surfaces. | Contact update, leave type lookup, leave request create/cancel, attendance clock-in/out, payslip summary. Uses `profiles` for account resolution and `employees` for workforce manager routing. |
| `packages/hrms-schemas` | Shared validation schemas. | Auth, leave request, attendance, HRMS admin, and approval flow validation. |
| `packages/types` | Shared TypeScript domain model. | User, employee, leave, attendance, payroll, appraisal, announcement, department, job title, holiday, and approval flow types. |
| `packages/supabase` | Typed Supabase client and generated DB types. | Generated table/relationship contracts for the HRMS schema. |

## Gap Assessment

No blocking gaps remain for Phase 3 closure.

Closed gaps:

- Unauthorized HRMS module access evidence is covered by the dedicated HRMS browser smoke with `module_settings.is_active=false`.
- Approval flow behavior is covered at service level for leave, payroll, and appraisal approval creation/review/finalisation. Live UAT evidence also confirms a leave approval can be approved from `/hrms/approvals` and updates both the entity and workflow status.
- Supabase redirect configuration now includes the HRMS auth route equivalents for local, UAT, and production URLs. Live UAT reset redirect evidence returned HTTP 200 for `/hrms/reset-password`.
- Reused HRMS page link/root-shell audit is complete. Approval Inbox source navigation no longer depends on compatibility redirects in the dedicated HRMS app.
- Credentialed UAT route smoke is complete for the HRMS priority and admin route set.

Non-blocking or deferred gaps:

- A separate HRMS subdomain such as `uathrms.protonfookloi.com` is not provisioned. Current UAT requirement is satisfied by `/hrms/`, and subdomain work can be handled as a later DNS/Cloudflare deployment task.
- The specific approver picker in `approvalFlowService` intentionally selects active `profiles`, because approval execution routes to authenticated users. If HR wants approver selection to be employee-first, the selector should join `employees` through `profiles.employee_id` in a follow-up.

## Close Criteria

Phase 3 close criteria are satisfied:

- Latest HRMS web build/config deployed to UAT as `flc-bi-uat:phase3-close-20260428`.
- Credentialed UAT smoke passed with a real active UAT HRMS admin account.
- Authenticated browser smoke passed for priority HRMS routes and admin routes.
- Live approval-backed workflow passed through `/hrms/approvals` and confirmed database status changes.
- Supabase Auth redirect config is tracked for HRMS auth paths, and the UAT reset redirect was accepted by the live Auth endpoint.