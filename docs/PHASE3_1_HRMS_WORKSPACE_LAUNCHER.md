# Phase 3.1 HRMS Workspace Launcher

Status: UAT validated
Started: 2026-04-28
Validated: 2026-04-28
Deployed: 2026-04-28

## Objective

Make the dedicated HRMS workspace at `/hrms/` the canonical web surface for HRMS workflows while keeping the main app HRMS module as a launcher.

## Gap Assessment

| Area | Current gap | Phase 3.1 action |
| --- | --- | --- |
| Main app module directory | The HRMS module card still targeted the embedded main-app route `/hrms/employees`. | HRMS module metadata now points to `/hrms/`, and module-card clicks perform a browser navigation so the dedicated workspace loads. |
| Main app sidebar | The sidebar exposed individual HRMS workflow links inside the main app shell. | The HRMS section is now a single `Open HRMS Workspace` launcher and the section header links to `/hrms/`. |
| Main app route table | `src/main.tsx` still mounted shared HRMS workflow components under `/hrms/*`. | Embedded HRMS route elements were replaced by a protected handoff page for `/hrms` and `/hrms/*`. |
| Legacy route aliases | Old main-app paths used `/hrms/admin` and `/hrms/leave-calendar`, while the dedicated app uses `/hrms/settings` and `/hrms/leave/calendar`. | A shared HRMS workspace helper maps those legacy paths to the dedicated route shape before handoff. |
| Login/session model | Risk of treating HRMS as a separate auth island. | No auth split was introduced. The launcher keeps the same origin and Supabase session. |

## Reassessment 2026-04-28

No blocking local gaps remain for Phase 3.1.

| Check | Result |
| --- | --- |
| Main-app HRMS route surface | `src/main.tsx` no longer mounts embedded HRMS workflow components under the main shell. `/hrms` and `/hrms/*` are protected handoff routes, with explicit compatibility redirects for `/hrms/admin` and `/hrms/leave-calendar` before the protected handoff target. |
| Sidebar/module entry points | Main app navigation exposes HRMS as a single launcher only. The old workflow subnav entries were removed from `AppSidebar`. |
| Dedicated HRMS workspace | Dedicated app route/nav metadata remains the canonical workflow surface and still carries the detailed HRMS pages. |
| Legacy deep links | Old main-app deep links are still accepted and converted to dedicated workspace paths where route names changed. Query strings and hashes are preserved for canonicalized aliases. |
| Shared login/session | No separate credential path was introduced. Main app and HRMS continue to use the same Supabase session and profile/employee linkage. |
| Residual references | Remaining `/hrms/admin` and `/hrms/leave-calendar` references are compatibility tests only. Shared HRMS page components remain in `src/pages/hrms` because `apps/hrms-web` reuses them. |

UAT deployment is complete for the Phase 3.1 launcher slice. The only residual validation limitation is that the standard UAT verifier skipped the real browser login check because `UAT_LOGIN_EMAIL` and `UAT_LOGIN_PASSWORD` were not present in this shell. Live browser smoke used mocked Supabase responses to validate authenticated launcher and legacy-alias behavior without exposing credentials.

## Implementation Mapping

- `src/lib/hrmsWorkspace.ts` owns HRMS workspace URL normalization and legacy route alias mapping.
- `src/pages/hrms/HrmsWorkspaceRedirect.tsx` handles old main-app `/hrms/*` routes and forwards users to the dedicated workspace.
- `src/main.tsx` keeps deterministic compatibility redirects for `/hrms/admin` and `/hrms/leave-calendar`, preserving query strings and hashes while canonicalizing to dedicated workspace paths before the protected handoff route enforces HRMS module access.
- `src/components/layout/AppSidebar.tsx` keeps HRMS visible as a module section but removes embedded workflow navigation.
- `src/pages/ModuleDirectory.tsx` opens HRMS with a full browser navigation instead of React Router SPA navigation.
- `src/data/demo-data.ts` points the HRMS module card to `/hrms/`.

## Validation Evidence

- UAT image, 2026-04-28: `flc-bi-uat:phase3-1-launcher-20260428-r2` deployed to container `flc-bi-uat`, healthy on `127.0.0.1:8080`.
- UAT deployment verification, 2026-04-28: `npm run verify:uat` passed for `https://uat.protonfookloi.com/healthz` and confirmed the live main bundle uses `https://uat.protonfookloi.com` as the browser Supabase URL. Browser login was skipped because UAT credentials were not present in this shell.
- Public UAT shell smoke, 2026-04-28: `/` served title `Fook Loi Group UBS`; `/hrms/` served title `FLC HRMS`; the HRMS hashed JavaScript asset under `/hrms/assets/` returned HTTP 200.
- Live UAT Phase 3.1 browser smoke, 2026-04-28: with mocked Supabase responses for an authenticated super admin, the main Module Directory HRMS card opened `/hrms/`, the main sidebar HRMS link pointed to `/hrms/`, `/hrms/admin` canonicalized to `/hrms/settings`, `/hrms/leave-calendar?view=team#month` canonicalized to `/hrms/leave/calendar?view=team#month`, and no route error was visible.
- Dedicated HRMS mounted alias fix, 2026-04-28: UAT smoke found that deployed `/hrms/admin` and `/hrms/leave-calendar` needed direct mounted aliases in addition to nested local compatibility paths. Added `admin -> /settings` and `leave-calendar -> /leave/calendar` in `apps/hrms-web/src/routes.ts`, with query/hash preservation in the dedicated app redirect component.
- Reassessment retest, 2026-04-28: focused Phase 3.1 unit tests, focused main-app launcher browser tests, TypeScript, full unit suite, dedicated HRMS browser smoke, and whitespace check all passed.
- Focused helper and HRMS metadata tests: `npm run test -- src/lib/hrmsWorkspace.test.ts apps/hrms-web/src/App.test.tsx apps/hrms-web/src/layout/HrmsLayout.test.tsx` passed with 3 files and 10 tests.
- Corrected HRMS web metadata tests after mounted alias fix: `npm run test -- apps/hrms-web/src/App.test.tsx apps/hrms-web/src/layout/HrmsLayout.test.tsx` passed with 2 files and 6 tests.
- Main app HRMS launcher browser smoke: `npx playwright test e2e/hrms.spec.ts e2e/hrms-admin.spec.ts --project=chromium` passed with 6 Chromium tests.
- TypeScript: `npm run typecheck` passed.
- Full unit suite: `npm run test` passed with 38 files and 304 tests.
- Main app build: `npm run build` passed.
- Dedicated HRMS build: `npm run build --workspace apps/hrms-web` passed.
- Dedicated HRMS browser smoke: `npm run test:e2e --workspace apps/hrms-web` passed with 6 Chromium tests after adding mounted alias coverage.
- Lint: `npm run lint` completed with 0 errors and 141 existing warnings.
- Whitespace: `git diff --check` passed.