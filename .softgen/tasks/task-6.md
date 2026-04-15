---
title: Refactor Vehicle Explorer to Excel-like table
status: in_progress
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
- [ ] Create ExcelTable generic component with edit support
- [ ] Define all Excel columns matching uploaded layout (25+ columns)
- [ ] Remove KPI columns from table
- [ ] Implement inline edit with double-click or Edit button
- [ ] Add date picker for date fields
- [ ] Add dropdown for fixed fields (Branch, Model, Payment)
- [ ] Add number input for prices
- [ ] Implement auto-save on blur or Enter key
- [ ] Add inline validation feedback
- [ ] Add sortable columns
- [ ] Add pagination with customizable page size
- [ ] Add quick filters (branch, model, status)
- [ ] Add bulk actions toolbar
- [ ] Create VehicleDetailPanel component
- [ ] Add read-only/edit mode toggle
- [ ] Integrate permission-based column visibility
- [ ] Test all column types and editors
- [ ] Test mobile responsiveness with horizontal scroll
