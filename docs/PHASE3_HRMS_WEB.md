# Phase 3 HRMS Web

Status: Started
Started: 2026-04-28

## Objective

Bring the core HRMS experience into a dedicated web app so HR, managers, payroll/admin users, and employees can use HRMS workflows without the broader FLC BI shell.

## Slice 1: Dedicated App And Core Routes

Delivered:

- Added `apps/hrms-web` as an npm workspace app.
- Added standalone Vite, TypeScript, Tailwind, and PostCSS configuration.
- Reused the existing root auth, theme, toast, error boundary, module access, and HRMS page components.
- Added an HRMS-branded login page that keeps the existing Supabase auth behavior.
- Configured the app to load Vite environment variables from the repository root.
- Added an HRMS-only layout with HRMS navigation only.
- Mounted Phase 3 priority routes:
  - `/leave`
  - `/attendance`
  - `/approvals`
  - `/appraisals`
  - `/announcements`
  - `/profile`
- Mounted secondary HRMS routes for continuity:
  - `/leave/calendar`
  - `/employees`
  - `/payroll`
  - `/settings`
  - `/approval-flows`
- Added compatibility redirects from existing main-app HRMS paths such as `/hrms/leave` to the dedicated route shape.
- Kept non-HRMS modules out of the dedicated route tree.

Validation:

```bash
npm run build --workspace apps/hrms-web
```

Result, 2026-04-28: passed.

Local smoke, 2026-04-28: `npm run dev --workspace apps/hrms-web` starts on `http://localhost:3001/`; `/login` renders the HRMS-branded auth screen.

## Remaining Phase 3 Work

- Add focused tests for HRMS web routing and role-gated navigation.
- Run browser smoke coverage for authenticated HRMS web flows once UAT credentials are available.
- Decide the target HRMS web domain and deployment path.
- Add a Docker/nginx build target or release workflow for `apps/hrms-web`.
- Verify Supabase redirect URLs for login, invite signup, forgot password, and reset password on the HRMS domain.
- Replace compatibility redirects with native dedicated-app links where reused HRMS components still point to `/hrms/*`.
- Review each reused HRMS page for root-shell assumptions before Phase 3 close.