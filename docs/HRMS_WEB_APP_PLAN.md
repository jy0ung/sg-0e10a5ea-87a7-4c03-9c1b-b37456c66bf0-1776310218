# HRMS Dedicated Web App Plan

## Goal

Create a dedicated HRMS-only frontend with its own URL, navigation, and deployment lifecycle so employees and HR users interact only with HRMS workflows instead of the full FLC BI application shell.

Target outcome:

- Main app stays focused on the broader business platform.
- HRMS gets its own web experience at a separate URL such as `https://hrms.example.com`.
- Mobile remains employee-first and uses the existing `apps/hrms-mobile` Capacitor app path.

## Recommendation

Use a two-channel model:

1. Dedicated web app for browser users: `apps/hrms-web`
2. Dedicated mobile app for iOS/Android: continue with `apps/hrms-mobile`

Do not use a PWA-only strategy as the primary mobile delivery model.

Use PWA later only as an optional secondary install path for lighter use cases.

## Why This Fits The Current Repo

The repository already supports this split.

- The monorepo uses workspaces in the root `package.json`.
- There is already a separate mobile app in `apps/hrms-mobile`.
- HRMS business logic is already shared through `packages/types`, `packages/hrms-schemas`, `packages/hrms-services`, and the Supabase package.
- The current web app is a multi-module SPA, so a dedicated HRMS shell will reduce route, menu, and permission complexity for HRMS-only users.

## Mobile Decision: Capacitor vs PWA

### Recommended Decision

Keep `apps/hrms-mobile` as the primary mobile channel for iOS and Android.

Add PWA support later only if there is a specific business need for browser installability.

### Why Capacitor Wins Here

This repo already has Capacitor setup, mobile routing, push-notification notes, and deep-link guidance in `apps/hrms-mobile/SETUP.md`.

That means the native-packaged path is already started, while PWA support does not yet exist in the web app.

### Comparison

| Area | PWA | Capacitor App |
|------|-----|---------------|
| Existing repo baseline | Not present | Already present |
| iOS install UX | Weaker | Stronger |
| Push notifications | Weaker / more constrained | Better |
| Deep links | Limited | Better |
| App Store / Play Store distribution | No | Yes |
| Device APIs | Limited | Better |
| Offline support | Possible | Possible |
| Time to first version | Faster | Moderate |
| Long-term HRMS employee app quality | Lower | Higher |

### Recommended Split By Channel

Dedicated web app should serve:

- HR team
- managers
- payroll/admin users
- desktop-heavy workflows

Mobile app should prioritize:

- leave apply / leave history
- attendance
- payslip
- appraisal self review
- acknowledgement
- announcements
- profile

Manager-heavy workflows can stay web-first unless mobile demand is proven.

## Proposed Architecture

### New App

Create a new workspace app:

`apps/hrms-web`

Suggested structure:

```text
apps/hrms-web/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    routes.tsx
    layout/
      HrmsLayout.tsx
      HrmsSidebar.tsx
      HrmsTopbar.tsx
    contexts/
      AuthContext.tsx
    pages/
      LoginPage.tsx
      DashboardPage.tsx
      LeavePage.tsx
      LeaveCalendarPage.tsx
      AttendancePage.tsx
      PayrollPage.tsx
      AppraisalsPage.tsx
      ApprovalsPage.tsx
      AnnouncementsPage.tsx
      EmployeesPage.tsx
      ProfilePage.tsx
      SettingsPage.tsx
```

### Shared Packages To Reuse

The new app should directly reuse existing shared packages:

- `@flc/types`
- `@flc/supabase`
- `@flc/hrms-schemas`
- `@flc/hrms-services`

### Frontend Reuse Strategy

Do not keep HRMS permanently coupled to the current root SPA.

Recommended reuse sequence:

1. Reuse shared backend/domain packages immediately.
2. Extract reusable web shell pieces only when needed.
3. Keep the new HRMS app independent from non-HRMS module code.

Short-term, some UI primitives can still be shared with the root app if needed.

Medium-term, extract the reusable UI foundation into a package if both apps depend on it.

## Route Scope For The Dedicated HRMS App

The dedicated HRMS web app should only expose HRMS routes.

Recommended route set:

- `/login`
- `/`
- `/leave`
- `/leave/calendar`
- `/attendance`
- `/payroll`
- `/appraisals`
- `/approvals`
- `/announcements`
- `/employees`
- `/profile`
- `/settings`

Do not expose routes for:

- sales
- auto-aging
- purchasing
- inventory
- reports outside HRMS scope
- non-HRMS admin tools

## Auth And Session Design

### Important Behavior

The current auth flow uses Supabase browser session storage tied to the app origin.

That means:

- `app.example.com` session and `hrms.example.com` session will not automatically behave like a shared browser session boundary.
- Users may need to sign in separately in each app unless a future SSO/broker pattern is introduced.

### Short-Term Decision

Accept separate sign-in per app origin for the first rollout.

This is simpler, safer, and aligned with the current implementation.

### Required Environment Behavior

Set `VITE_APP_URL` for the HRMS web app to the HRMS domain so password-reset and auth redirects resolve correctly.
Set `VITE_HRMS_APP_URL` for the main app when the launcher should send users to a separate HRMS origin instead of the same-origin `/hrms/` mount.
Keep `VITE_SUPABASE_ANON_KEY` in the standalone HRMS build args; the dedicated app will not boot without it even if `VITE_SUPABASE_URL` is correct.

For the local/self-hosted Supabase config, disable public signup at `[auth].enable_signup = false`, but leave `[auth.email].enable_signup = true` so invited users can still sign in and request password resets.

Example:

```env
VITE_APP_URL=https://hrms.example.com
VITE_HRMS_APP_URL=https://hrms.example.com
```

## Deployment Shape

Recommended domain split:

- Main app: `https://app.example.com`
- HRMS app: `https://hrms.example.com`

Both apps can point to the same Supabase project and share the same data model.

Deployment characteristics:

- separate build pipeline
- separate environment variables
- separate release cadence if needed
- shared backend and user base

## Implementation Phases

### Phase 0: Preparation

Deliverables:

- confirm domain naming
- confirm initial route list
- confirm which users will use HRMS web vs mobile
- confirm whether payroll stays web-only for v1

Technical tasks:

- define env names for HRMS web
- confirm Supabase redirect URLs for new domain
- confirm deployment target for `apps/hrms-web`

### Phase 1: Scaffold `apps/hrms-web`

Deliverables:

- standalone Vite app in `apps/hrms-web`
- working build/dev scripts
- shared package aliases wired

Technical tasks:

- create `apps/hrms-web/package.json`
- create `apps/hrms-web/vite.config.ts`
- create `apps/hrms-web/tsconfig.json`
- create `apps/hrms-web/index.html`
- create `src/main.tsx` and `src/App.tsx`

Acceptance criteria:

- `npm run dev --workspace apps/hrms-web` starts
- `npm run build --workspace apps/hrms-web` passes

### Phase 2: Auth Shell And HRMS Layout

Deliverables:

- dedicated HRMS login flow
- HRMS-only layout and sidebar
- route protection

Technical tasks:

- add `AuthContext` for the new app
- add protected route wrapper
- add HRMS-only shell layout
- add role-gated navigation for HRMS pages only

Acceptance criteria:

- authenticated HRMS user lands in HRMS shell only
- non-HRMS modules are not visible or routable in the new app

### Phase 3: Bring Over Core HRMS Pages

Status: Started on 2026-04-28. Current implementation evidence is tracked in `docs/PHASE3_HRMS_WEB.md`.

Initial priority pages:

1. leave
2. attendance
3. approvals
4. appraisals
5. announcements
6. profile

Secondary pages:

1. employees
2. payroll
3. HRMS settings/admin

Technical tasks:

- mount/rebuild page routes in `apps/hrms-web`
- reuse existing HRMS services
- remove dependencies on root-app navigation assumptions
- keep toasts, dialogs, and UI behavior consistent

Acceptance criteria:

- core HRMS pages work from the dedicated app
- role gating still works
- approval flows behave the same as in the main app

### Phase 4: Shared Frontend Extraction

Status: UAT validated on 2026-04-29. Current implementation evidence is tracked in `docs/PHASE4_HRMS_SHARED_FRONTEND.md`.

Goal:

reduce duplication between root web and HRMS web.

Candidate extractions:

- shared auth shell helpers
- shared UI foundation
- shared HRMS page fragments
- shared route guards

Do this incrementally, not as a prerequisite for the first HRMS web launch.

### Phase 5: Standalone HRMS Rollout

Status: UAT subdomain validated on 2026-04-29 with the official standalone HRMS GHCR image. Production rollout remains gated on production DNS, production Supabase/auth verification, and production deploy secrets.

Completed UAT deliverables:

- standalone HRMS UAT domain deployed at `https://hrms-uat.protonfookloi.com`
- Cloudflare ingress routes HRMS UAT traffic to the standalone container on `127.0.0.1:8082`
- Supabase redirect allow-list includes mounted HRMS routes and standalone HRMS UAT/production routes
- standalone HRMS password-reset email flow verified on the HRMS UAT domain
- reset link handling fixed for Supabase recovery callbacks that are consumed before the React page reads URL parameters
- local break/fix deployment path added through `scripts/deploy-hrms-uat-local.sh`
- official standalone HRMS image published from Release workflow run `25108328607`
- official standalone HRMS image deployed to HRMS UAT through the local health-gated deploy script
- standalone HRMS verifier passes against `https://hrms-uat.protonfookloi.com`

Current UAT evidence:

- live HRMS UAT container: `flc-bi-hrms-uat`
- latest validated image: `ghcr.io/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218-hrms-web:0.1.0`
- latest live break/fix image after settings layout polish: `flc-bi-uat:hrms-settings-layout-04510e3`
- release run: `25108328607`, `v0.1.0`, digest `sha256:92de21a8433b8dbb1bded9f69e359fd6dbfb4efa5ab3ed3c9a201da75ec84192`
- public health check: `https://hrms-uat.protonfookloi.com/healthz` returns `ok`
- verifier: `UAT_APP=hrms-web UAT_URL=https://hrms-uat.protonfookloi.com UAT_EXPECTED_SUPABASE_URL=https://uat.protonfookloi.com UAT_HEALTH_URL=https://hrms-uat.protonfookloi.com/healthz npm run verify:uat` passed
- credentialed GitHub UAT synthetic run `25111751762` passed on 2026-04-29 with `environment=uat-hrms`, `app=hrms-web`, and `PASS browser login flow - redirected to /`
- fresh Mailpit reset email redirects to `https://hrms-uat.protonfookloi.com/reset-password` and opens the `Set your new password` form

Gap assessment, 2026-04-29:

| Area | Status | Gap | Required action |
| ---- | ------ | --- | --------------- |
| UAT standalone domain | Closed | None for shell, health, bundle config, mocked-auth shell smoke, and reset-link landing on the official `hrms-web:0.1.0` image | Keep `scripts/deploy-hrms-uat-local.sh` for break/fix validation; use GHCR image tags for release candidates |
| UAT credentialed automation | Closed | `uat-hrms` verifier secrets are configured and workflow run `25111751762` passed credentialed browser login | Keep `UAT_LOGIN_EMAIL`, `UAT_LOGIN_PASSWORD`, and optionally `UAT_LOGIN_REQUIRED=1` current in the `uat-hrms` GitHub environment |
| Password update acceptance | Partial | Reset link landing is verified; changing the user's real password was not automated to avoid altering a user credential without an explicit acceptance step | Have the user complete one password update in UAT, then log in with the new password and record evidence |
| Release publication | Closed | `v0.1.0` was published as GHCR image tag `0.1.0` | Use `TAG=v0.1.0` for Release workflow dispatch and `IMAGE_TAG=0.1.0` for deploy workflow dispatch |
| CI/CD deploy environments | Partial | `uat-hrms` release/verifier secrets are set, but GitHub Deploy workflow still lacks SSH and Cloudflare Access service-token secrets | Add `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` to `uat-hrms`; add full production equivalents later |
| Production DNS/ingress | Open | `hrms.protonfookloi.com` is not yet deployed or verified | Add Cloudflare tunnel ingress/DNS for production HRMS and map it to the production HRMS container/upstream |
| Production Supabase/auth | Open | Production auth allow-list and SMTP/reset email behavior still need live verification | Confirm production Supabase redirect URLs include `https://hrms.protonfookloi.com/reset-password`; send a recovery email and verify redirect acceptance |
| Production launch evidence | Open | No production health, login, reset, or HRMS workflow evidence exists yet | Run production verifier equivalent plus manual smoke for login, leave, appraisals, approvals, and reset-password |
| User communications | Open | HRMS subdomain availability and separate-origin sign-in behavior are not yet communicated | Prepare launch note explaining HRMS URL, first-login/reset flow, and main-app coexistence period |

Updated Phase 5 implementation sequence:

1. Complete UAT acceptance by having a real user update their password from the HRMS UAT reset form and log in with the new password.
2. Add the missing `uat-hrms` SSH/Cloudflare Access deploy secrets so `deploy-image.yml` can deploy and verify the standalone HRMS image without host-local manual deploys.
3. Configure production HRMS DNS/Cloudflare ingress and production deploy environment secrets when production rollout is approved.
4. Deploy the `hrms-web` image to `production-hrms` and validate health, bundle config, login, password reset, and representative HRMS workflows.
5. Send user communications and set a support/rollback window.

Acceptance criteria for Phase 5 closure:

- HRMS users can log in directly to the HRMS UAT and production domains
- no main-app navigation appears in HRMS web
- password reset works end to end on both HRMS UAT and production domains
- leave, appraisals, and approvals work end to end in the standalone HRMS app
- UAT and production deployments use immutable GHCR images, not only local helper-built images
- UAT/prod verifier evidence is attached or referenced from the release notes

### Phase 6: Mobile Expansion

Status: Started on 2026-04-29 with read-only company announcements, employee appraisal self-review and acknowledgement, and the mobile notification inbox in `apps/hrms-mobile`.

After HRMS web launch, extend `apps/hrms-mobile` with the next employee-first flows:

1. announcements - shipped as a read-only mobile feed with category filters
2. appraisal self review - shipped for assigned employee appraisal items
3. appraisal acknowledgement - shipped after manager review is completed
4. approval notifications - shipped as a mobile notification inbox with realtime inserts and mark-read actions
5. profile improvements

Keep web as the primary channel for admin-heavy HRMS workflows unless mobile usage proves necessary.

## Migration Sequence From The Current Main App

Recommended migration order:

1. Scaffold `apps/hrms-web`
2. Add login and HRMS-only layout
3. Move leave and approvals first
4. Move appraisals next
5. Move announcements and profile
6. Move attendance
7. Move employees and payroll last

Reason:

- leave, approvals, and appraisals are the cleanest user-facing HRMS slices already implemented
- employees and payroll have more admin-heavy behavior and can follow after the shell is proven

## Known Constraints

1. Separate subdomain means separate browser-origin auth behavior unless a later SSO strategy is introduced.
2. Some current HRMS pages may still assume the root app shell and may need light refactoring when moved.
3. Mobile is already Capacitor-based, so introducing a separate PWA track now would add an extra delivery model without immediate operational benefit.

## Recommended First Execution Sprint

Sprint goal:

ship a working `apps/hrms-web` shell with auth and the first 3 HRMS pages.

Sprint scope:

- scaffold app
- add login + auth context
- add HRMS layout
- wire routes for:
  - leave
  - approvals
  - appraisals
- configure env and domain assumptions
- ensure build and typecheck pass

Out of scope for sprint 1:

- PWA setup
- app-store work
- full payroll migration
- full admin migration

## Final Recommendation

Proceed with:

1. `apps/hrms-web` as a dedicated HRMS browser app
2. `apps/hrms-mobile` as the primary iOS/Android channel
3. no PWA-first strategy for mobile
4. optional PWA support later only if there is a specific install/offline requirement

This gives the cleanest user experience, fits the current repo, and avoids introducing a weaker mobile delivery strategy when a better one is already partially built.