# UBS Enterprise Redesign — Discovery & Implementation Map

> Branch: `feat/ubs-enterprise-redesign`
> Goal: Transform the existing Unified Business Suite into a premium, modern enterprise SaaS
> experience (reference: Lovable "Northwind" command-center app) **without breaking business
> logic, routes, RLS, permissions, or APIs**.

---

## Phase 0 — Discovery findings

### Current architecture (it is already strong)

The UBS is a mature React 18 + Vite + TanStack Query + Supabase monorepo using shadcn/ui.

| Layer | Where | Notes |
| --- | --- | --- |
| Entry / routing | [src/main.tsx](../src/main.tsx) | `createBrowserRouter`, lazy routes, role + module gates (`RequireRole`, `RequireActiveModule`), per-route error boundaries |
| App shell | [src/components/layout/app-shell/AppShell.tsx](../src/components/layout/app-shell/AppShell.tsx) | Dark collapsible sidebar, topbar, command search, notifications, mobile sheet, content-width modes. **Already premium-grade structure.** |
| Nav registry | [packages/shell/src/platformRegistry.ts](../packages/shell/src/platformRegistry.ts) | Single source of truth for sections, routes, role gates, module gates, route chrome |
| Shell config | [src/components/layout/app-shell/mainShellConfig.ts](../src/components/layout/app-shell/mainShellConfig.ts) | Maps registry → visible, role/module-filtered nav |
| Design tokens | [src/index.css](../src/index.css), [tailwind.config.ts](../tailwind.config.ts) | Dark navy sidebar, light canvas, **purple primary** (`259 43% 42%`), success/warning/info, chart palette |
| UI primitives | [packages/ui/src](../packages/ui/src) | 52 shadcn components |
| Shared patterns | [src/components/shared](../src/components/shared) | ~33 components incl. `PageHeader`, `KpiCard`, `StandardTable`, `FilterBar`, `StatusBadge`, `PageState` (empty/error), skeletons |
| Data | `src/services/*`, `@flc/platform-services`, `@flc/hrms-services` | RLS-backed Supabase + RPC contract checks |

**Conclusion:** This is *not* a restyle-from-scratch job. The shell, tokens, role/module gating,
and a shared-component library already exist and are high quality. The work is **(a) raising the
visual polish to reference quality, (b) turning landing pages into command centers, (c)
consolidating duplicated patterns, and (d) standardizing premium page templates** — all additive
and safe.

### Module map (by sidebar section → routes)

- **Platform**: Home, Inbox, Notifications, Internal Requests shortcut
- **Auto Aging**: overview, vehicles, import center/review/history, data quality, SLA, mappings, commissions, reports
- **Sales**: overview, pipeline, lead intake, performance, margin, orders, invoices, customers, dealer invoices, official receipts, outstanding, advisors
- **Inventory**: stock balance, advanced search, transfers, chassis movement
- **Purchasing**: orders, GRN, 3-way match, invoices
- **Accounts**: chart, periods, trial balance, P&L, balance sheet, aging by branch, cash position, period close, journal
- **Reports**: business reports
- **HRMS** (separate app `apps/hrms-web`): dashboard, leave, approvals, appraisals, attendance, payroll, employees, announcements, settings
- **Admin**: settings, activity, KPI studio, DMS sync, reconciliation, audit, users/roles/groups/permissions, branches, master data, suppliers, dealers
- **Internal Requests** (`/portal`): new/my tickets, queue, setup, announcements, documents

### UI / component map

- **Exists & reusable:** `PageHeader`, `KpiCard`, `StandardTable`/`ExcelTable`, `FilterBar`,
  `StatusBadge`, `PageState` (EmptyState/PageErrorState), `PageSpinner`/`KpiSkeleton`/`TableSkeleton`,
  `ConfirmDialog`, `MobileCardList`, `StepperProgress`.
- **Missing / hand-rolled (to standardize):** `MetricCard` (executive metric w/ delta),
  `ModuleDashboard` template, `ActionRequiredPanel`, `SectionCard`/panel, `DetailDrawer` wrapper,
  `FormSection`, `StageLabel`, `Timeline`/`ActivityFeed`, `ApprovalRoutePreview`, `SettingsSection`.

### Data flow map

- Auth/company context: `AuthContext`, `DataProvider`, `ModuleAccessContext`, `BrandingContext`.
- Server state via TanStack Query; services return `{ data, error }`.
- Unified inbox: [src/services/inboxService.ts](../src/services/inboxService.ts) `loadInbox()` →
  `{ items, counts, errors }` (approvals, reconciliation, tickets, notifications) — gated by
  feature flag `phase4.unified-inbox`.
- Role KPIs: [src/services/kpiHomeService.ts](../src/services/kpiHomeService.ts) `getRoleHomeKpis()`.

### Permission map

- **Backend RLS** + **route-level** `RequireRole` (`ADMIN_ONLY`, `ADMIN_AND_DIRECTOR`,
  `ACCOUNTS_AND_UP`, `EXECUTIVE`, `MANAGER_AND_UP`, portal roles) + **module gates**
  (`RequireActiveModule`) + **section/role matrix** (`useRoleSectionMatrix`). Nav visibility already
  mirrors backend permissions. **Do not change these contracts.**

### Design weaknesses (the actual redesign targets)

1. **Home is a launcher, not a command center** — module-card grid + roadmap; no "what needs my
   attention / what changed today" answer. ([src/pages/Home.tsx](../src/pages/Home.tsx))
2. **~10 duplicated status-color maps** across pages (purchasing, sales, inventory, accounts, HRMS).
3. **~5 hand-rolled tables** bypass `StandardTable`; **4+ ad-hoc loaders**; **40+ raw `glass-panel`**
   usages instead of a panel component.
4. **Approval timelines** re-implemented 3+ times (HRMS leave/appraisal/payroll).
5. **HRMS app duplicates** shared components instead of consuming `@flc/ui` / shared.
6. Tokens are slightly utilitarian (6px radius, flat shadows) vs. the rounder, softer reference.

### Risk areas

- Largest/most complex files (refactor with care, last): `VehicleDetailPanel.tsx` (~1.1k lines),
  HRMS `PayrollSummary.tsx`, `ApprovalInbox.tsx`, `PerformanceAppraisals.tsx`,
  `PurchaseInvoiceDetail.tsx`, `ImportReviewQueue.tsx`, `VehicleExplorer.tsx`.
- HRMS lives in a **separate app/shell** — coordinate visual changes across both.
- Feature-flagged surfaces (`phase4.unified-inbox`) must degrade gracefully.

---

## Target information architecture (sidebar grouping)

The registry already groups by domain. The premium grouping maps cleanly onto existing sections
(no route changes, label/group only):

- **Executive** → Home (Dashboard), Reports / BI
- **Sales** → Sales (CRM, Customers, Pipeline, Lead Pre-screening)
- **Operations** → Inventory, Purchasing, Internal Requests, Approvals (Inbox), Documents
- **People** → HRMS (Leave, Attendance, Payroll, Appraisals)
- **Finance** → Accounts (Invoices, Payments), Auto Aging
- **Administration** → Users & Permissions, Company/Branches, Master Data, System Settings

Only enabled + permitted modules render (already enforced).

---

## Design system plan (premium, additive)

- **Tokens:** rounder radius, softer layered shadows, refined navy sidebar, calm neutral canvas,
  purposeful purple accent — tuned in [src/index.css](../src/index.css).
- **New shared primitives** (additive, no breaking changes):
  - `MetricCard` — executive metric (icon, value, label, trend delta, tone, click-through).
  - `SectionCard` — titled panel with optional action link (replaces raw `glass-panel` headers).
  - `ActionRequiredPanel` — "items waiting for you" list bound to the real inbox service.
- Centralized tone helper `lib/statusTones.ts` to retire duplicated color maps incrementally.

---

## Module-by-module redesign roadmap (incremental, each phase ships working)

| Phase | Scope | Risk |
| --- | --- | --- |
| **1** ✅ (this PR) | Design-system foundation (tokens + `MetricCard`/`SectionCard`/`ActionRequiredPanel`) | Low (additive) |
| **2** ✅ (this PR) | Executive command-center **Home** wired to real services | Low (one page) |
| 3 | Internal Request workspace (queue/detail/templates polish) | Low–Med |
| 4 | HRMS workspace (dashboard, leave control center, directory) + de-dupe shared | Med |
| 5 | Sales / CRM + Loan Pre-screening | Med |
| 6 | Inventory / Documents / Approvals (Inbox) | Med |
| 7 | Settings / Admin restructure | Low–Med |
| 8 | QA, responsive polish, regression | — |

**Principles:** start with shared layout/components; migrate page-by-page; keep each module
functional after every phase; centralize status colors as pages are touched (never big-bang).

---

## Validation plan (run after each phase)

```
npm run typecheck   # tsc + RPC/workflow boundary checks
npm run lint
npm run build
```
Plus runtime smoke: dashboard loads, sidebar + command search work, module nav works, CRUD/forms
submit, approvals/leave/internal-request flows intact, no console errors, no horizontal overflow,
no duplicate submit buttons. Permission/RLS + role-based nav unchanged.

## Remaining risks / open items

- Executive metrics use **only real signals** (inbox counts, notifications, active modules, role
  KPIs). Revenue/cash/branch widgets from the reference are **deferred** until backed by real
  aggregate services (avoid fabricated numbers).
- HRMS shared-component de-duplication is a larger follow-up (Phase 4).
