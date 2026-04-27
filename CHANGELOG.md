# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Phase 1 performance closeout: bundle budget enforcement, lazy `exceljs`
  workbook loading, server-backed Vehicle Explorer filtering/sorting, UAT
  deploy verification, and same-origin Supabase proxying for UAT.
- Phase 3 (#19–#25): per-route `RouteErrorBoundary`, service-layer extraction
  for sales/inventory/purchasing/admin/tickets/executive dashboard, shared
  `@flc/hrms-services` package, auto-aging vehicle-bucket classifier,
  debounced dashboard preference writes, extracted
  `ExecutiveDashboardSettings` component.
- Phase 4 (#26–#32): unified toast through `sonner` shim, i18n scaffold
  (`i18next` + `react-i18next`), system dark mode via `next-themes`,
  coverage thresholds in `vitest.config.ts`, memoized `DataContext` /
  `SalesContext` provider values, `docs/ARCHITECTURE.md`,
  `docs/SECURITY.md`, `docs/ENV.md`, `docs/RLS_MATRIX.md`,
  `docs/RELEASE.md`, `docs/BACKUP_DR.md`.
- Phase 5 (#33–#37): `.env.staging.example`, backup/DR runbook, CHANGELOG,
  security sign-off script, launch checklist.

### Changed
- Replaced `xlsx` runtime usage with lazy-loaded `exceljs` in workbook import
  and export paths.
- Vehicle Explorer now uses the `search_vehicles` RPC for paginated search,
  payment/stage filters, and sortable table columns with client fallback.
- `handle_new_user` now ignores client-supplied role/company/access metadata.
- Public signup disabled (`supabase/config.toml`).
- RLS hardened on `vehicles`, `import_batches`, `quality_issues`,
  `sla_policies`, `audit_logs`, `application_logs`, `companies`,
  `branches`, and master-data tables.

### Security
- Removed the accepted `xlsx` audit exception by replacing the dependency path.
- Removed `company_id: 'default'` fallback in `AuthContext.fetchProfile`.
- `send-push-notification` validates JWT + same-company target check.
- CORS tightened to an explicit allow-list.
- Rotated credentials out of `scripts/seed-from-extract.ts` and
  `scripts/setup-ubuntu-test-server.sh`.
