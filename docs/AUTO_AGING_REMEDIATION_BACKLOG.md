# Auto Aging Remediation Backlog

Status: Open as of 2026-04-29

This backlog captures the next remediation sequence for the Auto Aging module after the initial Phase 1 search/import hardening work.

## Priority Order

1. Move overview and reporting summaries off full client-side vehicle hydration.
   - Current risk:
     - [src/contexts/DataContext.tsx](src/contexts/DataContext.tsx) pages all vehicles into memory.
     - [src/pages/auto-aging/AutoAgingDashboard.tsx](src/pages/auto-aging/AutoAgingDashboard.tsx) and [src/pages/auto-aging/ReportCenter.tsx](src/pages/auto-aging/ReportCenter.tsx) derive analytics from the full client dataset.
   - Goal:
     - Add company-scoped server-side summary/query RPCs for dashboard and report workloads.
     - Keep the existing paginated explorer path for row-level browsing.

2. Increase behavior coverage beyond route smoke.
   - Add focused tests for:
     - dashboard drill-downs into explorer/detail
     - direct vehicle detail route access
     - SLA save behavior
     - mapping CRUD
     - commission status transitions
   - Keep [e2e/auto-aging-import.spec.ts](e2e/auto-aging-import.spec.ts) as the canonical import smoke path.

3. Harden operational pages that are still thin.
   - Target surfaces:
     - [src/pages/auto-aging/DataQuality.tsx](src/pages/auto-aging/DataQuality.tsx)
     - [src/pages/auto-aging/ImportHistory.tsx](src/pages/auto-aging/ImportHistory.tsx)
     - [src/pages/auto-aging/SLAAdmin.tsx](src/pages/auto-aging/SLAAdmin.tsx)
   - Improvements:
     - better filtering
     - empty/error states
     - audit/history visibility
     - pagination for large result sets

4. Clean up route and detail-view consistency.
   - Completed on 2026-04-29:
     - aligned the detail route param with `chassisNo`
     - added a direct-route regression test in [src/pages/auto-aging/VehicleDetail.test.tsx](src/pages/auto-aging/VehicleDetail.test.tsx)
   - Follow-up:
     - remove any stale assumptions in detail-panel or explorer deep-link code paths as the UX model stabilizes.

5. Revisit export and analytics performance after server-side summary adoption.
   - Reassess whether report generation should stay client-side or move more of the shaping into SQL/RPC helpers.

## Execution Notes

- The first implementation step after this backlog is the dashboard/report summary refactor.
- Prefer extending the existing vehicle RPC lineage (`search_vehicles`, `vehicle_kpi_summary`) instead of adding a parallel API surface.
- Do not widen scope into unrelated Sales or HRMS flows while working through this backlog.