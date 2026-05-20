# FLC BI UI/UX Implementation Plan

## Validation Notes

- The original findings were mostly accurate, with corrections below.
- `UserManagement` search already uses shadcn `<Input>`; the remaining item is a broader input/label association audit.
- `VehicleDetail` already passes breadcrumbs to `PageHeader`; no breadcrumb work is needed there.
- Dashboard summary RPCs already exist, but `ExecutiveDashboard` still fetches a 5,000-vehicle sample for client-side KPI/custom-widget calculations.
- Purchasing already has purchase invoices, AP lifecycle, and detail views; the remaining gap is purchase-order creation plus fuller receiving/procurement workflow.
- `--gold` and `--gold-muted` are still mapped through Tailwind and used by auth-page glow styling, so removing them should wait for a theme-token cleanup pass.

## Implemented In This Pass

| # | Task | Status |
|---|---|---|
| 1 | Migrate BranchManagement, Dealers, Suppliers from `validateForm()`/toast-only validation to react-hook-form + Zod + inline `FormMessage` | Done |
| 2 | Replace BranchManagement, Dealers, Suppliers raw tables with `StandardTable` search/sort/pagination | Done |
| 3 | Add loading, empty, and error states to BranchManagement, Dealers, Suppliers | Done |
| 4 | Add accessible names to migrated admin action buttons and table selection/pagination controls | Done |
| 5 | Add Cmd+K command palette in the main app shell using existing route metadata plus vehicle/customer/order/user search | Done |
| 6 | Replace notification dot with unread-count badge from notifications query cache | Done |
| 7 | Rename nav labels: `Chassis Filter` -> `Advanced Search`, `Data Pipeline` -> `Data Import`, `Controls` -> `Configuration` | Done |
| 8 | Show branch name alongside code in `BranchPeriodFilter` and connect its select labels | Done |
| 9 | Complete a broad accessibility pass for icon buttons, hidden file inputs, table controls, and disconnected labels found in the validation audit | Done |
| 10 | Decompose `SettingsPage` into focused settings section components while keeping state/persistence in the page | Done |
| 11 | Decompose `NewTicket`; move schema, constants, and major form sections into `src/pages/tickets/new-ticket/NewTicketSections.tsx` | Done |
| 12 | Mirror unread-count notification badge behavior in the HRMS app-shell copy | Done |
| 13 | Add an HRMS pending-approval count badge to the dedicated HRMS Approvals nav item | Done |
| 14 | Fix the full-suite HRMS service test mock blocker for `resolveRequiredProfileId` | Done |

## Remaining Priorities

| # | Task | Priority | Status |
|---|---|---|---|
| 1 | Migrate remaining `ExecutiveDashboard` custom-widget/client-side KPI calculations off the capped vehicle sample and onto server-side RPCs | Medium | Pending |
| 2 | Expand purchasing with purchase-order creation and receiving/procurement workflow | Medium | Pending |
| 3 | Add CSV/PDF export coverage across remaining data tables and dashboards | Medium | Pending |
| 4 | Add responsive table-to-card views for mobile-heavy pages | Medium | Pending |
| 5 | Replace Advanced/Basic KPI toggle with role-based curated defaults plus settings customization | Medium | Pending |
| 6 | Continue opportunistic accessibility cleanup on pages outside the audited blockers as they are touched | Low | Ongoing |

## Tests Added

- `BranchManagement.test.tsx`: inline validation, create, edit, and delete flows.
- `StandardTable.test.tsx`: search, empty state, sort, pagination, and accessible selection controls.
- `AppShell.test.tsx`: command search control and Cmd+K open/close regression coverage.
- `HrmsLayout.test.tsx`: query-provider wrapper coverage for the HRMS shell approval badge.

## Verification Run

- `npm run typecheck`
- `npx vitest run src/pages/admin/BranchManagement.test.tsx src/components/shared/StandardTable.test.tsx src/components/layout/app-shell/AppShell.test.tsx src/services/hrmsService.test.ts apps/hrms-web/src/services/hrmsService.test.ts apps/hrms-web/src/layout/HrmsLayout.test.tsx apps/hrms-web/src/components/layout/app-shell/AppShell.test.tsx`
- `npm test -- --run` (100 files passed, 3 skipped; 788 tests passed, 28 skipped)
