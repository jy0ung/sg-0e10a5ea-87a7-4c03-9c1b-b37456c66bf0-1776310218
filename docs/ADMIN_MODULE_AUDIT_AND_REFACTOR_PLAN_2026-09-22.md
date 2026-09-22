# Admin Module Audit and Refactor Plan

Date: 2026-09-22
Status: Source, architecture, security, and automated-test audit complete. Browser visual audit and lifecycle reproduction are pending an approved browser choice.
Scope: Main application Admin module (`/admin/*`), its shared UI, auth/session dependencies, Supabase services and policies, and the reported refresh/form-loss behavior.

## Executive summary

The Admin module is functional but has grown as a collection of route-level pages rather than a cohesive administrative product. It has useful shared foundations—central route metadata, route and database authorization layers, TanStack Query defaults, `StandardTable`, reusable page states, Zod-backed forms on several CRUD pages, and tenant-scoped RLS—but information architecture, form safety, and implementation quality are inconsistent.

The most urgent confirmed defects are not visual:

1. `PermissionEditor` loads three general vehicle permissions but never saves them. Those switches also do not mark the editor dirty. Its save path is additionally gated by an unrelated hidden form-validity check.
2. Settings allows users to change their own branch, while the production-readiness database trigger explicitly rejects self-service `branch_id` changes.
3. Webhook HMAC secrets are selected with `*`, mapped into browser state, copied into the edit form, and displayed as ordinary text. This contradicts the database and TypeScript comments that describe the secret as opaque/write-only.
4. Role-section editing is vulnerable to a background query result overwriting a dirty local draft and saves roles in separate non-atomic requests.
5. Most Admin forms have no dirty-state protection. Profile settings is the one meaningful exception.
6. Navigation and context are inconsistent: account settings live inside the Admin section, `/admin` itself has no route, a webhook breadcrumb points to that missing route, System Health is routable but absent from registry navigation, and most filters/tabs are not URL-backed.

The reported refresh/form-loss root cause is **not yet confirmed**. Static analysis establishes what it is not: ordinary TanStack Query focus/reconnect behavior is disabled, and there is no application `focus`/`visibilitychange` handler that calls reload. The current build registers its service worker through a simple generated script, so the dependency's virtual-client auto-reload code is not present in the built application. Browser evidence is still required to distinguish service-worker activation, browser tab discard, auth loss/redirect, a real navigation, and component remounting. No speculative root cause is presented as fact in this report.

The recommended first implementation phase is a narrow lifecycle evidence and form-safety phase, not an Admin rewrite.

## Audit method and evidence boundary

Completed:

- Traced every Admin route and its navigation registry entry.
- Inspected all Admin pages and Admin-specific components.
- Traced shared tables, forms, query defaults, auth state changes, Supabase storage, PWA/service-worker configuration, service calls, and current security migrations.
- Searched the repository for lifecycle, reload, redirect, remount, and form-reset triggers.
- Reviewed unit/component/E2E coverage.
- Ran the full repository type/architecture gate and a focused Admin/auth/service test suite.

Pending:

- Browser screenshots at desktop and mobile widths.
- Keyboard and screen-reader spot checks in a real browser.
- Reproduction across tab switching, application switching, minimize/restore, inactivity, token refresh, history navigation, browser discard, and service-worker update.
- A deployed-build trace, if the production artifact differs from the local build.

Because the browser portion is pending, responsive and visual findings below are source-evidenced observations, not a claim that every issue was visually reproduced.

## 1. Current-state Admin module

### 1.1 Architecture

- React 18/Vite SPA with React Router route elements declared in `src/main.tsx`.
- Route/navigation metadata is centralized in `packages/shell/src/platformRegistry.ts`, but route elements remain hand-declared. A parity gate protects registry-to-router drift in only one direction.
- TanStack Query owns server data on the newer Admin pages. Several older components still use manual effects and local loading state.
- Presentation code goes through service modules rather than importing the Supabase client directly; the page-data boundary gate passes.
- Supabase is the backend. Services perform direct table queries or RPC calls. RLS and database triggers remain authoritative.
- Forms are split between React Hook Form/Zod and ad hoc local `useState` records.
- There is no Admin feature boundary. Pages import shared services and contexts directly, and large pages combine orchestration, policy decisions, transformations, and presentation.

### 1.2 Routes, navigation, and access

| Route | Current capability | UI access |
|---|---|---|
| `/admin/activity` | Audit-derived activity dashboard | Super Admin, Company Admin, Director, General Manager |
| `/admin/kpi-studio` | Role-home KPI configuration | Super Admin, Company Admin, Director; feature-flagged |
| `/admin/dms-sync` | DMS health, staging counts, sync runs, retry | Super Admin, Company Admin, Director; feature-flagged |
| `/admin/reconciliation` | Reconciliation review queue | Super Admin, Company Admin, Director; feature-flagged |
| `/admin/reconciliation/:matchId` | Reconciliation decision detail | Same as queue |
| `/admin/audit` | Audit log viewer | Super Admin, Company Admin, Director |
| `/admin/webhooks` | Endpoint and delivery operations | Super Admin, Company Admin; feature-flagged |
| `/admin/users` | Users, invitations, status, per-user permissions, role matrix | Super Admin, Company Admin |
| `/admin/user-groups` | User-group CRUD | Super Admin, Company Admin |
| `/admin/branches` | Branch CRUD | Super Admin, Company Admin |
| `/admin/master-data` | Twelve reference-data catalogs | Super Admin, Company Admin |
| `/admin/suppliers` | Supplier CRUD | Super Admin, Company Admin |
| `/admin/dealers` | Dealer CRUD | Super Admin, Company Admin |
| `/admin/health` | Database and operational metrics | Super Admin, Company Admin, Director; not in registry navigation |
| `/admin/settings` | Profile, password, notifications, modules, user roles, branding | No route-level role guard because it doubles as every user's account settings |
| `/profile` | Redirect only | Redirects to `/admin/settings` |
| `/admin/role-permissions` | Legacy redirect | Redirects to `/admin/users` |

There is no `/admin` landing route. The registry makes `/admin/settings` the Admin section root. Navigation is filtered by module state, dynamic role-section permissions, and per-item roles. `RequireRole` checks both role and section permission; RLS remains authoritative.

### 1.3 Major capabilities and behavior

**Users and permissions**

- Search, account-state and role filters.
- Pending-user activation, invitation, password reset, deactivate/reactivate/archive actions.
- Edit role, access scope, and branch.
- Bulk activate/deactivate behavior.
- Per-user vehicle column permissions and a separate role-to-section matrix.
- A second, simpler user-role editor also exists in Settings.

**Master and organization data**

- Branch, supplier, dealer, and user-group CRUD use dedicated pages.
- Master Data contains finance companies, insurance companies, models, colours, TIN types, registration fees, road-tax fees, inspection fees, handling fees, other products, payment types, and banks.
- Master Data preserves its active catalog in `?tab=...`; most other Admin tabs and filters do not preserve context.

**Governance and operations**

- Activity and Audit derive from audit-log data.
- DMS Sync and Reconciliation have purpose-built operational workflows and dedicated E2E coverage.
- Webhook Outbox polls deliveries every 15 seconds and supports endpoint configuration and retry.
- System Health polls every minute.

### 1.4 Shared components and conventions

Positive foundations:

- `PageHeader`, `EmptyState`, `PageErrorState`, and `TableSkeleton` establish a reusable page-state vocabulary.
- `StandardTable` provides client/server pagination hooks, search, sorting, selection, bulk actions, column visibility, optional virtualization, and mobile cards.
- Dedicated Branch, Supplier, Dealer, and User Group pages use React Hook Form and Zod.
- Destructive operations generally require a confirmation dialog.
- Mutations generally produce success/error toasts and invalidate relevant queries.

Inconsistencies:

- User Management and Audit Log use custom tables instead of the shared pattern.
- Master Data uses one generic visual dialog but twelve duplicated state and mutation paths.
- Error handling ranges from full retry states to console/log-only failure and empty-looking screens.
- Two toast systems are used (`sonner` and the local toast hook).
- Breadcrumb roots vary between the brand name, `FLC BI`, Settings, and a nonexistent `/admin` page.

### 1.5 Backend and permission model

- UI route guards combine coarse application roles and the persisted `role_sections` matrix.
- Tenant access is reinforced by RLS. The May master-data migration replaces broad read/write policies with company-scoped reads and admin-only writes.
- The September production-readiness migration adds restrictive enabled-user and tenant gates and a trigger preventing profile privilege escalation.
- Profile and Admin services add client-side context checks, but these are defense-in-depth; database policy is decisive.
- Several feature-flagged Admin tools add another visibility layer. Feature flags are not authorization controls.

## 2. Findings by severity

### Critical

No critical issue was proven from source alone. The refresh/form-loss report could become critical if it affects sensitive or long-running workflows, but severity should not be inflated until its trigger and blast radius are observed.

### High

#### H1. General vehicle permissions cannot be persisted

`PermissionEditor` loads `canEdit`, `canBulkEdit`, and `canViewDetails`, but its save handler writes only column permissions. The switches call their state setters directly, so they do not mark the editor dirty. The Save button therefore remains disabled for general-only changes. Applying a template marks the editor dirty but does not populate/validate the hidden React Hook Form values used by the save guard.

Impact: administrators can believe they changed authorization while nothing was saved, or be unable to save at all on some paths. This is a functional and access-control administration defect.

Fix direction: model one explicit permission draft, validate that draft rather than hidden fields, persist general and column permissions through one audited server operation, and add component plus RLS-backed integration tests.

#### H2. Webhook secrets are round-tripped and rendered in plaintext

The database schema says the HMAC secret is never returned in plaintext, but the client selects `webhook_endpoints.*`, maps `row.secret`, copies it into edit state, and renders it in a normal text input.

Impact: any compromised admin session, browser extension, screen capture, frontend logging mistake, or future overly broad endpoint policy can expose signing keys. RLS limits who can read the row but does not make a secret write-only.

Fix direction: stop selecting the secret; return a masked endpoint DTO through an RPC/view; make edits keep the existing secret unless the administrator explicitly rotates it; show a generated secret once on creation/rotation; store it encrypted using an appropriate server-side secret facility; never put it in drafts or telemetry.

#### H3. Settings offers a branch update that the database rejects

Profile Settings displays an editable Branch Assignment and submits `branch_id` for the signed-in user's own profile. The current database trigger rejects self changes to `branch_id` as an authorization field.

Impact: the UI promises an action that fails at save time and couples personal profile editing to an administrative assignment.

Fix direction: remove branch assignment from self-service Profile Settings. Keep branch assignment in Users. Split `updateOwnProfile` from `updateAdminProfile` at the service/type level so the frontend cannot construct this invalid mutation.

#### H4. Role-permission drafts can be overwritten and saves can partially apply

The role matrix mutates component state inside a query function. A later successful refetch can replace dirty local edits. Saving uses `Promise.all` across one call per role; if one request fails after others succeed, the database is left partially updated while the UI reports a failure.

Impact: silent draft loss and inconsistent authorization configuration.

Fix direction: query server state without side effects, create a separate draft only after initial load, block/confirm navigation while dirty, detect server-version conflicts, and use one transaction/RPC to save the matrix atomically.

#### H5. The reported state-loss event is not observable

The application has no lifecycle trace capable of distinguishing a browser navigation, service-worker activation, browser discard, auth redirect, route remount, or local-state reset. Most forms rely solely on component memory.

Impact: a high-friction defect can recur without actionable evidence, and attempted fixes risk treating the symptom.

Fix direction: add temporary privacy-safe lifecycle instrumentation and reproduce before changing PWA/auth behavior. The dedicated investigation plan is in section 4.

### Medium

#### M1. Account settings and Admin configuration are conflated

Every role is commonly allowed to see the `Admin` section because `/admin/settings` contains personal profile/security/notification tabs. Administrative module configuration, user roles, and organization branding share the same page.

Impact: confusing navigation semantics, oversized page state, permission complexity, and unnecessary exposure of an Admin-labeled workspace to non-admin users.

#### M2. Navigation has broken and hidden destinations

- Webhook breadcrumbs link to `/admin`, which has no route.
- System Health has a route but no platform-registry entry, so it is absent from normal navigation and smoke metadata.
- The parity gate detects registry entries without routes, but not routes missing from the registry.

#### M3. Admin context is usually ephemeral

Settings tabs, Users/Roles tab, user filters, searches, sorts, and pagination usually live only in component state. Back/forward, reload, and shareable links do not restore the administrator's working context. Master Data's `?tab=` handling is the useful exception.

#### M4. Substantial forms have inconsistent unsaved-change behavior

Profile Settings guards dirty navigation and avoids resetting on profile refresh. Password, branding, pending role edits, user invite/edit, permission editing, webhook configuration, and all CRUD dialogs do not. Closing a dialog can immediately reset its form.

Not every short CRUD form needs persistence, but every meaningful draft needs a consistent policy: safe close confirmation, deliberate discard, and—only where justified—draft restoration.

#### M5. Master Data is duplicated and eagerly loads every catalog

The 753-line page keeps twelve dialog states, twelve delete states, and repeated save/delete handlers. All twelve queries run when the page opens, and the page shows its global skeleton while any query is loading. Several query functions discard service errors by returning `data ?? []`, making failures look like empty datasets.

Impact: high maintenance cost, unnecessary requests, slow initial readiness, and misleading empty states.

#### M6. User Management is an oversized orchestration surface

At 1,240 lines, the page owns data acquisition, filtering, invitations, activation, editing, deletion, bulk operations, permissions, role configuration, and several dialogs. Its main profile query does not render a dedicated error state.

Impact: changes are risky, test setup is heavy, and behavior is difficult to reason about in isolation.

#### M7. Audit and activity surfaces are incomplete

- Audit Log always requests the first 200 rows and has no server pagination.
- Filters issue a request immediately on every individual change.
- The visible Export button has no handler.
- Load failure is logged but rendered as an empty result.
- Raw before/after JSON is hard to scan and may expose fields that need redaction.
- Activity Dashboard throws query errors but does not render an error state and derives charts client-side from a 200-row cap.

#### M8. Shared table preferences leak between unrelated tables

`StandardTable` stores hidden columns under one global local-storage key, `st-hidden-cols`. Hiding `name`, `status`, or `actions` in one table can hide the same key on another table.

Fix direction: require a stable `tableId`, namespace preferences by tenant/user/table/schema version, and provide Reset columns.

#### M9. Static accessibility gaps remain

- Sortable table headers use click handlers on `<th>` rather than keyboard-operable buttons with `aria-sort`.
- The column menu is a manually positioned panel without menu/focus-dismiss semantics.
- Audit rows are clickable but not keyboard-operable as rows; the nested expand button does not own all interaction behavior.
- Several dense matrices and tab strips need real keyboard and zoom testing.

These need browser/assistive-technology confirmation before final acceptance.

#### M10. Error, empty, and loading states are uneven

Branch/Supplier/Dealer/User Group/Webhook pages use the newer state components. Activity, Audit, System Health, Settings subqueries, and parts of User Management can render empty or null content after errors. This is operationally dangerous on Admin pages because an empty result can be mistaken for “nothing configured.”

### Low

- Labels mix “Activity Dashboard” and “Activity Overview,” “Users” and “Users & Roles,” and different brand/root breadcrumb names.
- Master Data status and boolean-like values are sometimes free-text fields (`Active / Inactive`, `Yes / No`) instead of controlled values.
- Several pages repeat role checks already enforced at the route. Defense-in-depth is acceptable, but role lists can drift.
- Fixed-height log/activity regions reduce available space on small displays and need visual tuning.
- Some refresh buttons do not visibly distinguish refreshing from idle.

## 3. UX and information-architecture redesign

### 3.1 Proposed structure

Move personal account tasks out of Admin while preserving compatibility redirects:

**My Account**

- Profile — `/profile`
- Security — `/profile/security`
- Notifications — `/profile/notifications`

**Administration**

- Overview — `/admin`
- Access & Organization
  - Users — `/admin/users`
  - Roles & Permissions — `/admin/roles`
  - User Groups — `/admin/user-groups`
  - Branches — `/admin/branches`
- Reference Data
  - Catalogs — `/admin/master-data?tab=...`
  - Suppliers — `/admin/suppliers`
  - Dealers — `/admin/dealers`
- Operations & Integrations
  - DMS Sync — `/admin/dms-sync`
  - Reconciliation — `/admin/reconciliation`
  - Webhooks — `/admin/webhooks`
- Governance & Insights
  - Activity — `/admin/activity`
  - Audit Log — `/admin/audit`
  - KPI Configuration — `/admin/kpi-studio`
  - System Health — `/admin/health`
- Platform Configuration
  - Modules — `/admin/modules`
  - Organization & Branding — `/admin/organization`

This introduces no new business capability. The Overview should initially be navigation, operational status, and recent administrative activity assembled from existing data—not a new reporting subsystem.

Legacy URLs should redirect to the closest new destination. Query parameters should preserve deep context.

### 3.2 Navigation rules

- `/admin` must be a real, authorized route and breadcrumb root.
- Registry metadata should remain the canonical source for labels, groups, icons, roles, feature flags, smoke coverage, and breadcrumbs.
- Extend parity checking in both directions: registry-to-router and router-to-registry for governed routes.
- Hide inaccessible destinations, but also return a clear unauthorized state on direct navigation.
- Feature-disabled pages should explain availability without exposing actions.
- Persist active tabs, filters, sorts, and pages in URL search parameters when they represent navigational context.

### 3.3 Reusable Admin patterns

Build on existing shared components rather than replace the design system:

1. `AdminPageShell`
   - Registry-derived title, description, breadcrumb, and access metadata.
   - Consistent primary action placement and page-state slots.

2. `AdminListPage` / enhanced `StandardTable`
   - Stable `tableId` and namespaced preferences.
   - URL-backed search/filter/sort/page state.
   - Server pagination for unbounded datasets.
   - Keyboard-operable sort buttons and `aria-sort`.
   - Explicit loading, retryable error, filtered-empty, and first-use empty states.

3. `AdminFilterBar`
   - Apply/Clear behavior for expensive server filters.
   - Active-filter summary and predictable mobile wrapping.

4. `AdminCrudDialog`
   - React Hook Form/Zod contract.
   - Inline validation, submit/error focus, saving state, and standardized success/error feedback.
   - Dirty close confirmation only after meaningful edits.

5. `DirtyFormBoundary`
   - One registry for in-app blocking and `beforeunload` behavior.
   - Scope-aware messages and explicit discard actions.
   - No warning for untouched/trivial forms.

6. `SecretRotationField`
   - Existing-secret state, explicit Rotate action, one-time reveal, copy feedback, and no plaintext rehydration.

7. Mutation conventions
   - Server operation returns typed field/global errors.
   - Toast confirms completed effects; inline error explains recoverable failure.
   - Destructive operations name the target and consequences.
   - Permission/configuration saves use atomic server operations and audit logs.

### 3.4 Form persistence policy

Do not persist all Admin inputs indiscriminately.

| Form type | Protection | Draft persistence |
|---|---|---|
| Password/current password | Dirty in-app warning only if useful | Never persist |
| Webhook secret | Confirm discard during creation/rotation | Never persist secret |
| User/role/permission changes | Dirty indicator + confirm discard | Prefer no browser persistence; keep an in-memory draft and atomic save |
| Short branch/group/reference dialog | Confirm close after meaningful edits | Normally none |
| Supplier/dealer/organization branding | Dirty guard | `sessionStorage` may be used for non-secret fields, keyed by user/company/route/schema version |
| File uploads | Explicit selected-file state | Do not persist file contents |

No backend draft schema is justified for the current Admin forms. Reassess only if a future workflow becomes multi-step or requires collaboration.

## 4. Refresh and form-loss investigation

### 4.1 Reported reproduction

Reported steps:

1. Enter data in a form.
2. Switch tab/application, minimize, or leave the application inactive.
3. Return.
4. The page sometimes appears to reload and unfinished input disappears.

Expected: focus changes and normal token refreshes must not destroy a mounted form. If the browser discards or the application intentionally updates, the user should receive protection or an appropriate non-sensitive draft restoration.

Current browser reproduction result: **pending**. No “confirmed root cause” is asserted without a browser trace.

### 4.2 What source analysis confirms

**TanStack Query is not configured to refetch on focus/reconnect.** Global defaults set both `refetchOnWindowFocus` and `refetchOnReconnect` to `false`. A normal focus event should not reset forms through Query.

**No application lifecycle handler forces a reload.** Repository search found no `visibilitychange`, `focus`, `blur`, `pageshow`, or `pagehide` handler that reloads or navigates. The only explicit app reload is the Error Boundary's user-clicked retry.

**Auth refresh fetches a new profile object but should not block the route for a normal token refresh.** Supabase uses persisted sessions and automatic token refresh. Every auth event with a session schedules `fetchProfile`, but route-blocking loading is set only when there is no current profile, the user changed, or the event is `SIGNED_IN`.

**Profile Settings already contains a narrow mitigation.** Its profile reset effect refuses to reset a dirty form and it registers browser/in-app navigation guards. Other Settings state is not covered.

**A real reload/remount will lose most Admin drafts.** Forms and dialogs are primarily component state. Apart from shared-table column visibility, no Admin draft is restored from storage or the backend.

**PWA update behavior requires deployed-build verification.** Source config uses `registerType: "autoUpdate"`, `skipWaiting`, and `clientsClaim`. The installed plugin's virtual registration client can call `window.location.reload()` after an updated worker activates. However, the current application does not import that virtual client; the local build emits a one-line `registerSW.js` that only registers `/sw.js`. The built worker does activate and claim immediately, but the built page does not contain that plugin reload callback. PWA behavior remains a test target, not a confirmed cause.

### 4.3 Remaining candidate events and proof criteria

| Event | Evidence that confirms it | Evidence that rejects it |
|---|---|---|
| Browser tab discard / process recreation | New boot ID, `document.wasDiscarded === true`, navigation entry/reload, no preceding app navigation | Same boot ID and component mount IDs survive |
| Auth loss and redirect | `SIGNED_OUT`/null session followed by route transition to login/pending and later reconstruction | Normal `TOKEN_REFRESHED`, same route/component, no loading gate |
| Service-worker update | `updatefound`/installed/activated/controller change immediately precedes a new document boot | No worker update around event; boot survives controller change |
| Full browser reload from another source | New boot ID and `PerformanceNavigationTiming.type === "reload"` | Same document/boot ID |
| React route/layout remount | Same boot ID but new shell/page mount IDs and route key transition | Page mount ID survives |
| Form reset effect | Same page mount ID; value loss immediately follows a data/effect event | Component/document remounted instead |

### 4.4 Diagnostic instrumentation

Add a temporary, development/diagnostic-only lifecycle probe. It must record metadata, never field values:

- per-document boot ID in `sessionStorage` and memory;
- timestamp, route, `location.key`, and page/shell mount IDs;
- `PerformanceNavigationTiming.type`;
- `document.wasDiscarded` when available;
- `visibilitychange`, `freeze`/`resume` where supported, `pagehide`, and `pageshow.persisted`;
- service-worker registration state, `updatefound`, worker state changes, and `controllerchange`;
- Supabase auth event name and whether a session/user exists, without tokens;
- dirty-form IDs/count only, never draft contents.

Keep a bounded in-memory/session log and optionally send a redacted structured event through the existing logging boundary. Remove or feature-gate verbose diagnostics after confirmation.

### 4.5 Required reproduction matrix

Run against at least Settings Profile, Organization Branding, Supplier/Dealer, User Invite, Permissions, and Webhook endpoint forms:

- switch browser tab and return immediately, after 1 minute, after 15 minutes, and near token expiry;
- switch desktop application;
- minimize/restore;
- offline/online transition;
- back/forward navigation;
- forced `TOKEN_REFRESHED` and failed refresh/sign-out;
- Chrome memory pressure/discard using browser tooling;
- service-worker update from build A to build B;
- installed PWA and ordinary browser tab, if both are supported;
- desktop and mobile browser behavior.

For each case capture boot ID, navigation type, discard flag, auth events, worker events, route/mount IDs, dirty state, and whether each draft survived.

### 4.6 Fix decision after confirmation

- If service-worker update is confirmed: replace silent auto-update with an update-ready prompt; defer activation/reload while any form is dirty; perform the reload only after explicit save/discard confirmation; test two sequential production builds.
- If browser discard is confirmed: browser behavior cannot be prevented reliably. Add scoped `sessionStorage` restoration only for approved non-sensitive forms, show a restored-draft notice, expire drafts, and clear them after save/logout/company change.
- If auth handling is confirmed: keep the current route mounted during recoverable refresh, distinguish transient refresh failure from confirmed sign-out, and avoid clearing profile/app state until session loss is authoritative.
- If a component reset is confirmed: narrow the effect dependencies and reset only after successful save, entity identity change, or an explicit user action.
- If an in-app navigation is confirmed: route it through the shared dirty-form boundary and preserve URL-backed context.

### 4.7 Regression coverage for the bug

- Component test: dirty profile/branding form is not reset when the auth profile object changes identity with equivalent/new server data.
- Component test: each protected dialog asks before discarding a meaningful draft and does not warn when untouched.
- Integration test: `TOKEN_REFRESHED` updates auth state without remounting the protected route.
- E2E: tab visibility change does not reload or clear form values.
- E2E: history navigation blocks when dirty and proceeds after explicit discard.
- E2E: service-worker build update follows the chosen prompt/defer policy.
- E2E/manual Chromium: discarded-tab restoration recovers only approved drafts.
- Security test: passwords, webhook secrets, and tokens never appear in local/session storage or lifecycle logs.

## 5. Technical refactor roadmap

### Phase 0 — Confirm lifecycle root cause and establish a safety baseline

Priority: Immediate
Objective: Make the reported state loss observable and prevent speculative fixes.

Affected areas:

- app bootstrap/shell and router diagnostics;
- `AuthContext` event logging;
- service-worker registration strategy;
- Settings and representative Admin forms;
- Playwright lifecycle regression fixtures.

Approach:

1. Add feature-gated, privacy-safe lifecycle instrumentation.
2. Execute and document the reproduction matrix.
3. Add regression coverage for the existing Profile Settings dirty guard.
4. Implement only the root-cause-specific lifecycle fix.
5. Introduce the shared dirty-form contract for forms selected by risk.

Dependencies: access to an authenticated test account or stable auth mocks; approved browser; ability to deploy two test builds for service-worker validation.
Migration risk: low if diagnostics are feature-gated and field values are excluded.
Rollback: disable/remove diagnostic flag and revert lifecycle handler independently.
Exit criteria: one confirmed event chain with captured evidence and a failing-then-passing regression test.

### Phase 1 — Correct permission, profile, and secret defects

Priority: Immediate after Phase 0 evidence capture; can be separate reviewable changes.

Objectives:

- Make permission editing truthful and atomic.
- Align self-profile UI with database authorization.
- Make webhook secrets write-only and rotation-based.

Affected areas:

- `PermissionEditor`, permission services, profile permission columns/RPC;
- `RoleManagementPanel`, role-section service, new atomic RPC;
- Settings profile/service types;
- webhook endpoint DTO/service/UI and database view/RPC/secret storage.

Dependencies: database migration review for atomic role save and secret handling.
Migration risk: medium-high for authorization and secret rotation.
Testing: unit, component, RLS/integration, audit-log, and rollback tests.
Rollback: retain backward-compatible RPC signatures during one release; never restore plaintext secret reads.

### Phase 2 — Separate My Account from Administration and repair navigation

Priority: High
Objective: Establish coherent URLs and ownership without rewriting page internals.

Approach:

- create real `/profile/*` account routes;
- create an authorized `/admin` landing route;
- split Modules and Organization/Branding from personal Settings;
- add Roles & Permissions as a first-class route;
- register System Health;
- derive breadcrumbs from registry metadata;
- add redirects for legacy URLs;
- extend route-registry parity in both directions.

Dependencies: agreed labels and role matrix; analytics/links inventory.
Migration risk: medium because bookmarks, command search, feature flags, and smoke tests depend on paths.
Rollback: keep compatibility redirects and land route changes separately from component moves.

### Phase 3 — Standardize simple CRUD and list workflows

Priority: High
Objective: Prove reusable patterns on low-complexity pages.

Pilot order:

1. Branches
2. User Groups
3. Suppliers and Dealers
4. Master Data catalog definition

Approach:

- enhance `StandardTable` with `tableId`, accessible sorting, and URL state;
- introduce `AdminCrudDialog`/small hooks without a generic abstraction that hides domain rules;
- define one catalog descriptor for Master Data and lazy-load only the active catalog;
- preserve each existing service and RLS rule;
- unify page-state and toast conventions.

Dependencies: Phase 2 route/query conventions.
Migration risk: medium; data transformations and delete semantics differ by entity.
Rollback: migrate one page/catalog at a time behind unchanged routes.

### Phase 4 — Decompose complex Admin surfaces

Priority: Medium
Objective: Reduce change risk in Users, Permissions, Audit, and Settings.

Approach:

- split User Management into query/controller hooks and focused panels/dialogs;
- make filters and Users/Roles context URL-backed;
- remove duplicate role editing from Settings;
- add server-paginated Audit Log with applied filters and a real, authorized export;
- replace raw change JSON with field-aware, redacted diffs;
- move activity aggregation server-side or clearly label the bounded sample;
- give every query an explicit retryable error state.

Dependencies: Phase 1 permission APIs and Phase 2 IA.
Migration risk: medium-high because user lifecycle actions are business-critical.
Rollback: retain existing services and migrate one panel/action at a time.

### Phase 5 — Operations, accessibility, and performance hardening

Priority: Medium
Objective: Complete consistent behavior across DMS, Reconciliation, Webhooks, KPI, Activity, Audit, and Health.

Approach:

- keyboard, zoom, contrast, and screen-reader remediation;
- responsive screenshots and interaction tests at supported breakpoints;
- visible polling/last-updated status and pause rules;
- server pagination/virtualization for large datasets;
- audit redaction and export authorization review;
- route-level performance budgets and query-count checks.

Dependencies: stable patterns from Phases 2–4.
Migration risk: low-medium when split into page-specific reviews.
Rollback: page-level changes are independently revertible.

## 6. Testing strategy

### Unit tests

- query key and mapping behavior;
- filter/sort URL serialization;
- role/section access decisions;
- form schemas and domain transformations;
- draft expiry/keying/redaction;
- lifecycle event classification;
- secret masking/rotation DTOs.

### Component/integration tests

- all CRUD happy, validation, server-error, retry, empty, and destructive-confirmation states;
- Permission Editor general/column/template save behavior;
- atomic role matrix success/failure/conflict behavior;
- self-profile fields match allowed server mutations;
- table preference isolation by `tableId`;
- dirty close/navigation behavior;
- auth profile refresh does not reset dirty forms;
- no secret/password persistence.

### Permission and database tests

- direct URL access for every role;
- hidden navigation plus server denial;
- same-company versus cross-company reads/writes;
- disabled-user pre-request gate;
- company admin cannot create Super Admin/global access;
- atomic permission change and audit record;
- webhook endpoint read DTO excludes secret;
- export RPCs respect the same scope as on-screen data.

### End-to-end workflows

- invite → activate → assign role/scope/branch → deactivate/reactivate/archive;
- edit role-section matrix and verify navigation/direct-route effects;
- each simple CRUD create/edit/delete path;
- Master Data deep link and browser history;
- audit filter/pagination/export;
- webhook create/one-time-secret/rotate/requeue;
- DMS retry and Reconciliation decision;
- Settings/Organization save and error recovery.

### Lifecycle regression suite

Use the matrix and proof criteria in section 4. Tests must assert document boot ID and page mount ID, not infer a reload from visual appearance.

### Responsive and accessibility

- desktop, tablet, and narrow mobile screenshots for every pattern and each complex page;
- 200% zoom and keyboard-only flows;
- automated axe scan plus manual focus-order, dialog focus-trap, live-error, table-sort, and status-announcement checks;
- no horizontal loss of actions/data on mobile cards or dense matrices.

### Current baseline and gaps

Verification run on 2026-09-22:

- `npm run typecheck`: passed, including four explicit TypeScript projects and all architecture gates.
- `npm run check:route-registry-parity`: passed for 92 resolved registry routes; one unrelated tracked legacy HRMS orphan remains.
- Focused Vitest suite: 15 files, 53 tests passed.

Current Admin component tests cover Branch Management, User Management, and Webhook Outbox. Dedicated E2E coverage exists for DMS Sync, Reconciliation, and KPI role-home behavior; generic route smoke covers only Activity, Users, Audit, and Settings. There is no lifecycle/form-loss regression suite and no broad Admin responsive/accessibility workflow coverage.

## 7. Risk assessment

| Risk | Likelihood/impact | Mitigation |
|---|---|---|
| Fixing the wrong refresh mechanism | High / High | Phase 0 event trace and failing regression before behavioral changes |
| Permission drift between UI, role matrix, and RLS | Medium / High | Central contract tests and database-authoritative integration tests |
| Partial authorization save | Existing High | Atomic RPC and conflict/version handling |
| Secret exposure during migration | Medium / High | One-way DTO change, explicit rotation, log/storage scans |
| Route/bookmark regression | Medium / Medium | Compatibility redirects, registry parity both directions, smoke tests |
| Generic CRUD abstraction erases domain rules | Medium / Medium | Descriptor only for truly common mechanics; domain validation remains explicit |
| Draft persistence leaks sensitive data | Medium / High | Allowlist fields/forms, session-only storage, expiry, logout/company cleanup, negative security tests |
| Browser/PWA behavior differs by deployment | Medium / High | Test the actual deployed artifact and installed-PWA mode |
| Large User Management refactor regresses lifecycle actions | Medium / High | Decompose behind existing services and migrate one action/panel at a time |
| Existing dirty work is overwritten | Low / High | Keep this work documentation-only until implementation scope is approved |

## 8. Recommended first implementation phase

Start with **Phase 0 — Confirm lifecycle root cause and establish a safety baseline**.

The first reviewable change should contain only:

1. privacy-safe lifecycle/auth/service-worker instrumentation behind a diagnostic flag;
2. boot/mount identifiers used by tests;
3. regression coverage for the existing Profile Settings dirty-state behavior;
4. the browser reproduction evidence document.

After the event chain is confirmed, add the smallest root-cause fix and its failing-then-passing test in a second change. Keep the Admin IA redesign out of both changes. In parallel planning—but not bundled into lifecycle work—prepare Phase 1 fixes for permissions, self-profile branch editing, and webhook secrets.

## Key evidence references

- Admin routes: `src/main.tsx:297-316`
- Admin registry/navigation groups: `packages/shell/src/platformRegistry.ts:224-237`
- Navigation access filtering: `src/components/layout/app-shell/mainShellConfig.ts:185-244`
- Layered route authorization: `src/components/shared/RequireRole.tsx:8-40`
- Query focus/reconnect defaults: `src/lib/queryClient.ts:15-33`
- Supabase persisted/auto-refresh session: `packages/supabase/src/client.ts:44-68`
- Auth event/profile refresh behavior: `packages/auth/src/AuthContext.tsx:209-250`
- PWA update configuration: `vite.config.ts:92-143`
- Current generated service-worker registration: `dist/registerSW.js:1`
- Existing Profile Settings protection and uncovered local state: `src/pages/admin/SettingsPage.tsx:67-152`
- Settings tab conflation: `src/pages/admin/SettingsPage.tsx:299-378`
- Profile Branch Assignment control: `src/pages/admin/settings/SettingsSections.tsx:82-105`
- Database self-privilege guard: `supabase/migrations/20260915090000_production_readiness_security.sql:182-248`
- Permission Editor defect: `src/components/admin/PermissionEditor.tsx:91-169`, `281-335`
- Role matrix query/save behavior: `src/components/admin/RoleManagementPanel.tsx:66-111`
- Webhook secret round-trip: `src/services/webhookOutboxService.ts:39-87`; `src/pages/admin/WebhookOutbox.tsx:92-120`, `266-303`
- Webhook schema promise and RLS: `supabase/migrations/20260527010000_phase6a_webhook_outbox.sql:18-71`
- Broken webhook breadcrumb: `src/pages/admin/WebhookOutbox.tsx:190-209`
- Audit Log limits/dead export/error behavior: `src/components/admin/AuditLogViewer.tsx:40-66`, `125-185`
- Master Data duplication/eager loading: `src/pages/admin/MasterData.tsx:124-220`, `455-753`
- Shared-table global preference and accessibility behavior: `packages/ui/src/StandardTable.tsx:77-89`, `179-227`
- Master-data tenant policies: `supabase/migrations/20260518010000_rls_master_data_company_scope.sql`
