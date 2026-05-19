# FLC BI — Implementation Map

> **Last updated**: 2026-05-19 (Phase 1b fixes applied)  
> **Scope**: Full structured codebase discovery — entry point, tech stack, module/route map, data flow, permissions, schema, UI architecture, risks, and safe implementation strategy.  
> **Source of truth**: Actual files in the repository.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack Summary](#2-tech-stack-summary)
3. [Repository Structure](#3-repository-structure)
4. [Module and Route Map](#4-module-and-route-map)
5. [Data Flow Map](#5-data-flow-map)
6. [Permission / RBAC Map](#6-permission--rbac-map)
7. [Database / Schema Map](#7-database--schema-map)
8. [UI / Component Architecture](#8-ui--component-architecture)
9. [Key Integration Points](#9-key-integration-points)
10. [Risks and Technical Debt](#10-risks-and-technical-debt)
11. [Recommended Development Workflow](#11-recommended-development-workflow)
12. [Safe Implementation Strategy](#12-safe-implementation-strategy)
13. [Open Questions](#13-open-questions)

---

## 1. Executive Summary

This is a **Turborepo monorepo** (`flc-bi`) housing a multi-module enterprise BI application built on **React 18 + Vite + Supabase**.

### Applications

| App | Location | Purpose |
|-----|----------|---------|
| Main BI app | `/` (root `src/`) | Vehicle aging, Sales, Inventory, Purchasing, GL/AP/AR, Reports, Admin, Internal Requests, HRMS launcher |
| HRMS web | `apps/hrms-web/` | Dedicated HRMS SPA (leave, attendance, payroll, appraisals, employees) |
| HRMS mobile | `apps/hrms-mobile/` | Capacitor mobile app (HRMS-only) |

### Shared Packages

| Package | Location | Purpose |
|---------|----------|---------|
| `@flc/types` | `packages/types/` | All domain TypeScript interfaces (split into 8 domain files) |
| `@flc/supabase` | `packages/supabase/` | Supabase client + auto-generated DB types (6121 lines) |
| `@flc/hrms-services` | `packages/hrms-services/` | HRMS data-access layer (leave, attendance, payroll, etc.) |
| `@flc/hrms-hooks` | `packages/hrms-hooks/` | HRMS React Query hooks (built but not yet adopted by apps) |
| `@flc/hrms-schemas` | `packages/hrms-schemas/` | Zod validation schemas for HRMS forms |

### Key Architectural Decisions

- Route-level code splitting via `React.lazy` in `src/main.tsx`
- `@tanstack/react-query` for all server state; query keys tenant-scoped `[companyId, branchId, ...]`
- Supabase JS client for DB queries + RPCs; direct `supabase.from()` calls banned in pages (must go through services)
- Five shared packages extracted for HRMS domain (web + mobile reuse); remaining domains (Auto Aging, Sales, etc.) use in-app services only
- shadcn/ui component library (49 Radix primitives) + Tailwind CSS
- i18next for internationalization (English locale only, ~0% coverage)
- Context providers: `AuthContext`, `DataContext`, `SalesContext`, `ModuleAccessContext`, `BrandingContext`

### Database

- Supabase Postgres with ~100 tables, 107 timestamped migrations
- Multi-tenant via `company_id` on every table
- RLS enforced on all tables (company-scoped, role-gated writes)
- 6 edge functions (invite-user, dms-sync-worker, rollover-leave-balances, etc.)

---

## 2. Tech Stack Summary

| Layer | Technology | Version | Config / Entry |
|-------|-----------|---------|----------------|
| Framework | React | 18.3 | `src/main.tsx` |
| Build tool | Vite | 5.4 | `vite.config.ts` |
| Compiler | SWC (via `@vitejs/plugin-react-swc`) | 3.11 | `vite.config.ts` |
| Routing | React Router | 6.30 | inline in `src/main.tsx` |
| Server state | TanStack React Query | 5.83 | `src/lib/queryClient.ts` |
| Styling | Tailwind CSS | 3.4 | `tailwind.config.ts` |
| UI library | shadcn/ui (Radix primitives) | — | `src/components/ui/` (49 components) |
| Validation | Zod | 3.25 | `packages/hrms-schemas/` |
| Forms | react-hook-form | 7.72 | — |
| Backend | Supabase (Postgres + RLS) | 2.103 (client) | `supabase/config.toml` |
| Auth | Supabase Auth (PKCE flow) | — | `src/contexts/AuthContext.tsx` |
| i18n | i18next | 26 | `src/i18n/` |
| Error tracking | Sentry | 8.55 | `src/services/errorTrackingService.ts` |
| Date utils | date-fns | 3.6 | — |
| Icons | lucide-react | 0.462 | — |
| Charts | recharts | 2.15 | — |
| Toast | sonner | 1.7 | — |
| Unit tests | Vitest + React Testing Library | 3.2 | `vitest.config.ts` |
| E2E tests | Playwright | 1.57 | `playwright.config.ts` |
| Monorepo | Turborepo | — | `turbo.json` |
| PWA | vite-plugin-pwa | — | `vite.config.ts` |
| Lint | ESLint | 9.32 | `eslint.config.js` |
| Husky | git hooks | 9.1 | `.husky/` |
| Lint-staged | pre-commit linting | 16.4 | `package.json` |
| CSS | PostCSS | 8.5 | `postcss.config.js` |

### Important Scripts (root `package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Dev server on :3000 |
| `build` | `vite build` | Production build |
| `lint` | `eslint .` | Lint all files |
| `typecheck` | `tsc --noEmit && check:rpc-contracts` | Full type + RPC contract check |
| `test` | `vitest run` | Unit test suite |
| `test:watch` | `vitest` | Watch mode |
| `test:coverage` | `vitest run --coverage` | Coverage report |
| `test:rls` | `vitest run --config vitest.rls.config.ts` | RLS integration tests (needs live Supabase) |
| `test:e2e` | (in `apps/hrms-web`) `playwright test` | E2E tests |

---

## 3. Repository Structure

```
/
├── src/                               # MAIN APP — Vite entry point
│   ├── main.tsx                       # App bootstrap, router definition, code splitting (376 lines)
│   ├── App.tsx                        # Root component shell (18 lines — mostly vestigial)
│   ├── App.css / index.css            # Global styles + Tailwind imports
│   ├── components/
│   │   ├── layout/                    # AppShell, SalesLayout, CustomerServiceLayout
│   │   │   └── app-shell/             # AppShell.tsx, AppShellSidebar.tsx, AppShellTopbar.tsx, mainShellConfig.ts
│   │   ├── shared/                    # DataTable, KpiCard, RequireRole, PageSpinner, StatusBadge, etc. (24 files)
│   │   ├── ui/                        # 49 shadcn/ui components (button, card, dialog, select, table, tabs, etc.)
│   │   ├── admin/                     # AuditLogViewer, PermissionEditor
│   │   ├── charts/                    # AgingTrendChart, KpiTrendChart, PaymentPieChart, etc.
│   │   ├── dashboard/                 # DashboardBranchComparison, DashboardScorecards, etc.
│   │   ├── sales/                     # SalesOrderDetail
│   │   ├── theme/                     # ThemeProvider, ThemeToggle
│   │   ├── tickets/                   # RequestDetailPanel, RequestQueueFilters, TicketActivityList, etc.
│   │   └── vehicles/                  # VehicleDetailPanel, VehicleEditDialog
│   ├── pages/
│   │   ├── accounts/                  # ChartOfAccounts, TrialBalance, JournalEntries, AccountingPeriods
│   │   ├── admin/                     # UserManagement, AuditLog, SettingsPage, BranchManagement, MasterData, Suppliers, Dealers, UserGroups, RolePermissions, ActivityDashboard
│   │   ├── auto-aging/                # AutoAgingDashboard, VehicleExplorer, VehicleDetail, ImportCenter, ImportReviewQueue, ImportReviewDetail, DataQuality, SLAAdmin, MappingAdmin, ImportHistory, CommissionDashboard, ReportCenter
│   │   ├── hrms/                      # HrmsWorkspaceRedirect (6 legacy pages exist but route to redirect)
│   │   ├── inventory/                 # StockBalance, VehicleTransfer, ChassisMovement, ChassisFilter
│   │   ├── purchasing/                # PurchaseInvoices, PurchaseInvoiceDetail
│   │   ├── reports/                   # ReportsCenter
│   │   ├── sales/                     # SalesDashboard, DealPipeline, Customers, SalesOrders, Invoices, MarginAnalysis, OutstandingCollection, SalesAdvisors, SalesmanPerformance, DealerInvoices, VerifyOR
│   │   ├── tickets/                   # MyTickets, NewTicket, PortalLanding, RequestQueue, RequestHistory, RequestSetup
│   │   ├── LandingPage, LoginPage, ForgotPasswordPage, ResetPasswordPage, SignUpPage, AuthVerifyPage, AccountPending, NotFound, ExecutiveDashboard, ModuleDirectory, Notifications, Index
│   │   └── ExecutiveDashboardSettings.tsx
│   ├── contexts/                      # AuthContext, DataContext, SalesContext, ModuleAccessContext, BrandingContext
│   ├── hooks/                         # usePermissions, useColumnPermissions, useErrorHandler, useCompanyId, useVehiclesSearch, useFocusedMode, useHrmsAccess, use-mobile, use-toast, useRequestCategories, useRoutingRules, useAttachmentSettings, etc.
│   ├── services/                      # 71 files — all Supabase queries. Domain: apService, approvalEngineService, auditService, authService, autoAgingDataService, branchService, brandingService, businessReportService, commissionService, customerService, dashboardPreferencesService, dealStageService, errorTrackingService, glService, hrmsAdminService, hrmsRoleService, hrmsService, importReviewService, importService, inventoryService, invoiceService, leaveHrNotification, loggingService, mappingService, masterDataService, moduleSettingsService, notificationService, performanceService, permissionService, profileService, purchaseInvoiceService, requestApprovalService, requestCategoryService, requestFormFieldService, requestRoutingService, requestSubcategoryService, requestTemplateService, roleSectionService, salesAdvisorService, salesDashboardService, salesOrderCrudService, salesOrderService, salesPipelineService, salesTargetService, ticketAttachmentService, ticketService, validationService, vehicleService
│   │   └── hrms/                      # announcementService, appraisalService, attendanceService, employeeService, index, leaveService, payrollService, shared.ts
│   ├── lib/                           # Pure utilities (no Supabase). import-parser, queryClient, utils, forms, moduleAccess, hrmsWorkspace, portalAccess, googleSheetsImport, ticketSla, validations, dateParsing, etc.
│   │   └── hrms/                      # access.ts, approvalInbox.ts
│   ├── config/                        # env.ts, routeRoles.ts, rolePermissions.ts, brand.ts, autoAgingColumnOwners.ts, autoAgingFieldLabels.ts, hrmsConfig.ts
│   ├── types/                         # Barrel re-export of @flc/types (7 lines)
│   ├── integrations/supabase/         # Barrel re-exports: client.ts (4 lines), types.ts (4 lines), database.types.ts unused
│   ├── utils/                         # kpi-computation.ts, vehicleBuckets.ts, vehicleStage.ts, forecasting.ts
│   ├── data/                          # demo-data.ts (empty arrays), kpi-definitions.ts
│   ├── i18n/                          # index.ts + locales/en.json
│   └── test/                          # setup.ts, 4 integration spec files (excluded from standard runs)
│
├── apps/
│   ├── hrms-web/                      # Dedicated HRMS SPA (separate Vite app on port 3001)
│   │   ├── src/                       # Its own main.tsx, App.tsx, pages/, components/, services/, layout/, hooks/, contexts/
│   │   ├── vite.config.ts, tailwind.config.ts, tsconfig.json, playwright.config.ts
│   │   └── e2e/                       # HRMS-specific E2E tests
│   └── hrms-mobile/                   # Capacitor mobile app
│       └── src/                       # Mobile-specific pages and components
│
├── packages/
│   ├── types/src/index.ts             # 1241-line monolith — all domain types
│   ├── supabase/src/                  # client.ts, authStorage.ts, types.ts, database.types.ts (6121 lines auto-generated)
│   ├── hrms-schemas/src/index.ts      # Zod schemas (leave, attendance, auth, admin)
│   ├── hrms-services/src/            # Domain directories: announcement/, approval/, appraisal/, attendance/, employee/, leave/, payroll/, settings/, shared/
│   └── hrms-hooks/src/               # queryKeys.ts + domain directories matching services
│
├── supabase/
│   ├── migrations/                    # 107 timestamped SQL migrations
│   ├── functions/                     # 6 edge functions + _shared/ (cors.ts, publicSiteUrl.ts)
│   ├── config.toml                    # Supabase project config
│   └── templates/                     # Email templates (invite.html, recovery.html)
│
├── docs/                              # 30 documentation files
├── scripts/                           # Bootstrap, seed, check, verify utilities
├── e2e/                               # Playwright E2E tests (app-level)
├── migration/                         # Legacy data migration runbook
├── docker/                            # Docker support
└── .github/                           # CI/CD workflows
```

### Unclear / Legacy / Duplicated Folders

| Item | Issue |
|------|-------|
| `src/App.tsx` (18 lines) | Vestigial — renders a minimal shell but router is in `main.tsx`. The actual app renders from `main.tsx`'s own `<App />`, making this file dead code. |
| `src/test/rls-matrix.spec.ts`, `ap-foundation.spec.ts`, `dms-normalizer.spec.ts`, `sales-pipeline.spec.ts` | Integration specs excluded from standard `vitest` runs. May reference stale code paths. Verify they still pass with `npm run test:rls`. |
| `src/data/demo-data.ts` | All arrays (`demoVehicles`, `demoImportBatches`, `demoQualityIssues`, `demoNotifications`, `demoAuditLogs`) are empty. Dead demo code. Only `platformModules` and `demoSLAs` are used. |
| `src/services/hrms/` | HRMS services exist here AND in `packages/hrms-services/`. The `src/` versions may be redundant/wrappers. `@flc/hrms-hooks` doc says they just call `@flc/hrms-services` directly. |
| `dist/` at root vs `apps/hrms-web/dist/` | Two build output directories. Root `dist/` = main app output; `apps/hrms-web/dist/` = HRMS app output. |
| `packages/hrms-hooks/` | Built and exported but **not imported anywhere** in `src/` or `apps/hrms-web/src/`. Both apps call services directly. |
| `src/pages/hrms/` | Contains 6+ legacy page components (LeaveManagement, PayrollSummary, etc.) but the actual route for `/hrms/*` is handled by `HrmsWorkspaceRedirect` which redirects to the dedicated HRMS app. These are dead page files. |

---

## 4. Module and Route Map

### Route Definitions

All routes are defined in `src/main.tsx:175-303` inside a single `createBrowserRouter` call.

### Module Visibility

| Section (Sidebar) | Module ID | Module-gated? | Toggleable? |
|-------------------|-----------|---------------|-------------|
| Platform | — (none) | No | N/A |
| Auto Aging | `auto-aging` | Yes | Yes |
| Sales | `sales` | Yes | Yes |
| Inventory | `inventory` | Yes | Yes |
| Purchasing | `purchasing` | Yes | Yes |
| Accounts | — (none) | No | N/A |
| Reports | `reports` | Yes | Yes |
| HRMS | `hrms` | Yes | Yes |
| Admin | `admin` | Yes | No (core module, always active) |
| (Portal) | `support` | Yes | Yes |

### Full Route Table

| Route Path | Page Component | Layout | Role Guard | Module Guard | Services Used |
|------------|---------------|--------|------------|--------------|---------------|
| `/` | ExecutiveDashboard | AppLayout | — | — | `autoAgingDataService` |
| `/modules` | ModuleDirectory | AppLayout | — | — | — |
| `/notifications` | Notifications | AppLayout | — | — | `notificationService` |
| `/auto-aging` | AutoAgingDashboard | AppLayout | — | `auto-aging` | `vehicleService`, `autoAgingDataService` |
| `/auto-aging/vehicles` | VehicleExplorer | AppLayout | — | `auto-aging` | `vehicleService` |
| `/auto-aging/vehicles/:chassisNo` | VehicleDetail | AppLayout | — | `auto-aging` | `vehicleService` |
| `/auto-aging/import` | ImportCenter | AppLayout | MANAGER_AND_UP | `auto-aging` | `importService` |
| `/auto-aging/review` | ImportReviewQueue | AppLayout | MANAGER_AND_UP | `auto-aging` | `importReviewService` |
| `/auto-aging/review/:batchId` | ImportReviewDetail | AppLayout | MANAGER_AND_UP | `auto-aging` | `importReviewService` |
| `/auto-aging/quality` | DataQuality | AppLayout | — | `auto-aging` | `autoAgingDataService` |
| `/auto-aging/sla` | SLAAdmin | AppLayout | EXECUTIVE | `auto-aging` | `autoAgingDataService` |
| `/auto-aging/mappings` | MappingAdmin | AppLayout | EXECUTIVE | `auto-aging` | `mappingService` |
| `/auto-aging/history` | ImportHistory | AppLayout | — | `auto-aging` | `importService` |
| `/auto-aging/commissions` | CommissionDashboard | AppLayout | MANAGER_AND_UP | `auto-aging` | `commissionService` |
| `/auto-aging/reports` | ReportCenter | AppLayout | — | `auto-aging` | `reportService` |
| `/sales` | SalesDashboard | SalesLayout | — | `sales` | `salesDashboardService` |
| `/sales/pipeline` | DealPipeline | SalesLayout | MANAGER_AND_UP | `sales` | `salesPipelineService` |
| `/sales/orders` | SalesOrders | SalesLayout | — | `sales` | `salesOrderService` |
| `/sales/customers` | Customers | SalesLayout | — | `sales` | `customerService` |
| `/sales/invoices` | Invoices | SalesLayout | MANAGER_AND_UP | `sales` | `invoiceService` |
| `/sales/performance` | SalesmanPerformancePage | SalesLayout | MANAGER_AND_UP | `sales` | `performanceService` |
| `/sales/advisors` | SalesAdvisors | SalesLayout | MANAGER_AND_UP | `sales` | `salesAdvisorService` |
| `/sales/margin` | MarginAnalysis | SalesLayout | EXECUTIVE | `sales` | — |
| `/sales/outstanding` | OutstandingCollection | SalesLayout | — | `sales` | — |
| `/sales/dealer-invoices` | DealerInvoices | SalesLayout | MANAGER_AND_UP | `sales` | — |
| `/sales/verify-or` | VerifyOR | SalesLayout | MANAGER_AND_UP | `sales` | — |
| `/inventory/stock` | StockBalance | AppLayout | — | `inventory` | `inventoryService` |
| `/inventory/transfers` | VehicleTransfer | AppLayout | MANAGER_AND_UP | `inventory` | `inventoryService` |
| `/inventory/chassis` | ChassisMovement | AppLayout | — | `inventory` | `inventoryService` |
| `/inventory/chassis-filter` | ChassisFilter | AppLayout | — | `inventory` | `inventoryService` |
| `/purchasing/invoices` | PurchaseInvoices | AppLayout | MANAGER_AND_UP | `purchasing` | `purchaseInvoiceService` |
| `/purchasing/invoices/:id` | PurchaseInvoiceDetail | AppLayout | MANAGER_AND_UP | `purchasing` | `purchaseInvoiceService` |
| `/accounts/chart` | ChartOfAccounts | AppLayout | ACCOUNTS_AND_UP | — | `glService` |
| `/accounts/periods` | AccountingPeriods | AppLayout | ACCOUNTS_AND_UP | — | `glService` |
| `/accounts/trial-balance` | TrialBalance | AppLayout | ACCOUNTS_AND_UP | — | `glService` |
| `/accounts/journal` | JournalEntries | AppLayout | ACCOUNTS_AND_UP | — | `glService` |
| `/admin/activity` | ActivityDashboard | AppLayout | EXECUTIVE | — | — |
| `/admin/users` | UserManagement | AppLayout | ADMIN_ONLY | — | `authService`, `profileService` |
| `/admin/audit` | AuditLog | AppLayout | ADMIN_AND_DIRECTOR | — | `auditService` |
| `/admin/settings` | SettingsPage | AppLayout | — (none) | — | `profileService`, `moduleSettingsService` |
| `/admin/branches` | BranchManagement | AppLayout | ADMIN_ONLY | — | `branchService` |
| `/admin/master-data` | MasterData | AppLayout | ADMIN_ONLY | — | `masterDataService` |
| `/admin/suppliers` | Suppliers | AppLayout | ADMIN_ONLY | — | — |
| `/admin/dealers` | Dealers | AppLayout | ADMIN_ONLY | — | — |
| `/admin/user-groups` | UserGroups | AppLayout | ADMIN_ONLY | — | — |
| `/admin/role-permissions` | RolePermissionsPage | AppLayout | ADMIN_ONLY | — | `roleSectionService`, `permissionService` |
| `/reports` | ReportsCenter | AppLayout | — | `reports` | `businessReportService` |
| `/hrms` / `/hrms/*` | HrmsWorkspaceRedirect | AppLayout | — | `hrms` | — (redirects to HRMS app) |
| `/portal` | PortalLanding | CustomerServiceLayout | ProtectedRoute | `support` | — |
| `/portal/tickets` | MyTickets | CustomerServiceLayout | — | `support` | `ticketService` |
| `/portal/tickets/new` | NewTicket | CustomerServiceLayout | — | `support` | `requestCategoryService`, `requestTemplateService` |
| `/portal/queue` | RequestQueue | CustomerServiceLayout | PORTAL_QUEUE_ROLES | `support` | `ticketService` |
| `/portal/history` | RequestHistory | CustomerServiceLayout | PORTAL_QUEUE_ROLES | `support` | `ticketService` |
| `/portal/setup` | RequestSetup | CustomerServiceLayout | PORTAL_SETUP_ROLES | `support` | `requestCategoryService`, etc. |
| `/login` | LoginPage | — (no layout) | Public | — | `authService` |
| `/forgot-password` | ForgotPasswordPage | — | Public | — | — |
| `/reset-password` | ResetPasswordPage | — | Public | — | — |
| `/signup` | SignUpPage | — | Public | — | — |
| `/welcome` | LandingPage | — | Public | — | — |
| `/account-pending` | AccountPending | — | Session but no profile | — | — |
| `*` | NotFound | — | Public | — | — |

### Pages with No Route Guard

These are pages that lack a `RequireRole` wrapper and are accessible to any authenticated user:

- `/admin/settings` (SettingsPage) — **notable gap**: admin-sensitive but no role check
- `/modules` (ModuleDirectory)
- `/notifications` (Notifications)
- `/auto-aging` root, vehicles, quality, history, reports
- `/sales` root, orders, customers, outstanding
- `/inventory/stock` and `/inventory/chassis`
- `/reports`

---

## 5. Data Flow Map

### Pattern Overview

The app uses three data-fetching patterns:

#### Pattern A: Context-level React Query (Auto Aging)

```
DB (vehicles, import_batches, etc.)
  → autoAgingDataService.fetchAutoAgingContextData()
    → useQuery in DataContext (dataQueryKey)
      → useData() hook in page components
        → mutations: setVehicles, addImportBatch, updateImportBatch, addQualityIssues, updateSla
          → service call → queryClient.setQueryData optimistic update → optional reloadFromDb()
```

**Realtime**: `subscribeToAutoAgingVehicleChanges()` → Supabase channel → invalidates query.

**Current state**: DataContext operates in `summary-only` mode. It fetches KPIs and metadata but NOT full vehicle arrays. Pages needing vehicle rows call direct service methods (`searchVehicles`, `getVehicleByChassis`).

#### Pattern B: Context-level React Query (Sales)

```
DB (customers, sales_orders, deal_stages, invoices, salesman_targets)
  → fetchSalesData() — parallel Promise.all of 5 service calls
    → useQuery in SalesContext (salesQueryKey)
      → useSales() hook in page components
        → mutations: moveOrderStage() → transitionOrderStage RPC → cache update
        → updateOrder() → updateSalesOrder service → cache update
```

**Realtime**: None currently. `reloadSales()` invalidates query explicitly.

#### Pattern C: Per-page / Per-hook React Query (all other domains)

```
DB → service function → useQuery/useMutation in page component or custom hook
```

Examples:
- `admin/UserManagement.tsx` → direct `useQuery` with `profileService`
- `accounts/ChartOfAccounts.tsx` → direct `useQuery` with `glService`

### Mutation Cache Strategy

| Context | Mutation | Cache Update Strategy |
|---------|----------|----------------------|
| DataContext | `setVehicles` | Service call → `reloadFromDb()` (full invalidation) |
| DataContext | `addImportBatch` | `setQueryData` immediate prepend + log |
| DataContext | `updateImportBatch` | `setQueryData` immediate update + log |
| DataContext | `addQualityIssues` | `setQueryData` immediate prepend + log |
| DataContext | `updateSla` | `setQueryData` immediate update + log |
| SalesContext | `moveOrderStage` | RPC call → `setQueryData` optimistic update |
| SalesContext | `updateOrder` | Service call → `setQueryData` optimistic update |
| ModuleAccessContext | `setModuleActive` | Service call → `setQueryData` immediate update |

### Key Service Dependency Chain

```
src/services/
├── autoAgingDataService.ts    → depends on: vehicleService, supabase client
├── importService.ts           → depends on: supabase client
├── vehicleService.ts          → depends on: supabase client (RPCs + direct queries)
├── salesOrderService.ts       → depends on: supabase client
├── glService.ts               → depends on: supabase client (RPCs)
├── invoiceService.ts          → depends on: supabase client
├── ...
└── hrms/
    └── employeeService.ts     → depends on: @flc/supabase
```

### Client-Side Transformations

| File | What it does |
|------|-------------|
| `src/utils/kpi-computation.ts` | Computes KPI summaries from vehicle data + SLA policies |
| `src/utils/vehicleBuckets.ts` | Classifies vehicles into aging buckets (0-30, 31-60, 61-90, 90+ days) |
| `src/utils/vehicleStage.ts` | Determines vehicle pipeline stage from operational dates |
| `src/utils/forecasting.ts` | Forecasting computations |
| `src/lib/import-parser.ts` | Parses CSV/Excel import files into vehicle rows |
| `src/lib/import-normalization.ts` | Normalizes imported vehicle data |
| `src/lib/import-publish.ts` | Publishes import batches atomically |
| `src/lib/import-review.ts` | Review logic for import batches |
| `src/lib/ticketSla.ts` | Computes ticket SLA status from dates |
| `src/services/autoAgingDataService.ts:mapDbVehicle()` | Maps DB row → VehicleCanonical (field-by-field mapping) |

---

## 6. Permission / RBAC Map

### AppRole Type (from `@flc/types`)

```typescript
type AppRole = 'super_admin' | 'company_admin' | 'director' | 'general_manager'
  | 'manager' | 'sales' | 'accounts' | 'analyst' | 'creator_updater'
  | 'portal_admin' | 'portal_manager' | 'portal_staff';
```

### Guard Layers (outside-in)

```
Internet
  │
  ▼
1. Supabase Auth (PKCE, JWT)           ← backend enforced
  │
  ▼
2. ProtectedRoute (AuthContext)         ← checks isAuthenticated (session + profile + company_id + active status)
  │
  ▼
3. RequireActiveModule                  ← checks module_settings.is_active
  │
  ▼
4. RequireRole                          ← checks user.role against allowed list
  │
  ▼
5. Sidebar section visibility           ← role_sections DB table (overrides DEFAULT_ROLE_SECTIONS)
  │
  ▼
6. Sidebar nav item visibility          ← hardcoded item.roles array in mainShellConfig.ts
  │
  ▼
7. Column-level permissions             ← useColumnPermissions / column_permissions table
  │
  ▼
8. Supabase RLS (backend)               ← company_id scope, role-gated writes
```

### Route Role Groups (`src/config/routeRoles.ts`)

| Group | Roles | Usage |
|-------|-------|-------|
| `ADMIN_ONLY` | super_admin, company_admin | `/admin/users`, `/admin/branches`, `/admin/master-data`, `/admin/suppliers`, `/admin/dealers`, `/admin/user-groups`, `/admin/role-permissions` |
| `ADMIN_AND_DIRECTOR` | + director | `/admin/audit` |
| `EXECUTIVE` | + general_manager | `/admin/activity`, `/auto-aging/sla`, `/auto-aging/mappings`, `/sales/margin` |
| `MANAGER_AND_UP` | + manager | `/auto-aging/import`, `/auto-aging/review`, `/auto-aging/commissions`, `/sales/pipeline`, `/sales/invoices`, `/sales/performance`, `/sales/advisors`, `/sales/dealer-invoices`, `/sales/verify-or`, `/inventory/transfers`, `/purchasing/invoices` |
| `ACCOUNTS_AND_UP` | + accounts | `/accounts/*` |
| `PORTAL_QUEUE_ROLES` | + portal_admin, portal_manager | `/portal/queue`, `/portal/history` |
| `PORTAL_SETUP_ROLES` | + portal_admin | `/portal/setup` |

### Section Default Permissions (`src/config/rolePermissions.ts`)

| Role | Platform | Auto Aging | Sales | Inventory | Purchasing | Reports | HRMS | Admin |
|------|----------|------------|-------|-----------|------------|---------|------|-------|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| company_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| director | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| general_manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| manager | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| sales | ✓ | — | ✓ | — | — | — | ✓ | ✓ |
| accounts | ✓ | — | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| analyst | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| creator_updater | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

These defaults are **overridden** by the `role_sections` DB table (loaded by `useRoleSectionMatrix`).

### Notable Permissions Gaps

- `/admin/settings` has **no `RequireRole` guard** (`src/main.tsx:235`). Any authenticated user can access it.
- `/auto-aging/vehicles` has no role guard despite being sensitive inventory data.
- Sidebar item visibility (hardcoded `roles` arrays in `mainShellConfig.ts`) can disagree with route-level `RequireRole` guards — they are maintained independently.
- Portal-only users (`portal_admin`, `portal_manager`, `portal_staff`) bypass the main app entirely via `isPortalOnlyUser()` check in `ProtectedAppShell`.

---

## 7. Database / Schema Map

### Overview

- **Engine**: Supabase Postgres
- **Migrations**: 107 timestamped SQL files in `supabase/migrations/`
- **Generated types**: `packages/supabase/src/database.types.ts` (6121 lines)
- **Edge functions**: 6 (invite-user, delete-user, update-user-status, send-push-notification, rollover-leave-balances, dms-sync-worker)
- **RLS**: Enabled on all tables; company-scoped by `company_id`; role-gated writes

### Table Inventory by Module

#### Core / Foundation

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User profiles | id, email, name, role, company_id, access_scope, branch_id, status, employee_id, portal_access_only |
| `companies` | Multi-tenant companies | id, name, code |
| `branches` | Company branches | id, name, code, company_id |
| `audit_logs` | Immutable audit trail | id, company_id, table_name, record_id, action, changes, performed_by |
| `application_logs` | Client error/event log | id, company_id, level, message, stack_trace, metadata |

#### Auto Aging / Vehicle Management

| Table | Purpose | Key FK |
|-------|---------|--------|
| `vehicles` | Vehicle inventory | import_batch_id → import_batches.id |
| `import_batches` | Import batch tracking | — |
| `quality_issues` | Data quality issues | vehicle_id → vehicles.id |
| `sla_policies` | SLA thresholds | company_id → companies.id |
| `dashboard_preferences` | User KPI display prefs | user_id → profiles.id |
| `column_permissions` | Field-level access control | company_id |
| `branch_mappings` | Import branch code mapping | company_id |
| `payment_method_mappings` | Import payment method mapping | company_id |

#### Sales Module

| Table | Purpose | Key FK |
|-------|---------|--------|
| `sales_orders` | Sales orders | customer_id → customers.id, current_stage → deal_stages.id |
| `sales_order_status_history` | Status change audit | sales_order_id → sales_orders.id |
| `sales_activities` | CRM follow-ups | sales_order_id → sales_orders.id, customer_id |
| `deal_stages` | Pipeline stage definitions | company_id |
| `sales_advisors` | Sales staff registry | company_id, employee_id → employees.id |
| `salesman_targets` | Sales targets | company_id, salesman_id |
| `customers` | Customer records | company_id (dedup unique indexes) |
| `bank_financings` / `registration_records` / `insurance_cover_notes` | Per-order tracking | sales_order_id |

#### Accounts Receivable

| Table | Purpose | Key FK |
|-------|---------|--------|
| `invoices` | Customer invoices | company_id, customer_id, sales_order_id |
| `payment_events` | AR payments (immutable) | invoice_id → invoices.id |
| `official_receipts` | OR records | company_id |
| `commission_records` | Commission payments | vehicle_id → vehicles.id |

#### Accounts Payable

| Table | Purpose | Key FK |
|-------|---------|--------|
| `purchase_invoices` | Supplier invoices | company_id, supplier_id |
| `supplier_payment_events` | AP payments (immutable) | purchase_invoice_id |

#### General Ledger

| Table | Purpose | Key FK |
|-------|---------|--------|
| `accounts` | Chart of accounts | company_id, parent_account_id |
| `accounting_periods` | Fiscal periods | company_id |
| `journal_entries` | JE headers | company_id, accounting_period_id |
| `journal_entry_lines` | JE lines (debit/credit) | journal_entry_id → journal_entries.id, account_id → accounts.id |

#### Internal Requests / Tickets

| Table | Purpose |
|-------|---------|
| `tickets` | Support tickets |
| `request_categories` | Ticket categories (with approval_flow_id FK) |
| `request_subcategories` | Subcategories |
| `request_templates` | Form templates |
| `request_routing_rules` | Auto-assignment rules |
| `request_sla_policies` | SLA policies |
| `ticket_activities` | Activity log |
| `ticket_attachments` | File attachments |
| `ticket_approvals` | Approval tracking |

#### HRMS

| Table | Purpose |
|-------|---------|
| `employees` | Employee records (links to profiles) |
| `departments` | Department definitions |
| `leave_types` | Leave type definitions |
| `leave_balances` | Per-employee leave balances |
| `leave_requests` | Leave applications |
| `attendance_records` | Daily attendance |
| `appraisals` | Appraisal cycles |
| `appraisal_items` | Individual appraisal ratings |
| `payroll_runs` | Payroll run headers |
| `payroll_items` | Per-employee payroll lines |
| `approval_flows` | Configurable workflow definitions |
| `approval_steps` | Steps within flows |
| `approval_instances` | Runtime workflow instances |
| `approval_decisions` | Individual approval/rejection decisions |

#### DMS Sync / Staging

| Table | Purpose |
|-------|---------|
| `dms_raw_sales_orders`, `dms_raw_vehicle_stock`, `dms_raw_collections`, `dms_raw_deliveries`, `dms_raw_leads`, `dms_raw_prospects`, `dms_raw_soa_snapshots`, `dms_raw_master_data`, `dms_raw_order_vehicle_matches` | Raw DMS staging tables |
| `sync_runs` | Sync job tracking |
| `source_reconciliation_matches` / `source_reconciliation_events` | Reconciliation |

#### Master Data

| Table | Purpose |
|-------|---------|
| `vehicle_models`, `vehicle_colours` | Vehicle reference data |
| `banks`, `finance_companies`, `insurance_companies` | Financial institution references |
| `suppliers`, `dealers` | Vendor/dealer records |
| `user_groups` | User grouping |
| `payment_types` | Payment method reference |

### Key Database RPCs (from migrations)

| RPC | Module | Description |
|-----|--------|-------------|
| `commit_import_batch()` | Auto Aging | Atomic batch commit with advisory lock |
| `get_auto_aging_dashboard_summary()` | Auto Aging | Server-side dashboard aggregation |
| `link_vehicle_to_sales_order()` / `unlink_vehicle_from_sales_order()` | Sales | Vehicle-order linking |
| `transition_sales_order_stage()` | Sales Pipeline | Stage transition with audit |
| `get_sales_pipeline_summary()` | Sales Pipeline | Pipeline KPI aggregation |
| `get_sales_dashboard_summary()` | Sales Dashboard | Dashboard KPI tiles |
| `record_payment_event()` / `reverse_payment_event()` | AR | AR payment lifecycle |
| `get_ar_aging_summary()` | AR | AR aging bucket computation |
| `record_supplier_payment_event()` / `reverse_supplier_payment_event()` | AP | AP payment lifecycle |
| `get_ap_aging_summary()` | AP | AP aging bucket computation |
| `transition_pi_lifecycle()` | AP | Purchase invoice state machine |
| `post_ar_payment_to_gl()` / `post_ap_payment_to_gl()` | GL | GL posting |
| `get_trial_balance()` | GL | Period trial balance |
| `handle_new_user()` | Core | Trigger: auto-create profile on signup |

---

## 8. UI / Component Architecture

### App Shell

```
AppShell
├── AppShellSidebar (left, collapsible: 17rem → 3.5rem)
│   ├── Brand area (logo + title)
│   ├── Navigation sections (Platform, Auto Aging, Sales, ...)
│   │   └── AppShellNavLink per item (icons + labels)
│   ├── User area (name, role, avatar initials)
│   ├── Sign out button
│   └── Collapse toggle
├── AppShellTopbar (header strip)
│   ├── Route title + kicker (from routeChrome match)
│   ├── Search input (hidden on mobile)
│   ├── Theme toggle
│   ├── Notification bell (badge)
│   └── User avatar
└── Main content area (<Outlet />)
    └── Width mode: contained (1680px) | wide (1920px) | full
```

### Navigation Configuration

Defined in `src/components/layout/app-shell/mainShellConfig.ts`:

- 9 sections: Platform, Auto Aging, Sales, Inventory, Purchasing, Accounts, Reports, HRMS, Admin
- 40+ nav items with optional role arrays, grouping labels, and external link support
- Route chrome matches: pattern → title + kicker for topbar display
- Focused mode: when a single section is active, sidebar collapses to show only that section

### Shared Components Inventory

| Component | File | Used By | Purpose |
|-----------|------|---------|---------|
| `DataTable` | `shared/DataTable.tsx` | Multiple list pages | Sortable, filterable table |
| `StandardTable` | `shared/StandardTable.tsx` | Various | Alternative table |
| `KpiCard` | `shared/KpiCard.tsx` | Dashboards | Metric display card |
| `PageHeader` | `shared/PageHeader.tsx` | Most pages | Title + breadcrumbs |
| `PageSpinner` | `shared/PageSpinner.tsx` | Lazy-loaded routes | Loading state |
| `PageState` | `shared/PageState.tsx` | Various | Error/empty/loading |
| `StatusBadge` | `shared/StatusBadge.tsx` | Various | Colored status |
| `RequireRole` | `shared/RequireRole.tsx` | Route definitions | Role gate |
| `RequireActiveModule` | `shared/RequireActiveModule.tsx` | Route definitions | Module gate |
| `RouteErrorBoundary` | `shared/RouteErrorBoundary.tsx` | Route definitions | Per-route error boundary |
| `ConfirmDialog` | `shared/ConfirmDialog.tsx` | Various | Confirmation modal |
| `TableSkeleton` | `shared/TableSkeleton.tsx` | Various | Table loading skeleton |
| `MobileCardList` | `shared/MobileCardList.tsx` | Various | Mobile card layout |
| `PageHeader` | `shared/PageHeader.tsx` | Most pages | Breadcrumbs + actions |
| `BranchPeriodFilter` | `shared/BranchPeriodFilter.tsx` | Filterable pages | Filter controls |

### Layout Variants

| Layout | File | Used For |
|--------|------|----------|
| `AppLayout` | `components/layout/AppLayout.tsx` | Main app (Admin, Auto Aging, Inventory, etc.) |
| `SalesLayout` | `components/layout/SalesLayout.tsx` | Sales module subtree |
| `CustomerServiceLayout` | `components/layout/CustomerServiceLayout.tsx` | Portal (tickets) |

### Responsive Behavior

- Mobile: sidebar becomes a Sheet (slide-over drawer)
- Tablet: `autoCollapseOnTablet` collapses sidebar to icon-only
- Desktop: full 17rem sidebar, collapsible to 3.5rem
- Width modes: `contained` (1680px max), `wide` (1920px max), `full` (no constraint)

### Loading / Empty / Error States

| Component | State |
|-----------|-------|
| `PageSpinner` | Centered `Loader2` spinner (used in Suspense fallbacks) |
| `TableSkeleton` | Table-shaped skeleton |
| `KpiSkeleton` | Card-shaped skeleton |
| `RouteErrorBoundary` | Inline error card with retry + go-back buttons |
| `ErrorBoundary` | Full-screen error card with reload + retry |
| `PageState` | Configurable empty/error states |
| `UnauthorizedAccess` | Access denied message |

The app has `RouteErrorBoundary` wrapping every major route (Phase 3 #19) so a crash in one module does not crash the entire app.

---

## 9. Key Integration Points

1. **Supabase client** (`packages/supabase/src/client.ts`)
   - Single shared instance with PKCE auth flow
   - Cross-domain cookie storage (`authStorage.ts`) for SSO across `.protonfookloi.com` subdomains
   - Re-exported via `src/integrations/supabase/client.ts` (barrel)

2. **Auth flow** (`src/contexts/AuthContext.tsx`)
   - Session listener + profile fetch from `profiles` table
   - `ProtectedRoute` wrapper checks `isAuthenticated` (session + profile + company_id + active)
   - `hasRole()` checks user.role against allowed list; super_admin always passes

3. **Module gating** (`src/contexts/ModuleAccessContext.tsx`)
   - `module_settings` table per company
   - `RequireActiveModule` component for route gating
   - `mainShellConfig.ts` for sidebar visibility

4. **Data context** (`src/contexts/DataContext.tsx`)
   - Currently operates in `summary-only` mode (no full vehicle hydration)
   - Real-time subscriptions via Supabase channels
   - Cache invalidation via React Query

5. **Sales context** (`src/contexts/SalesContext.tsx`)
   - Parallel fetch of 5 data types (customers, orders, stages, invoices, targets)
   - Optimistic cache updates for stage transitions and order updates

6. **HRMS workspace redirect** (`src/lib/hrmsWorkspace.ts`)
   - `/hrms/*` routes → `HrmsWorkspaceRedirect` → either same-origin or `VITE_HRMS_APP_URL`
   - Preserves search params and hash during redirect

7. **Branding** (`src/contexts/BrandingContext.tsx`)
   - `company_branding` table → CSS variables for app shell
   - 5-minute stale time (branding changes infrequently)

8. **Internal Requests (Portal)** (`src/pages/tickets/`)
   - Completely separate layout (`CustomerServiceLayout`)
   - Separate role set (`portal_admin`, `portal_manager`, `portal_staff`)
   - Portal-only users bypass main app entirely

9. **Test infrastructure** (`vitest.config.ts`)
   - jsdom environment, React Testing Library
   - Standard tests: `src/**/*.{test,spec}.{ts,tsx}` + `apps/hrms-web/src/**/*.{test,spec}.{ts,tsx}`
   - RLS tests excluded from standard run (require live Supabase + seeded users)
   - Coverage thresholds enforced for `lib/`, `contexts/`, `utils/`, `services/`

---

## 10. Risks and Technical Debt

### 🔴 High Priority

| # | Risk | Location | Impact |
|---|------|----------|--------|
| 1 | **`noImplicitAny` still disabled** | `tsconfig.app.json` | ~30 implicit-any sites in services; tracked as Phase 2 debt. `strictNullChecks` enabled 2026-05-19. |
| 2 | **Generated DB types may be stale** | `packages/supabase/src/database.types.ts` (6121 lines) | Regenerated 2026-05-19 from live Supabase schema. |
| 3 | ~~**`@flc/types` is a 1241-line monolith**~~ | `packages/types/src/` | **Resolved** — split into 8 domain files 2026-05-19. |
| 4 | **Dual permission administration** | Route `RequireRole` + sidebar `role_sections` + column permissions | Can disagree; maintained independently. |
| 5 | **`/admin/settings` has no route guard** | `src/main.tsx:235` | **Intentional** — settings page enforces its own section-level permissions internally; route guard is redundant. |

### 🟡 Medium Priority

| # | Risk | Location | Impact |
|---|------|----------|--------|
| 6 | **Low test coverage** | Most pages and ~56% of services untested | Regressions go undetected. Key services like `autoAgingDataService`, `importService`, `vehicleService` untested. |
| 7 | **HRMS page files are dead code** | `src/pages/hrms/` (6+ components) | Routes redirect to HRMS web app; these files are never rendered. |
| 8 | **`@flc/hrms-hooks` unused** | `packages/hrms-hooks/` | Built but zero imports in either app. Code duplication risk if apps create their own hooks. |
| 9 | **`demo-data.ts` has empty arrays** | `src/data/demo-data.ts` | Dead demo scaffolding. Only `platformModules` is active. |
| 10 | **No server-side pagination** | Multiple list pages (DataTable) | Large datasets (vehicles, orders) may cause client-side performance issues. |
| 11 | **Sidebar nav roles hardcoded** | `mainShellConfig.ts` lines 83-128 | Role arrays hardcoded per item instead of using DB-backed role_sections. |
| 12 | **Integration specs excluded from CI** | `src/test/*.spec.ts` | RLS and pipeline integration tests not run automatically. |
| 13 | **`src/App.tsx` is dead code** | `src/App.tsx` | Router renders from `main.tsx`'s own `App` component, not this file. |

### 🟢 Low Priority

| # | Risk | Location | Impact |
|---|------|----------|--------|
| 14 | Two `dist/` directories | root + `apps/hrms-web/dist/` | Deployment confusion risk. |
| 15 | `src/services/hrms/` may be redundant | `src/services/hrms/` vs `packages/hrms-services/` | Stale wrappers if shared package is canonical. |
| 16 | No i18n coverage | `src/i18n/locales/en.json` | Only English exists; i18n infrastructure is set up but unused. |
| 17 | Empty `supabase/snippets/` directory | — | Scaffolding residue. |

---

## 11. Recommended Development Workflow

### Branch Strategy

- Feature branches from `main`, short-lived (< 3 days)
- Naming: `feature/<module>-<description>` or `fix/<issue-description>`
- Commit messages: `module: verb what/why`

### Change Order (per feature)

```
1. Database migration (if schema change)
2. Regenerate types: supabase gen types typescript > packages/supabase/src/database.types.ts
3. Update domain types in @flc/types (if new entities)
4. Add/update service function in src/services/
5. Add/update React Query hook or context method
6. Write/update service tests (at minimum)
7. Build page component
8. Wire route in src/main.tsx (lazy import + guard)
9. Add sidebar nav item in mainShellConfig.ts
10. Run: npm run lint && npm run typecheck && npm run test
```

### Pre-Commit Checklist

- [ ] `npm run lint` — 0 warnings
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run test` — all passing
- [ ] Tests written/updated for new services
- [ ] No hardcoded secrets or URLs

### Testing Strategy

| Layer | Tool | What to test |
|-------|------|-------------|
| Service | Vitest + mocks | Business logic, DB query shape, error handling |
| Hook | Vitest + RTL + QueryClientProvider | Cache behavior, loading states |
| Component | Vitest + RTL | Rendering, user interactions |
| Page | Vitest + RTL (integration) | Data loading, permissions, navigation |
| E2E | Playwright | Critical user journeys (login → dashboard → detail) |
| RLS | Vitest + live Supabase | Policy correctness (separate config) |

---

## 12. Safe Implementation Strategy

### ✅ Safe to Edit (Isolated / Low Risk)

- Page components in `src/pages/*` (one route per file, no shared state)
- New service files in `src/services/` (follow existing patterns)
- New hook files in `src/hooks/`
- UI primitives in `src/components/ui/` (shadcn, can be regenerated)
- Config files in `src/config/` (env, routeRoles, brand)
- i18n locale files

### ⚠️ High Risk (Read Before Editing)

| File | Reason |
|------|--------|
| `src/main.tsx` | Route definitions, provider tree, lazy imports. Affects entire app shell. |
| `src/contexts/AuthContext.tsx` | Auth flow, session handling, profile loading. Mistakes lock all users out. |
| `src/contexts/DataContext.tsx` | Vehicle data loading for Auto Aging. Summary-only migration incomplete. |
| `src/components/layout/app-shell/mainShellConfig.ts` | Sidebar config affects all modules. |
| `src/config/routeRoles.ts` | Role lists affect all route guards simultaneously. |
| `src/lib/moduleAccess.ts` | Module resolution affects all module-gated routes. |
| `packages/supabase/src/database.types.ts` | Stale types can mask compilation errors. |
| `packages/types/src/index.ts` | Central type monolith — changes can break all packages. |

### 🔗 Shared Components (Test Before Changing)

| Component | Used By |
|-----------|---------|
| `DataTable` | Multiple list pages across modules |
| `PageHeader` | Most pages |
| `KpiCard` / `KpiSkeleton` | Dashboards (Executive, Auto Aging, Sales) |
| `RequireRole` | Every role-gated route |
| `StatusBadge` | Multiple modules |
| `BranchPeriodFilter` | Multiple filterable pages |
| `RouteErrorBoundary` | Every major route |
| `ConfirmDialog` | Mutation confirmations across modules |

### 🛑 Business Logic (Must Not Change Casually)

| File | Logic |
|------|-------|
| `src/utils/kpi-computation.ts` | Vehicle aging KPI calculation rules |
| `src/utils/vehicleBuckets.ts` | Aging bucket classification |
| `src/utils/vehicleStage.ts` | Vehicle stage determination |
| `src/lib/import-parser.ts` | CSV/Excel vehicle import parsing |
| `src/lib/hrmsWorkspace.ts` | HRMS URL resolution and redirect |
| `supabase/migrations/` | Schema changes require coordinated validation |
| `packages/hrms-services/src/approval/approvalEngine.ts` | Approval workflow execution |
| `packages/hrms-services/src/leave/leaveService.ts` | Leave business rules |

### 🗄️ Database Changes Requiring Migrations

| Change | Required Steps |
|--------|---------------|
| New table | Migration → regenerate `database.types.ts` → update `@flc/types` → add service |
| New column | Migration → regenerate types → update service mapping functions |
| RLS policy change | Migration → update `src/test/rls-matrix.spec.ts` |
| New RPC | Migration → add TypeScript wrapper in service → regenerate types |
| Index | Migration (safe, online) |
| Constraint | Migration + verify existing data conforms |

### 🧪 Areas Needing Test Coverage Before Modification

| File | Priority |
|------|----------|
| `src/services/autoAgingDataService.ts` | High — core data fetching for Auto Aging |
| `src/services/vehicleService.ts` | High — vehicle queries and RPC calls |
| `src/contexts/DataContext.tsx` | High — state management for vehicle data |
| `src/lib/import-parser.ts` | Medium — complex import parsing |
| `src/services/importService.ts` | Medium — import pipeline |
| `packages/hrms-services/src/approval/approvalEngine.ts` | Medium — approval workflow |
| `packages/hrms-services/src/leave/leaveService.ts` | Medium — leave business logic |
| `src/services/salesOrderService.ts` | Medium — sales order CRUD + RPCs |

---

## 13. Open Questions

1. **Is `src/App.tsx` actually unused?** The router is defined and rendered in `main.tsx`. `src/App.tsx` is never imported by `main.tsx`. It appears to be dead code from the initial Lovable scaffolding.

2. **How stale is `database.types.ts`?** With 107 migrations, it should be regenerated. The presence of `as Record<string, unknown>` casts in `autoAgingDataService.ts` (e.g., `mapDbVehicle`) suggests the types may be incomplete.

3. **Are the `src/test/*.spec.ts` integration tests currently passing?** They are excluded from standard Vitest runs and require `npm run test:rls` with a live Supabase stack. Their current pass/fail status is unknown.

4. **What is the HRMS web app deployment strategy?** Is it deployed on a subdomain (`hrms.protonfookloi.com`) or built into the main app at `/hrms/`? The `VITE_HRMS_APP_URL` env var supports both modes, but the production configuration is unclear.

5. **Are `src/services/hrms/` services dead code?** HRMS services exist both at `src/services/hrms/` and in `packages/hrms-services/`. The root `AUDIT.md` says they are imported by their corresponding page components in `apps/hrms-web/`, but the `src/` copies may be stale wrappers.

6. **What does `typecheck.log` in the repo root contain?** It likely records TypeScript errors from a previous incomplete typecheck run. The current `tsconfig.json` has `strict: false`, so the number of latent errors is unknown.

7. **Does the root `dist/` need a `.gitignore` entry?** The `dist/` directory at root level is the production build output and should probably be gitignored if not already.

8. **Is the Portal (`/portal`) feature-complete?** The internal request gap assessment in `docs/INTERNAL_REQUEST_GAP_ASSESSMENT.md` may still have open items. The routes exist but feature completeness should be verified against the assessment.
