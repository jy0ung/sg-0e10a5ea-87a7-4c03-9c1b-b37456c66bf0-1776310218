# Auto Aging Remediation Backlog

Status: Open as of 2026-04-29

This backlog captures the next remediation sequence for the Auto Aging module after the initial Phase 1 search/import hardening work.

## Priority Order

1. Move overview and reporting summaries off full client-side vehicle hydration.
   - Current risk:
     - [src/contexts/DataContext.tsx](src/contexts/DataContext.tsx) pages all vehicles into memory.
     - [src/pages/auto-aging/AutoAgingDashboard.tsx](src/pages/auto-aging/AutoAgingDashboard.tsx) and [src/pages/auto-aging/ReportCenter.tsx](src/pages/auto-aging/ReportCenter.tsx) derive analytics from the full client dataset.
     - Browser Excel import/export has been removed, but that did not change the client-side data hydration path.
   - Goal:
     - Add company-scoped server-side summary/query RPCs for dashboard and report workloads.
     - Keep the existing paginated explorer path for row-level browsing.

2. Harden the new import/export operating boundary.
   - Current risk:
     - [src/pages/auto-aging/ImportCenter.tsx](src/pages/auto-aging/ImportCenter.tsx) now supports Google Sheets only in the browser.
     - The current Google Sheets path depends on public or published CSV access and does not support private Workspace sheets.
     - [src/pages/auto-aging/ReportCenter.tsx](src/pages/auto-aging/ReportCenter.tsx) is now CSV-only in the browser, which may not satisfy all downstream Finance or management workflows.
   - Goal:
     - Add an authenticated private-sheet ingestion path through backend integration or scheduled sync.
     - Decide whether `.xlsx` is still a business requirement and, if it is, move it server-side.
     - Completed on 2026-05-08: added [AUTO_AGING_GOOGLE_SHEETS_IMPORT_RUNBOOK.md](AUTO_AGING_GOOGLE_SHEETS_IMPORT_RUNBOOK.md) for the supported Excel-to-Google-Sheets operating path.

3. Increase behavior coverage beyond route smoke.
   - Add focused tests for:
     - dashboard drill-downs into explorer/detail
     - direct vehicle detail route access
     - SLA save behavior
     - mapping CRUD
     - commission status transitions
    - Completed on 2026-05-08: Google Sheets import behavior and failure handling now have focused unit coverage in [src/lib/googleSheetsImport.test.ts](src/lib/googleSheetsImport.test.ts).
   - Keep [e2e/auto-aging-import.spec.ts](e2e/auto-aging-import.spec.ts) as the canonical import smoke path.

4. Harden operational pages that are still thin.
   - Target surfaces:
     - [src/pages/auto-aging/DataQuality.tsx](src/pages/auto-aging/DataQuality.tsx)
     - [src/pages/auto-aging/ImportHistory.tsx](src/pages/auto-aging/ImportHistory.tsx)
     - [src/pages/auto-aging/SLAAdmin.tsx](src/pages/auto-aging/SLAAdmin.tsx)
   - Improvements:
     - better filtering
     - empty/error states
     - audit/history visibility
     - pagination for large result sets

5. Clean up route and detail-view consistency.
   - Completed on 2026-04-29:
     - aligned the detail route param with `chassisNo`
     - added a direct-route regression test in [src/pages/auto-aging/VehicleDetail.test.tsx](src/pages/auto-aging/VehicleDetail.test.tsx)
   - Follow-up:
     - remove any stale assumptions in detail-panel or explorer deep-link code paths as the UX model stabilizes.

6. Revisit export and analytics performance after server-side summary adoption.
   - Reassess whether report generation should stay client-side or move more of the shaping into SQL/RPC helpers.

## Execution Notes

- The first implementation step after this backlog is the dashboard/report summary refactor.
- Prefer extending the existing vehicle RPC lineage (`search_vehicles`, `vehicle_kpi_summary`) instead of adding a parallel API surface.
- Do not widen scope into unrelated Sales or HRMS flows while working through this backlog.