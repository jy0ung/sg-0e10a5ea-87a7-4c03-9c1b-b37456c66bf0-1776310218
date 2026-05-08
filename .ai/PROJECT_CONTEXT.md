# Unified Business Suite Project Context

CRITICAL: Read this file first in every session before asking project basics. This repo has already deployed to production. The current working copy may be on the production server with live Supabase data; treat commands and edits as production-sensitive. Do not run destructive database, git, Docker, or deployment commands unless explicitly requested.

## Users/Roles

- Identity provider: Supabase Auth. Browser clients use the shared PKCE Supabase client from `packages/supabase/src/client.ts`, re-exported by `src/integrations/supabase/client.ts`.
- Authentication is not complete until an active, company-scoped `profiles` row loads. `src/contexts/AuthContext.tsx` maps `profiles` into the app `Profile` object and only sets `isAuthenticated` when both `session` and `profile` exist.
- Pending/unprovisioned users: `AuthContext.fetchProfile` preserves invite/reset sessions on `/signup` and `/reset-password`, but redirects users with no profile, no `company_id`, or `status='pending'` to `/account-pending`.
- Disabled users: `status='inactive'` or `status='resigned'` forces sign-out with a profile error.
- Portal-only users: `src/lib/portalAccess.ts` treats `portal_access_only=true` or roles `portal_admin|portal_manager|portal_staff` as portal-only and resolves their home path to `/portal`. The main app shell redirects them away from `/`.
- Roles are defined in `packages/types/src/index.ts`: `super_admin`, `company_admin`, `director`, `general_manager`, `manager`, `sales`, `accounts`, `analyst`, `creator_updater`.
- Default access scopes are defined in `ROLE_DEFAULT_SCOPE` in `packages/types/src/index.ts`: super admin global; company/admin/director/general manager/accounts/analyst company; manager/creator_updater branch; sales self.
- Route role groups are centralized in `src/config/routeRoles.ts`. Key gates: `ADMIN_ONLY` is `super_admin|company_admin`; `EXECUTIVE` adds `director|general_manager`; `MANAGER_AND_UP` adds `manager`; HRMS has separate groups for admin, payroll, approvals, leave, and appraisals.
- Section visibility defaults live in `src/config/rolePermissions.ts`, with DB-backed overrides in `role_sections` loaded via `src/hooks/usePermissions.ts` and shown in `src/components/layout/AppSidebar.tsx`.
- Route gates are UX-only. `src/components/shared/RequireRole.tsx` uses `useAuth().hasRole`; `super_admin` bypasses all role checks. RLS is the actual security boundary.
- Column-level vehicle permissions use `column_permissions`, `src/services/permissionService.ts`, `src/hooks/useColumnPermissions.ts`, and DB triggers/RPCs described in `docs/SECURITY.md`.
- Admin user management is in `src/pages/admin/UserManagement.tsx` with data operations in `src/services/profileService.ts`. Invites call `supabase.functions.invoke('invite-user')`; invited users can be deleted only before first sign-in via `delete-user`.
- `supabase/functions/invite-user/index.ts` permits only `super_admin` and `company_admin`. Company admins cannot invite outside their company, cannot grant `super_admin`, and cannot grant global access. Rate limit is 10 invites per caller per hour.
- `supabase/functions/delete-user/index.ts` permits only admins, blocks self-delete, blocks super admin deletion, enforces same-company rules for company admins, and refuses deletion once the target auth user has `last_sign_in_at`.

## Architecture

- Stack: Vite + React 18 + React Router 6 + React Query 5 + Tailwind/Radix UI + Supabase. Root `package.json` uses npm workspaces for `packages/*` and `apps/*`.
- Monorepo layout is documented in `docs/ARCHITECTURE.md`: root web app in `src/`; standalone HRMS web app in `apps/hrms-web`; Capacitor HRMS mobile app in `apps/hrms-mobile`; shared packages in `packages/types`, `packages/supabase`, `packages/hrms-schemas`, `packages/hrms-services`; migrations and edge functions in `supabase/`.
- Main app entry and route map are in `src/main.tsx`. It initializes Sentry via `src/services/errorTrackingService.ts`, Web Vitals metrics, React Query, theme/toast providers, `AuthProvider`, `ModuleAccessProvider`, `DataProvider`, and `SalesProvider`.
- Major route modules: Platform/dashboard, Auto Aging, Sales, Inventory, Purchasing, Reports, HRMS, Admin, and `/portal` internal requests. Module activation is enforced by `RequireActiveModule` and `src/contexts/ModuleAccessContext.tsx`.
- Module catalog/toggle behavior lives in `src/lib/moduleAccess.ts`. `admin` is core and always active. `support` maps to `/portal`. Active states persist in `module_settings`.
- Dedicated HRMS web shell: `apps/hrms-web/src/App.tsx`. It reuses main app Auth/ModuleAccess/RequireRole/Page components, validates HRMS module activation, and exposes HRMS routes from `apps/hrms-web/src/routes.ts`.
- HRMS mobile: `apps/hrms-mobile` uses shared `@flc/supabase`, `@flc/types`, `@flc/hrms-services`, and Capacitor. Its auth context in `apps/hrms-mobile/src/contexts/AuthContext.tsx` loads `profiles.employee_id` and then the linked `employees` row; without a linked employee it sets `employee=null`.
- Data access convention: docs say pages/components should not call `supabase.from()` or `supabase.rpc()` directly and should use `src/services/*`. The app mostly follows this, but important exceptions still exist in `src/contexts/DataContext.tsx`, `src/contexts/SalesContext.tsx`, and `src/contexts/ModuleAccessContext.tsx`.
- React Query is the cache boundary. Query keys are tenant-scoped by `companyId` and often branch/module filters. Vehicle RPC clients add short LRU caches in `src/services/vehicleService.ts`.
- Root error handling: `src/components/ErrorBoundary.tsx` and per-route `RouteErrorBoundary` keep route crashes from blanking the app. Chunk-load errors after deploy are caught in `src/main.tsx` and trigger one session reload.
- Production runtime is a static nginx image. There is no Node server at runtime; PM2 config is explicitly local/dev only in `ecosystem.config.cjs`.

## DB Schema

- Source of truth is Supabase migrations under `supabase/migrations/`; generated TS types live in `packages/supabase/src/database.types.ts` and are re-exported into the root app.
- Tenant scoping: most business tables carry `company_id`; RLS posture is summarized in `docs/RLS_MATRIX.md`. Helper functions such as `get_my_access_scope()` and `can_access_row()` are introduced in migrations.
- Core identity tables: `profiles`, `companies`, `branches`, `module_settings`, `role_sections`, `user_groups`, `column_permissions`, `audit_logs`, `application_logs`, `notifications`, `push_tokens`, `dashboard_preferences`.
- `profiles` includes `id`, `email`, `name`, `role`, `company_id`, `branch_id`, `access_scope`, `status`, HRMS/workforce fields (`employee_id`, `staff_code`, `department_id`, `job_title_id`, `manager_id`, dates/contact), legacy vehicle booleans, and `portal_access_only`.
- Workforce model: `employees` is the HRMS/workforce record with `company_id`, `branch_id`, `manager_employee_id`, `primary_role`, `status`, staff/contact fields, `department_id`, `job_title_id`, and optional `legacy_profile_id`. `profiles.employee_id` links a login to an employee.
- HRMS tables include `departments`, `job_titles`, `public_holidays`, `leave_types`, `leave_balances`, `leave_requests`, `attendance_records`, `payroll_runs`, `payroll_items`, `appraisals`, `appraisal_items`, `announcements`, `approval_flows`, `approval_steps`, `approval_instances`, `approval_decisions`, `approval_requests`, and `employee_module_assignments`.
- Auto Aging tables include `vehicles`, `import_batches`, `quality_issues`, `import_review_rows`, `sla_policies`, `branch_mappings`, `payment_method_mappings`, `commission_rules`, and `commission_records`.
- `vehicles` contains chassis/customer/model/branch/payment/salesman fields; milestone dates; computed KPI fields; import/source links; soft delete fields; commission fields; stage/stage override; `salesman_id`; and newer operational fields like `engine_no`, `colour`, `status`, `branch_id`, `owner_name`.
- Sales/master data tables include `sales_orders`, `customers`, `invoices`, `deal_stages`, `salesman_targets`, `purchase_invoices`, `vehicle_transfers`, suppliers/dealers/banks/fees/models/colours/payment types/dealer invoices/official receipts.
- Internal request/portal tables include `tickets`, `ticket_activity`, `ticket_attachments`, `request_categories`, `request_subcategories`, `request_templates`, `request_routing_rules`, `request_attachment_settings`, and `request_form_fields`. Generated DB types are incomplete for some of these; services use typed local shims.
- Important RPCs: `search_vehicles`, `vehicle_kpi_summary`, `auto_aging_dashboard_summary`, and `commit_import_batch`.

## APIs

- Supabase client contract: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required. Relative proxy paths are supported by `packages/supabase/src/client.ts`; auth storage key is `flc.auth.session`.
- Auth service: `src/services/authService.ts` handles password reset redirect helpers; primary login uses `supabase.auth.signInWithPassword` in `AuthContext`.
- Profile API: `src/services/profileService.ts` provides `listProfiles`, `listCompanyOptions`, `updateProfile`, `inviteUser`, `deleteInvitedUser`, `changePassword`, `updateOwnProfileName`, and `setPortalAccess`.
- Vehicle API: `src/services/vehicleService.ts` provides direct row operations plus RPC-backed `searchVehicles`, `getVehicleKpiSummary`, and `getAutoAgingDashboardSummary`. Search args include branch/model/payment/stage/search/BG date/delivery flag/limit/offset/sort. RPC returns `{ rows, total_count }`.
- Import API: `src/services/importService.ts` normalizes workbook rows and calls `commit_import_batch` with `p_batch_id`, `p_vehicles`, `p_quality_issues`, `p_valid_rows`, and `p_error_rows`; expected result has `vehicles_upserted` and `quality_issues_inserted`.
- Tickets/internal requests API: `src/services/ticketService.ts` is the only intended table surface for `tickets`; it handles list/create/update, auto-routing via `src/services/requestRoutingService.ts`, activity entries, and notifications. It includes fallback selects for older schemas missing operational/custom field columns.
- Request setup APIs: `requestCategoryService`, `requestSubcategoryService`, `requestTemplateService`, `requestRoutingService`, `requestFormFieldService`, `ticketAttachmentService`, plus hooks under `src/hooks/useRequest*`.
- Sales APIs: `salesOrderService`, `customerService`, `invoiceService`, `salesAdvisorService`, `salesTargetService`, and `masterDataService`; `SalesContext` also subscribes to realtime `sales_orders`.
- HRMS admin APIs: `src/services/hrmsAdminService.ts`, `approvalFlowService.ts`, `approvalEngineService.ts`, and services under `src/services/hrms/*`.
- Shared HRMS self-service API: `packages/hrms-services/src/index.ts` is consumed by HRMS mobile and includes profile contact update, leave types/requests, attendance clocking, payslips, announcements, notifications, appraisals, and leave approval bootstrap logic.
- Edge functions:
  - `invite-user`: authenticated admin invite/profile provisioning.
  - `delete-user`: authenticated admin deletion of never-signed-in invited users.
  - `send-push-notification`: service-role or manager+ JWT caller, company-scoped recipients, Android FCM support, iOS APNs pending.
  - `rollover-leave-balances`: admin-only annual leave balance rollover.
- Edge CORS: `supabase/functions/_shared/cors.ts` uses `ALLOWED_ORIGINS` allow-list, defaulting to localhost origins when unset.

## Workflows

- Local dev: `supabase start`, then `npm run dev`. README says self-service signup is disabled; users are created/invited via Supabase/admin flows. Known local test login is documented in `README.md`.
- Production deployment: push to `main` runs CI, then `.github/workflows/main-deploy.yml` builds/pushes a GHCR image and deploys through Cloudflare Access SSH using `scripts/deploy-image.sh`.
- Deploy image: `Dockerfile` builds root app and optionally HRMS web (`BUILD_HRMS_WEB=true`), serves via nginx on port 8080, and proxies Supabase `/auth|rest|graphql|functions|storage/v1` and `/realtime/v1` to `SUPABASE_INTERNAL_URL`.
- Production domains from docs/config: main app `https://ubs.protonfookloi.com`, HRMS `https://hrms.protonfookloi.com`. `VITE_HRMS_APP_URL` is required for production/staging main-app builds.
- `docker/nginx.conf` contains two server blocks: HRMS hostname serves `/usr/share/nginx/html/hrms-root`; default server serves root app and same-origin `/hrms/` bundle. Both include security headers and `no-store` for SPA HTML.
- PWA/service worker: `vite.config.ts` uses Workbox `navigateFallback: "/index.html"`. Supabase same-origin API paths must stay in `navigateFallbackDenylist` (`/auth/v1`, `/rest/v1`, `/graphql/v1`, `/functions/v1`, `/storage/v1`, `/realtime/v1`) so auth email verification links reach Kong/GoTrue instead of booting the SPA.
- Auth verify rescue: `src/pages/AuthVerifyPage.tsx` is deliberately registered at `/auth/v1/verify` as a compatibility fallback for browsers already controlled by an older service worker. It fetches the real same-origin Auth verify URL as a non-navigation request and redirects to Supabase's final `/reset-password` or `/signup` URL.
- CI gates in `.github/workflows/ci.yml`: lint, typecheck + RPC contract check, unit tests, production build, bundle budget, HRMS mobile build, Playwright smoke/accessibility/responsive tests, optional RLS matrix on push.
- Production verification scripts: `npm run verify:production` and `npm run smoke:production`. `docs/LAUNCH_CHECKLIST.md` notes 2026-05-06 production validation for commit `70820b7`, production verification, HRMS ingress activation, production super admin creation, and 57/57 module smoke routes passing.
- Backup/DR: `.github/workflows/db-backup.yml`, `docs/BACKUP_DR.md`, `docs/DR_DRILLS.md`, and `docs/INCIDENT_RESPONSE.md`. Launch checklist still marks PITR/restore drill evidence as open.
- Security workflow: `scripts/security-check.sh`, `scripts/check-edge-functions.ts`, `docs/SECURITY_SIGNOFF.md`, and optional live RLS matrix evidence.

## Constraints

- Production sensitivity: this repository is push-to-deploy and may be checked out on the production server with a live local Supabase stack. Avoid destructive commands. Check `git status` before edits; existing dirty files may be production-local changes.
- Current dirty worktree discovered 2026-05-08: `docs/ENV.md`, `scripts/configure-supabase-auth-smtp.env.example`, `scripts/configure-supabase-auth-smtp.sh`, `scripts/setup-production-host.sh`, `supabase/.temp/cli-latest`, and `supabase/config.toml` were modified before this context file was created. Do not overwrite without reviewing.
- Public signup is disabled at `[auth].enable_signup=false`, but email auth must remain enabled for login, invites, and password recovery.
- Production Supabase Auth email uses Resend SMTP (`GOTRUE_SMTP_HOST=smtp.resend.com`, user `resend`, sender `FOOK LOI SYSTEM`). GoTrue also enforces its own `auth.rate_limit.email_sent`; keep `[auth.rate_limit].email_sent = 30` in `supabase/config.toml`/production bootstrap and restart `flc-bi-supabase.service` after changes. Do not confuse this hourly GoTrue throttle with Resend's monthly quota.
- 2026-05-08 live note: Supabase Auth was manually restarted with the existing Resend credential in-process and now reports `GOTRUE_RATE_LIMIT_EMAIL_SENT=30`. `/etc/flc-bi/supabase.env` now exists with `AUTH_SMTP_PASS`, `/etc/systemd/system/flc-bi-supabase.service` reads it via `EnvironmentFile=-/etc/flc-bi/supabase.env`, and the stored secret hash matches the running Auth container. Reboot persistence for Resend SMTP is closed.
- Service-role key must never ship to the client. Client env is limited to public Vite variables; edge functions/scripts own service secrets.
- RLS is primary authorization; client route gates are not security boundaries. Any new table needs explicit company/self/admin RLS plus updates to `docs/RLS_MATRIX.md` and tests where practical.
- The generated Supabase types are incomplete/stale for newer request tables and some RPC returns (`unknown`); `src/services/ticketService.ts` and request setup services isolate `as never`/local shims until types are regenerated.
- Architecture doc says pages/components must not call Supabase directly, but contexts still do. New feature work should prefer services; refactors should move direct calls out of contexts when risk is manageable.
- Auto Aging performance: Vehicle Explorer uses `search_vehicles` server pagination, and overview uses `auto_aging_dashboard_summary` plus a capped `searchVehicles(limit: 2000)` sample. However `DataContext` still hydrates all vehicles in chunks for full-mode routes, and `ReportCenter` still derives exports/reports from full `useData().vehicles`.
- Dashboard charts use the 2,000-row search sample for visual drilldowns; if total count exceeds sample, detailed chart/outlier views may not represent the whole fleet.
- `DataContext.getDataLoadMode()` uses summary-only only for exact `/auto-aging`; sibling Auto Aging routes load full data through context.
- `send-push-notification` Android FCM is implemented; iOS APNs is logged as pending implementation.
- Launch checklist still has open production evidence: rotated prod env, host bootstrap/reverse proxy confirmation, live RLS/security sign-off, CORS production pinning, Sentry/alerts/source maps, PITR/backups/restore drill, uptime, load test, coverage target, rollback drill, OSV/CodeQL evidence.
- Dependency audit accepted exceptions in `docs/SECURITY.md`: moderate `esbuild`/`vite` dev-server issue and low test-runtime transitive issues; production static nginx bundle is considered not exposed.

## Last Updated

- 2026-05-08: Initial PROJECT_CONTEXT.md created from live repo deep dive. Captured auth/profile flow, roles/scopes, module architecture, Supabase schema/API contracts, deploy workflow, production constraints, dirty worktree state, and current tech debt.
- 2026-05-08: Invite/reset auth-link fix: Supabase PKCE email verification can redirect back to `/signup?code=...` or `/reset-password?code=...` without preserving `type`. `src/pages/SignUpPage.tsx` and `src/pages/ResetPasswordPage.tsx` now accept bare code callbacks on their dedicated routes. `supabase/templates/invite.html` should use `{{ .ConfirmationURL }}` rather than hand-building session-token fragments.
- 2026-05-08: Password reset 404 root cause: existing PWA service workers could intercept top-level `/auth/v1/verify?...` email-link navigations and serve `index.html`, causing React `NotFound` at the Auth URL. `vite.config.ts` must denylist Supabase proxy paths from Workbox navigation fallback. `src/pages/AuthVerifyPage.tsx` exists as a rescue route for clients that are already controlled by the older service worker.
- 2026-05-08: Checked production Auth SMTP/rate-limit drift. Live GoTrue is configured for Resend SMTP, but effective `GOTRUE_RATE_LIMIT_EMAIL_SENT` was still 2, producing `/recover` 429 `over_email_send_rate_limit`. Durable config now sets `[auth.rate_limit].email_sent = 30` and production SMTP/bootstrap scripts expose `AUTH_RATE_LIMIT_EMAIL_SENT`.
- 2026-05-08: Applied live rate-limit change by restarting Supabase with the existing Resend credential from the running Auth container. Verified live GoTrue reports `GOTRUE_RATE_LIMIT_EMAIL_SENT=30` and `/auth/v1/health` returns 200. Verified `/etc/flc-bi/supabase.env` persistence and matching SMTP secret hash with sudo.
- 2026-05-08: Invite flow check: invite links use the same GoTrue `/auth/v1/verify` path as reset links but with `type=invite` and `redirect_to=/signup`. Live invalid-token probes for `https://ubs.protonfookloi.com/auth/v1/verify?...type=invite&redirect_to=https://ubs.protonfookloi.com/signup` and HRMS equivalent returned GoTrue `303` redirects to `/signup`, not SPA 404s. Live `GOTRUE_URI_ALLOW_LIST` includes main and HRMS signup/reset paths.

## Change Log

- 2026-05-08: Added durable context file per Memory & Context Protocol. Future sessions must read this first and update it in place when discovering drift.
- 2026-05-08: Documented PKCE invite/recovery callback behavior and invite template rule after fixing reset/invite link handling.
- 2026-05-08: Documented service-worker interception of `/auth/v1/verify` email links and the `/auth/v1/verify` SPA rescue route.
- 2026-05-08: Documented live Resend SMTP status and GoTrue email-send rate-limit mismatch.
- 2026-05-08: Added durable `AUTH_RATE_LIMIT_EMAIL_SENT`/`[auth.rate_limit].email_sent` config path for production Supabase Auth email.
- 2026-05-08: Closed production SMTP persistence note after verifying `/etc/flc-bi/supabase.env`, systemd `EnvironmentFile`, and matching Auth SMTP secret hash.
- 2026-05-08: Documented live invite verify path checks for main and HRMS domains.
