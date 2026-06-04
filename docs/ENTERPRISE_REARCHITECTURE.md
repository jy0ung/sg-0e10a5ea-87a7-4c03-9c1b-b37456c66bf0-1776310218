# Enterprise Re-Architecture

**Status:** Source of truth for the UBS enterprise transformation  
**Created:** 2026-05-31  
**Decision model:** internal SaaS-ready enterprise platform, conservative production rollout

## Executive Summary

UBS is the canonical operating platform for Fook Loi group operations. It is not a public self-serve SaaS product, but it must be built with SaaS-grade tenant isolation, modular boundaries, operational observability, and maintainable domain contracts.

The main web app remains the canonical enterprise shell. The dedicated HRMS web app remains separately hosted for now, but it should consume shared packages and contracts instead of duplicating shell, services, permissions, workflow, and UI patterns.

## Current Architecture Map

| Area | Current state | Target state |
|---|---|---|
| Product shell | Root `src/` owns the real UBS shell and routes | Main shell remains canonical; route/module metadata moves into a typed registry |
| HRMS web | Separate app with duplicated services, guards, layouts, and components | Separate host backed by shared shell/access/workflow/service packages |
| Navigation | Router, sidebar, route chrome, and smoke tests maintain separate route lists | `platformRegistry` drives route metadata, nav, module gates, page chrome, and smoke route coverage |
| Permissions | App roles, portal roles, HRMS roles, role sections, module toggles, column permissions, and RLS overlap | Single documented access model with RLS as authority and client checks as UX gates |
| Workflow | `approval_instances` and legacy `approval_requests` both exist | `approval_instances` is canonical runtime; `approval_requests` is legacy compatibility only |
| Services | Root and HRMS app contain duplicated service files | Services move toward package-owned domain boundaries; pages/components never call Supabase directly |
| Docs | `IMPLEMENTATION_MAP.md` and phase docs contain historical state | This document plus ADRs are the active enterprise architecture record |

## Target Product Architecture

UBS is organized around these platform modules:

- Platform: Home, Inbox, Notifications, command search, cross-module shortcuts.
- Identity & Access: auth profile, app roles, portal roles, HRMS role assignments, module toggles, section and column permissions.
- Workflow: approval definitions, approval runtime, approver routing, entity adapters, inbox integration.
- Audit: user actions, entity diffs, workflow decisions, privileged admin changes.
- Notifications: operational alerts, approval changes, request updates, reconciliation events.
- Auto Aging: vehicle lifecycle, DMS/UBS source ledger, import review, SLA, mappings, commission, aging reports.
- Sales: pipeline, leads, sales orders, customers, invoices, OR verification, margin, advisors.
- Inventory: stock, chassis movement, transfer, advanced search.
- Purchasing: purchase orders, GRN, purchase invoices, AP lifecycle, 3-way match.
- Finance: GL, periods, trial balance, P&L, balance sheet, aging, cash position, period close.
- HRMS: employees, leave, attendance, payroll, appraisals, announcements, HRMS settings.
- Internal Requests: request portal, queue, history, setup, announcements, documents.
- Admin: governance, users, roles, audit, DMS sync, reconciliation, master data, settings.

## Architecture Rules

1. The main app is the canonical UBS shell. HRMS remains separately hosted until package consolidation proves stable.
2. Route, module, nav, page chrome, and smoke metadata belong in `@flc/shell` via `platformRegistry`.
3. Pages and components must not call `supabase.from()` or `supabase.rpc()` directly. Data access belongs in services or domain packages.
4. RLS is the security boundary. Client-side checks only shape the user experience.
5. Access precedence is: RLS > module active > route role > section permission > column permission.
6. `approval_instances` and `approval_decisions` are the canonical workflow runtime.
7. `approval_requests` is legacy compatibility and must not be used for new workflow execution.
8. Financial and workflow state transitions must use RPCs or workflow services, not page-local multi-step writes.
9. Shared UI primitives live in `@flc/ui`; shell contracts live in `@flc/shell`; shared domain services move into packages incrementally.
10. Production changes are additive, feature-flagged where behavior changes, and validated by CI plus production canaries.

## Route And Module Registry

The first implementation slice promotes `platformRegistry` into `@flc/shell`. The old `src/config/platformRegistry.ts` path remains as a compatibility re-export for incremental migration.

The registry owns:

- Section definitions and module gates.
- Route metadata for main, portal, and HRMS surfaces.
- Navigation metadata for the main shell.
- Page chrome metadata for the main and HRMS shells.
- HRMS dedicated-shell navigation labels, groups, icons, guarded route paths, scopes, and access keys via `HRMS_NAV_ROUTES` and `HRMS_GUARDED_ROUTE_DEFINITIONS`.
- Production smoke route lists for main and HRMS hosts.
- Future unavailable-state copy for disabled module, missing permission, and planned feature cases.
- Feature-flag/control labels for registered but gated workflows.

Router elements are still declared in `src/main.tsx`; moving route construction to registry-driven definitions is intentionally deferred to avoid a risky big-bang router rewrite.

## Access Model

The normalized access model has seven layers:

| Layer | Purpose | Enforcement |
|---|---|---|
| Supabase Auth | Establishes session identity | Supabase |
| Profile status | Active company-scoped user only | `@flc/auth` plus RLS |
| RLS | Tenant and row authorization | Database |
| Module toggle | Company-level module availability | `module_settings` plus UI gates |
| Route role | Coarse route eligibility | route guards |
| Section permission | Role-to-section navigation visibility | `role_sections` |
| Column permission | Field-level view/edit affordances | `column_permissions` plus service/RLS constraints |

Portal roles are first-class `AppRole` values. HRMS role assignments remain orthogonal because they represent workforce approval/reporting authority rather than global app access.

The first implementation slice adds `packages/auth/src/accessControl.ts` as the shared pure access surface for app-role checks, portal-only routing, portal queue/setup authority, and role-section lookups. Main and HRMS portal helpers should re-export these utilities instead of carrying app-local role logic.

## Workflow Engine

The target workflow engine is entity-adapter based:

- Flow definitions: `approval_flows` and `approval_steps`.
- Runtime state: `approval_instances`.
- Decisions: `approval_decisions`.
- Entity adapters: resolve requester, update entity status, emit notifications, write audit metadata.

Supported approval routing:

- specific user
- HRMS role
- direct manager
- self-approval guard
- fallback approver
- resubmission after rejection
- multi-step advancement

`approval_requests` remains readable for legacy surfaces until all runtime callers have been migrated.

Current implementation status:

- `@flc/hrms-services` owns the canonical `approval_instances` engine for HRMS leave, payroll, appraisal, and resubmission flows.
- `resubmitApprovalInstance` is covered by a package-level regression test that verifies the rejected-instance reset path queries `approval_steps`, resolves first-step routing, and updates the existing instance back to `pending`.
- Internal Requests write to `approval_instances` through package-owned orchestration in `@flc/internal-requests`; app-local request approval services are compatibility shims guarded by `check:internal-request-service-boundary`.
- Legacy `approvalEngineService` files that write `approval_requests` remain compatibility debt and must not receive new entity integrations.
- `npm run check:workflow-boundary` fails if `approval_requests` access appears outside the documented legacy compatibility files.

## Service Boundary Strategy

Extraction order should follow risk:

1. HRMS services already partly package-owned; remove HRMS web duplicates first.
2. Workflow services become package-owned once `approval_instances` runtime tests are complete.
3. Finance services move after AP/AR/GL contract tests are in place.
4. Sales and Auto Aging move after registry and smoke coverage prove stable.

Service APIs must return typed result objects and hide Supabase query shapes from pages.

Current enforcement:

- ESLint and `check:page-data-boundary` block direct Supabase client imports, data/auth/storage calls, and local `createClient()` calls from `src/pages`, `src/components`, `apps/hrms-web/src/pages`, and `apps/hrms-web/src/components`; presentation surfaces may only use the shared realtime hook.
- Main and HRMS web shell navigation consume @flc/shell platformRegistry; HRMS web no longer keeps a separate hard-coded main navigation list.
- Platform module catalogue, module toggle resolution, and module path/section gates are owned by `@flc/shell` through `moduleAccess`; app-local module files are compatibility re-exports guarded by `check:shell-module-boundary`.
- Focused module-shell detection is registry-backed through `isFocusedPlatformPath`; app hooks only adapt `useLocation()` to the package-owned predicate.
- HRMS workspace path constants, legacy alias normalization, and dedicated-host URL composition are owned by `@flc/shell`; app-local `hrmsWorkspace` files retain only environment/window wiring.
- Dedicated HRMS sidebar metadata, guarded route entries, protected route paths, and route chrome are package-owned through `HRMS_NAV_ROUTES`, `HRMS_GUARDED_ROUTE_DEFINITIONS`, `HRMS_PROTECTED_ROUTE_PATHS`, and `HRMS_ROUTE_CHROME`; `apps/hrms-web/src/layout/navItems.ts` is a compatibility adapter that only maps registry icon keys to local icon components, and `check:hrms-registry-boundary` blocks app-local metadata drift.
- The legacy /modules URL is retained only as a Home redirect and smoke compatibility route; it must not reappear as visible Module Directory navigation.
- Feature-flagged unavailable states use `FeatureUnavailableState` and route metadata from `platformRegistry`, rather than page-local "Feature not available" copy.
- Shared status tone classes and low-risk page primitives (`PageHeader`, `PageSpinner`, `FilterBar`, `KpiSkeleton`, `TableSkeleton`, `ScrollableRegion`, `StandardTable`, `LocationPreservingNavigate`, `UnauthorizedAccess`, `StepperProgress`, `AuditDiffTable`, `MobileCardList`, `KpiCard`, `HrmsEmptyState`, `ConfirmDialog`, `SectionCard`, `ValidationSummaryModal`) are owned by `@flc/ui`; app-local files are compatibility re-exports guarded by `check:ui-boundary` for incremental UI migration.
- `FeatureUnavailableState` calls in page code must pass a registry `routeId`; `check:unavailable-state-registry` blocks page-local `featureName` and `flagName` drift.
- HRMS leave-balance rollover edge invocation is owned by `@flc/hrms-services` via `runLeaveBalanceRollover`.
- Signup and password-reset callback/session handling is owned by `@flc/auth` via `authFlows`.
- Email/password auth service operations are owned by `@flc/auth`; app-local `authService` files are compatibility re-exports guarded by `check:auth-service-boundary`.
- Default section permissions and role labels are owned by `@flc/auth` and app-local `rolePermissions` files are compatibility re-exports.
- HRMS app-role sets for self-service, manager, payroll, approval inbox, appraisal, PII, and admin eligibility are owned by `@flc/auth`; app-local `hrmsConfig` files are compatibility re-exports guarded by `check:auth-service-boundary`.
- Server-backed role-section access is owned by `@flc/auth` via `fetchRoleSections` and `saveRoleSections`; app-local `roleSectionService` files are compatibility re-exports guarded by `check:auth-service-boundary`.
- Column permission reads, mutations, default-role permissions, and column-level edit/view helpers are owned by `@flc/auth`; app-local `permissionService` files are compatibility re-exports guarded by `check:auth-service-boundary`.
- Profile listing, profile mutation, invitation, account status, portal-access, and own-profile update flows are owned by `@flc/auth`; app-local `profileService` files are compatibility re-exports guarded by `check:auth-service-boundary`.
- HRMS web domain service wrappers re-export the canonical main-app wrappers while shared core behavior continues to live in `@flc/hrms-services`.
- Canonical HRMS workflow resubmission is owned by `@flc/hrms-services` and covered by `packages/hrms-services/src/approval/approvalEngine.test.ts`.
- `check:platform-service-boundary` prevents app code from importing package-owned logging, notification, reporting, ticket-attachment, branding, error-tracking, performance, and module-setting services through local shims, and verifies app audit shims contain no direct Supabase implementation. Core audit logging lives in `@flc/platform-services`; app-local audit shims retain only the React `useActionLogger` integration.
- Internal request template, form-field, routing-rule, auto-assignment evaluation, and `approval_instances` request-approval orchestration services are owned by `@flc/internal-requests`; app-local service files are compatibility re-exports guarded by `check:internal-request-service-boundary`.
- `check:hrms-service-boundary` prevents the dedicated HRMS web host from regaining duplicated HRMS domain service wrapper implementations.
- `check:production-smoke-registry` prevents deploy-smoke drift by asserting registry smoke routes are concrete, host-correct, baseline-covered, and consumed by the deploy script through a GitHub-Actions-safe direct registry import.

Known compatibility exceptions:

- Service packages may call Supabase directly; packages are the intended service boundary.

## UX System

The target UX is a dense enterprise workbench:

- Role-aware Home.
- Unified Inbox for approvals, requests, reconciliation, and operational alerts.
- Consistent `PageHeader`, `PageState`, `StandardTable`, filters, action toolbars, and mobile card fallbacks.
- Command search as a primary navigation and entity lookup path.
- Clear unavailable states: disabled module, missing permission, planned feature, or platform mismatch.

This is not a visual polish pass. UX changes should reduce workflow ambiguity and operational support cost.

## Testing And Quality Gates

Every phase must keep these green:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check:rpc-frontend`
- `npm run check:rpc-contracts`
- `npm run check:workflow-boundary`

Additional required coverage:

- Registry tests for route uniqueness, module gates, nav routes, and smoke routes.
- Access-model tests for role, module, section, portal, and HRMS interactions.
- Workflow tests for submit, approve, reject, resubmit, self-approval, direct manager, HRMS role, and specific-user routing.
- Production deploy checks: `verify:production`, `health:rpc-canaries`, `smoke:production`.
- Production smoke metadata check: `check:production-smoke-registry`.

## Migration Plan

| Phase | Outcome | Risk posture |
|---|---|---|
| 1. Source of truth | Enterprise architecture doc, ADR index, active registry | Documentation and metadata only |
| 2. Registry adoption | Shell and smoke consume shared route metadata | No route behavior changes |
| 3. Access cleanup | Unified role types and shared access utilities | Client UX gates only; RLS unchanged |
| 4. Service boundaries | HRMS duplicate services removed, domains move to packages | Per-domain PRs with tests |
| 5. Workflow unification | `approval_instances` runtime becomes the only write path | Compatibility reads before legacy retirement |
| 6. UX stabilization | Shared page patterns and clearer unavailable states | Feature-flagged where behavior changes |
| 7. Observability gates | Registry-backed canaries, service coverage floors, workflow RLS rows | CI/deploy hardening |

No destructive database cleanup is allowed in early phases.
