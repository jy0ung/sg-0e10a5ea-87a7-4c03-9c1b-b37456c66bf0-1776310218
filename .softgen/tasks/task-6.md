---
title: Refactor Vehicle Explorer to Excel-like table
status: done
priority: high
type: refactor
tags:
- refactor
- excel-like
- table
- ui
created_by: agent
created_at: 2026-04-15 03:18:00+00:00
position: 0
---

## Notes
Refactor the existing Vehicle Explorer to match the uploaded Excel layout with inline editing, removing KPI columns and adding full detail view.

## Checklist
- [x] Create ExcelTable generic component with edit support
- [x] Define all Excel columns matching uploaded layout (25+ columns)
- [x] Remove KPI columns from table
- [x] Implement inline edit with double-click or Edit button
- [x] Add date picker for date fields
- [x] Add dropdown for fixed fields (Branch, Model, Payment)
- [x] Add number input for prices
- [x] Implement auto-save on blur or Enter key
- [x] Add inline validation feedback
- [x] Add sortable columns
- [x] Add pagination with customizable page size
- [x] Add quick filters (branch, model, status)
- [x] Add bulk actions toolbar
- [x] Create VehicleDetailPanel component
- [x] Add read-only/edit mode toggle
- [x] Integrate permission-based column visibility
- [x] Test all column types and editors
- [x] Test mobile responsiveness with horizontal scroll
