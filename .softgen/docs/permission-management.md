# Permission Management System Documentation

## Overview

The FLC BI platform includes a comprehensive permission management system that allows administrators to control user access to the Vehicle Explorer at a granular level. This system supports column-level permissions, general permissions, and role-based templates.

## Features

### 1. Column-Level Permissions
- **View**: User can see the column data
- **Edit**: User can modify the column data
- **None**: Column is completely hidden from the user

### 2. General Permissions
- **Can Edit Vehicles**: Allow users to make single edits to vehicle records
- **Can Bulk Edit**: Allow users to edit multiple vehicles simultaneously
- **Can View Details**: Allow users to access the complete vehicle detail view

### 3. Permission Templates
Quick templates for common roles:

- **Full Access**: Edit permissions on all columns
- **Read Only**: View permissions on all columns
- **Sales Role**: View access to customer-facing fields (chassis, model, customer, salesman, delivery date)
- **Accounts Role**: View access to financial fields (payment method, dealer transfer price, LOU amount, invoice, etc.)

## How to Use

### Accessing Permission Editor

1. Navigate to **Admin → Users & Roles**
2. Find the user you want to configure
3. Click the **Permissions** button (gear icon) next to the user

### Setting Column Permissions

1. The **Column Permissions** tab shows all available columns
2. For each column, click:
   - **Edit**: Allow full edit access
   - **View**: Allow read-only access
   - **None**: Hide the column completely

3. Use **Quick Templates** to apply predefined permission sets:
   - Click a template button (Full Access, Read Only, etc.)
   - Review and customize as needed

### Setting General Permissions

1. Switch to the **General Permissions** tab
2. Toggle switches for:
   - **Can Edit Vehicles**: Enable/disable single record editing
   - **Can Bulk Edit**: Enable/disable bulk editing capabilities
   - **Can View Details**: Enable/disable detailed view access

### Saving Changes

1. Click **Save Changes** to apply permissions
2. An audit log entry will be created tracking who made the change
3. The user's access will update immediately

## Role-Based Default Permissions

When users are assigned roles, they receive default permissions:

### Super Admin & Company Admin
- Full edit access to all columns (implicit)
- Can edit vehicles
- Can bulk edit
- Can view details

### Director / General Manager
- Edit access to remark field
- View access to customer and salesman fields
- Can edit vehicles
- Cannot bulk edit
- Can view details

### Manager
- Same as Director/General Manager

### Sales
- View access: chassis_no, model, variant, branch_code, customer_name, salesman_name
- Cannot edit vehicles
- Cannot bulk edit
- Can view details

### Accounts
- View access: chassis_no, payment_method, dealer_transfer_price, full_payment_date, lou_amount, invoice_no, obr
- Cannot edit vehicles
- Cannot bulk edit
- Can view details

### Analyst
- View access to all columns
- Cannot edit vehicles
- Cannot bulk edit
- Can view details

## Database Schema

### Tables

#### `column_permissions`
Stores column-level permissions for each user:

```sql
user_id UUID NOT NULL
table_name TEXT NOT NULL DEFAULT 'vehicles'
column_name TEXT NOT NULL
permission_level TEXT NOT NULL -- 'none', 'view', 'edit'
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

#### `profiles` (updated)
Additional permission fields:

```sql
can_edit_vehicles BOOLEAN DEFAULT FALSE
can_bulk_edit_vehicles BOOLEAN DEFAULT FALSE
can_view_vehicle_details BOOLEAN DEFAULT TRUE
```

#### `audit_logs`
Tracks all permission changes:

```sql
action_type TEXT NOT NULL -- e.g., 'permission_change'
table_name TEXT -- e.g., 'column_permissions'
record_id UUID -- user_id whose permissions were changed
changes JSONB -- detailed change record
performed_by UUID NOT NULL -- who made the change
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

## API Reference

### Permission Service (`src/services/permissionService.ts`)

#### `getUserColumnPermissions(userId, tableName?)`
Get column permissions for a specific user and table.

```typescript
const permissions = await getUserColumnPermissions(userId, 'vehicles');
// Returns: Array of ColumnPermission objects
```

#### `setUserColumnPermissions(userId, permissions, tableName?)`
Set column permissions for a user (replaces existing).

```typescript
await setUserColumnPermissions(userId, [
  { column_name: 'chassis_no', permission_level: 'view' },
  { column_name: 'customer_name', permission_level: 'edit' },
], 'vehicles');
```

#### `getUserPermissions(userId)`
Get comprehensive permissions for a user including column permissions and general permissions.

```typescript
const permissions = await getUserPermissions(userId);
// Returns: {
//   columns: Map<column_name, permission_level>,
//   canViewDetails: boolean,
//   canEdit: boolean,
//   canBulkEdit: boolean,
// }
```

#### `canEditColumn(userId, columnName, tableName?)`
Check if a user can edit a specific column.

```typescript
const canEdit = await canEditColumn(userId, 'chassis_no', 'vehicles');
// Returns: boolean
```

#### `canViewColumn(userPermissions, columnName)`
Check if a user can view a specific column (helper function).

```typescript
const canView = canViewColumn(userPermissions, 'chassis_no');
// Returns: boolean
```

#### `getDefaultPermissionsForRole(role)`
Get default permissions for a specific role.

```typescript
const defaults = getDefaultPermissionsForRole('sales');
// Returns: { columns: [...], canEdit: false, canBulkEdit: false, canViewDetails: true }
```

## Integration Points

### Vehicle Explorer (`src/pages/auto-aging/VehicleExplorer.tsx`)

The Vehicle Explorer respects permissions in two ways:

1. **Column Filtering**: Columns are hidden if the user has no permission
2. **Edit Control**: Edit functionality is disabled if user lacks edit permission

```typescript
// Load user permissions
const [userPermissions, setUserPermissions] = useState(null);

useEffect(() => {
  if (user?.id) {
    getUserPermissions(user.id).then(setUserPermissions);
  }
}, [user?.id]);

// Filter columns based on permissions
const filteredColumns = columns.filter(col => {
  const perm = permissions[col.key];
  return perm === 'edit' || perm === 'view' || (!permissions || userPermissions?.role === 'super_admin');
});

// Disable edit if user lacks permission
<ExcelTable
  columns={filteredColumns}
  onEdit={userPermissions?.canEdit ? handleCellEdit : undefined}
/>
```

### Audit Service (`src/services/auditService.ts`)

All permission changes are automatically logged to the audit trail:

```typescript
await logPermissionChange(currentUser?.id, userId, {
  columns: { before: 'previous', after: columnPermissions },
  canEdit: { before: 'previous', after: canEdit },
  canBulkEdit: { before: 'previous', after: canBulkEdit },
  canViewDetails: { before: 'previous', after: canViewDetails },
});
```

## Best Practices

1. **Use Templates**: Start with a role template, then customize
2. **Principle of Least Privilege**: Grant minimum necessary permissions
3. **Test Changes**: Verify permissions work as expected before deploying
4. **Audit Regularly**: Review audit logs to ensure appropriate access levels
5. **Document Role Changes**: Keep track of role assignments and permission changes

## Troubleshooting

### User Cannot See Expected Columns
- Verify column permissions are set correctly
- Check that user's role allows access
- Ensure no "None" permission is blocking the column

### User Cannot Edit Despite Having Edit Permission
- Verify general "Can Edit Vehicles" permission is enabled
- Check column-specific edit permission
- Ensure user's role allows editing

### Permissions Not Applying Immediately
- Permissions apply immediately on next page load
- User may need to refresh the page
- Check browser cache if issues persist

## Future Enhancements

Potential improvements to the permission system:

1. **Bulk Permission Assignment**: Apply permissions to multiple users at once
2. **Permission Groups**: Create reusable permission sets
3. **Time-Based Permissions**: Temporary access with expiration
4. **Field-Level Validation**: Additional validation rules per column
5. **Export Permissions**: Separate permissions for data export

## Support

For issues or questions about the permission management system:
1. Check this documentation
2. Review audit logs for recent changes
3. Contact your system administrator

---

**Last Updated**: 2026-04-15  
**Version**: 1.0.0