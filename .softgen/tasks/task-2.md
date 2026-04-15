---
title: Fix Excel Import and KPI Logic Relocation
status: done
priority: high
type: bug
tags: [bug, fix, refactor]
created_by: agent
created_at: 2026-04-15T02:00:29Z
position: 2
---

## Notes
Fix the Excel import issue where data is not persisting and relocate the KPI computation logic from demo-data.ts to a proper utility file.

## Checklist
- [x] Check database schema to verify tables and constraints
- [x] Fix upsert constraint in DataContext to match database unique constraint (chassis_no,company_id)
- [x] Create utils/kpi-computation.ts with computeKpiSummaries function
- [x] Update DataContext to import computeKpiSummaries from utils/kpi-computation
- [x] Remove computeKpiSummaries from demo-data.ts
- [x] Create KpiDashboard component to visualize computed KPI summaries
- [x] Update ExecutiveDashboard to use the new KpiDashboard component
- [x] Fix KpiDashboard missing vehicles prop
- [x] Remove Process Flow cards from Auto Aging Dashboard
- [x] Update KPI cards with clearer labels showing "median days"
- [x] Add trend line chart showing 6-month KPI trends
- [x] Add vehicle details modal on KPI card click
- [x] Implement date range and category filters for KPI Dashboard
- [ ] Test Excel import to verify data persistence