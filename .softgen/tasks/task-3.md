---
title: Refactor Vehicle Explorer to Excel-like table with flexible permissions
status: in_progress
priority: high
type: feature
tags: [feature, refactor, permissions, audit, excel-like]
created_by: agent
created_at: 2026-04-15T03:15:00Z
position: 3
---

## Notes
Transform Vehicle Explorer into an Excel-like editable grid with admin-managed column-level permissions and comprehensive audit logging.

## Proposed UI

**Vehicle Explorer Table:**
- Full-width responsive table matching Excel layout
- Sortable columns (click header)
- Inline editing for permitted columns (double-click or Edit button)
- Cell validation indicators (red border for errors, yellow for warnings)
- Bulk actions toolbar (Select all, Bulk edit, Export)
- Quick filters (branch, model, status)
- Pagination with customizable page size

**Column Layout (matching Excel):**
```
| Row No | Chassis No | Branch | Model | Variant | Customer | Salesman | 
| BG Date | ETD (PKG) | ETA (KK/TWU/SDK) | Outlet Recv | Reg Date | 
| Delivery Date | Disb Date | Payment Method | LOU | Contra/Sola | 
| Full Payment Date | VAA Date | Reg No | Invoice No | OBR | 
| Dealer Transfer Price | Full Payment Type | Shipment Name | D2D | Remark |
```

**Inline Edit Experience:**
- Click cell to enter edit mode
- Date picker for date fields
- Dropdown for fixed fields (Branch, Model, Payment Method)
- Number input for prices
- Auto-save on blur or Enter key
- Validation feedback inline

**Vehicle Detail View:**
- Side panel or modal showing complete vehicle record
- Read-only mode for non-edit users
- Edit mode for permitted users
- All fields organized into sections (Basic info, Dates, Financials)
- History/audit trail section

**Admin Permission Editor:**
- Table of users with expandable permission details
- Checkbox grid: [ ] Editable [ ] View [ ] None per column
- Toggle switches: Can View Details, Can Edit, Can Bulk Edit
- Preview showing what user sees
- Permission templates (Full, Read-only, Branch-level)

## Schema/Model Updates

**New Table: column_permissions**
```sql
CREATE TABLE column_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL DEFAULT 'vehicles',
  column_name TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('none', 'view', 'edit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, table_name, column_name)
);
```

**New Table: audit_logs** (if not exists)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  changes JSONB NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  table_name TEXT,
  column_name TEXT
);
```

**Update profiles table** (add permission flags if needed):
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_edit_vehicles BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_bulk_edit_vehicles BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_vehicle_details BOOLEAN DEFAULT true;
```

## Permission Design

**Permission Levels:**
- `none` - Column hidden from user
- `view` - Column visible, read-only
- `edit` - Column visible and editable

**Permission Inheritance:**
- `super_admin` - All permissions, no restrictions
- `company_admin` - All permissions for their company
- `director/general_manager` - View all, edit permitted columns
- `manager` - View all, edit branch-specific data
- `sales/accounts` - View/edit based on column_permissions
- `analyst` - View-only access to all columns

**Default Permission Template:**
```javascript
const DEFAULT_PERMISSIONS = {
  super_admin: { all: 'edit' },
  company_admin: { all: 'edit' },
  director: { view: 'all', edit: ['remark', 'customer_name'] },
  general_manager: { view: 'all', edit: ['remark', 'customer_name', 'salesman_name'] },
  manager: { view: 'all', edit: ['remark', 'customer_name', 'salesman_name'] },
  sales: { view: ['chassis_no', 'customer_name', 'model', 'branch_code'], edit: [] },
  accounts: { view: ['chassis_no', 'payment_method', 'dealer_transfer_price', 'full_payment_date'], edit: [] },
  analyst: { view: 'all', edit: [] },
};
```

## API/Backend Changes

**New Service: permissionService.ts** ✅
- getUserColumnPermissions()
- setUserColumnPermissions()
- canEditColumn()
- getUserPermissions()
- canViewColumn()
- getDefaultPermissionsForRole()

**New Service: auditService.ts** ✅
- logVehicleEdit()
- getAuditLog()
- getUserAuditLogs()
- getAllAuditLogs()
- logPermissionChange()

**Update vehicleService.ts:** ✅
- updateVehicleWithAudit()
- batchUpdateVehicles()
- deleteVehicleWithAudit()
- getVehicles()

## Frontend Changes

**Component: ExcelTable.tsx** ✅
- Generic table component with inline edit support
- Sortable columns
- Pagination
- Permission-aware rendering

**Component: VehicleDetailPanel.tsx** (Next)
- Side panel showing complete vehicle record
- Edit mode toggle
- Permission-aware field rendering
- Audit history tab

**Component: PermissionEditor.tsx** (Next)
- User list with expandable permission details
- Checkbox grid for column permissions
- Permission templates
- Preview mode

**Component: AuditLogViewer.tsx** (Next)
- Timeline view of changes
- Filter by user, action, date range
- Diff viewer showing before/after values
- Export audit log

## Validation and Edge Cases

**Column Validation:**
```typescript
const validators = {
  chassis_no: (v: string) => /^[A-Z0-9]{17}$/.test(v) ? null : 'Invalid chassis format',
  bg_date: (v: string) => isValid(parseISO(v)) ? null : 'Invalid date',
  dealer_transfer_price: (v: number) => v >= 0 ? null : 'Price must be positive',
  email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Invalid email',
  branch_code: (v: string) => branches.includes(v) ? null : 'Invalid branch',
};
```

**Edge Cases to Handle:**

1. **Concurrent Edits:** Optimistic locking with version field, conflict resolution dialog
2. **Permission Changes:** Live permission updates, re-render table on permission change
3. **Validation Errors:** Inline error display, prevent save on invalid data, bulk edit validation
4. **Audit Log Performance:** Paginate audit log, index audit_logs table, limit to recent 1000 changes
5. **Data Consistency:** Transaction for multi-field edits, rollback on validation failure, FK constraint handling
6. **Mobile Responsiveness:** Horizontal scroll for table, stacked view for detail panel, touch-friendly edit controls
7. **Bulk Operations:** Batch updates with audit logging, progress indicator, error handling for partial failures
8. **Export Functionality:** Export visible data respecting permissions, include audit log option, format: Excel, CSV, PDF

## Checklist
- [x] Create database migrations for column_permissions and audit_logs tables
- [x] Update profiles table with permission flags
- [x] Create permissionService.ts with permission checking functions
- [x] Create auditService.ts with logging functions
- [x] Update vehicleService.ts to include audit logging
- [x] Create ExcelTable generic component
- [ ] Refactor VehicleExplorer to use ExcelTable
- [ ] Define all Excel columns matching uploaded layout
- [ ] Remove KPI columns from Vehicle Explorer
- [ ] Implement inline edit with auto-save
- [ ] Add cell validation for each column type
- [ ] Create VehicleDetailPanel component
- [ ] Create PermissionEditor admin component
- [ ] Create AuditLogViewer component
- [ ] Add bulk edit functionality
- [ ] Add export functionality
- [ ] Implement permission-based column visibility
- [ ] Add permission templates in admin panel
- [ ] Handle concurrent edits with version field
- [ ] Add audit trail to vehicle detail view
- [ ] Test permission changes live
- [ ] Validate all edge cases
- [ ] Performance test with large datasets
- [ ] Test mobile responsiveness
- [ ] Add unit tests for permission service
- [ ] Add integration tests for audit logging