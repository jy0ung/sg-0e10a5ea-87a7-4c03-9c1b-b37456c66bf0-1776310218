---
title: Refactor Vehicle Explorer to Excel-like table with flexible permissions
status: todo
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

ALTER TABLE column_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON column_permissions FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "user_own_permissions" ON column_permissions FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('company_admin', 'director', 'general_manager')
  ));
```

**New Table: audit_logs** (if not exists)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  changes JSONB NOT NULL, -- {before: {...}, after: {...}}
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  table_name TEXT, -- 'vehicles', 'column_permissions', etc.
  column_name TEXT -- specific column edited
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_logs" ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admin_view_all_logs" ON audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uuid() AND role IN ('super_admin', 'company_admin', 'director', 'general_manager')
  ));
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

**Permission Check Function:**
```typescript
function canEditColumn(userId: string, columnName: string): Promise<boolean> {
  const { user } = await supabase.auth.getUser();
  if (!user) return false;
  
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'super_admin' || profile?.role === 'company_admin') return true;
  
  const { data: perm } = await supabase
    .from('column_permissions')
    .select('permission_level')
    .eq('user_id', user.id)
    .eq('column_name', columnName)
    .single();
  
  return perm?.permission_level === 'edit';
}
```

## API/Backend Changes

**New Service: permissionService.ts**
```typescript
export async function getUserColumnPermissions(userId: string, tableName: string = 'vehicles') {
  const { data, error } = await supabase
    .from('column_permissions')
    .select('column_name, permission_level')
    .eq('user_id', userId)
    .eq('table_name', tableName);
  return data || [];
}

export async function setUserColumnPermissions(userId: string, permissions: ColumnPermission[]) {
  return supabase.from('column_permissions').upsert(
    permissions.map(p => ({ user_id: userId, table_name: 'vehicles', ...p }))
  );
}

export async function checkEditPermission(userId: string, columnName: string): Promise<boolean> {
  // Check role first, then column_permissions
}
```

**New Service: auditService.ts**
```typescript
export async function logVehicleEdit(
  userId: string,
  vehicleId: string,
  changes: Record<string, { before: any; after: any }>,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'update',
    entity_type: 'vehicle',
    entity_id: vehicleId,
    changes: changes,
    table_name: 'vehicles',
    ...metadata
  });
}

export async function getAuditLog(vehicleId: string) {
  return supabase.from('audit_logs')
    .select('*, profiles(name, email, role)')
    .eq('entity_id', vehicleId)
    .order('created_at', { ascending: false });
}
```

**Update vehicleService.ts:**
```typescript
export async function updateVehicleWithAudit(
  vehicleId: string,
  updates: Partial<VehicleCanonical>,
  userId: string
) {
  // 1. Fetch current values
  const { data: current } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();
  
  // 2. Prepare changes object for audit
  const changes: Record<string, { before: any; after: any }> = {};
  Object.keys(updates).forEach(key => {
    if (current[key] !== updates[key]) {
      changes[key] = { before: current[key], after: updates[key] };
    }
  });
  
  // 3. Update vehicle
  const { data, error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', vehicleId)
    .select()
    .single();
  
  // 4. Log audit if changes exist
  if (Object.keys(changes).length > 0) {
    await logVehicleEdit(userId, vehicleId, changes);
  }
  
  return { data, error };
}
```

## Frontend Changes

**Component: ExcelTable.tsx** (New generic component)
```typescript
interface ExcelTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  editableColumns?: string[];
  onEdit?: (rowId: string, column: string, value: any) => Promise<void>;
  permissions?: Record<string, 'view' | 'edit'>;
  loading?: boolean;
  pagination?: PaginationConfig;
  sort?: SortConfig;
}

interface TableColumn<T> {
  key: keyof T;
  label: string;
  width?: number;
  sortable?: boolean;
  editable?: boolean;
  type?: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options?: string[]; // for select type
  format?: (value: any) => string;
  validate?: (value: any) => string | null; // return error message or null
}
```

**Component: VehicleExplorerTable.tsx** (Refactored)
- Replace existing table with ExcelTable
- Define all Excel columns matching layout
- Integrate permission checks per column
- Add inline edit handling with auto-save
- Add cell validation
- Add audit trail view

**Component: VehicleDetailPanel.tsx** (New)
- Side panel showing complete vehicle record
- Edit mode toggle
- Permission-aware field rendering
- Audit history tab

**Component: PermissionEditor.tsx** (New admin component)
- User list with expandable permission details
- Checkbox grid for column permissions
- Permission templates
- Preview mode

**Component: AuditLogViewer.tsx** (New)
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

1. **Concurrent Edits:**
   - Optimistic locking with version field
   - Conflict resolution dialog

2. **Permission Changes:**
   - Live permission updates
   - Re-render table on permission change
   - Handle revoked edit mid-edit

3. **Validation Errors:**
   - Inline error display
   - Prevent save on invalid data
   - Bulk edit validation

4. **Audit Log Performance:**
   - Paginate audit log
   - Index audit_logs table
   - Limit to recent 1000 changes by default

5. **Data Consistency:**
   - Transaction for multi-field edits
   - Rollback on validation failure
   - FK constraint handling

6. **Mobile Responsiveness:**
   - Horizontal scroll for table
   - Stacked view for detail panel
   - Touch-friendly edit controls

7. **Bulk Operations:**
   - Batch updates with audit logging
   - Progress indicator
   - Error handling for partial failures

8. **Export Functionality:**
   - Export visible data respecting permissions
   - Include audit log option
   - Format: Excel, CSV, PDF

## Checklist
- [ ] Create database migrations for column_permissions and audit_logs tables
- [ ] Update profiles table with permission flags
- [ ] Create permissionService.ts with permission checking functions
- [ ] Create auditService.ts with logging functions
- [ ] Update vehicleService.ts to include audit logging
- [ ] Create ExcelTable generic component
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