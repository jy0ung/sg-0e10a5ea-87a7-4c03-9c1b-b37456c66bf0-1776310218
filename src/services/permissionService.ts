import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { loggingService } from './loggingService';

export type PermissionLevel = 'none' | 'view' | 'edit';
export type ColumnPermission = Tables<'column_permissions'>;

export interface UserPermissions {
  columns: Map<string, PermissionLevel>; // column_name -> permission_level
  canViewDetails: boolean;
  canEdit: boolean;
  canBulkEdit: boolean;
}

/**
 * Get column permissions for a specific user and table
 */
export async function getUserColumnPermissions(
  userId: string,
  tableName: string = 'vehicles'
): Promise<ColumnPermission[]> {
  const { data, error } = await supabase
    .from('column_permissions')
    .select('*')
    .eq('user_id', userId)
    .eq('table_name', tableName);

  if (error) {
    loggingService.error('Error fetching column permissions', { error }, 'PermissionService');
    return [];
  }

  return data || [];
}

/**
 * Set column permissions for a user (replaces existing)
 */
export async function setUserColumnPermissions(
  userId: string,
  permissions: { column_name: string; permission_level: PermissionLevel }[],
  tableName: string = 'vehicles'
): Promise<{ error: Error | null }> {
  // Delete existing permissions for this user/table
  const { error: deleteError } = await supabase
    .from('column_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('table_name', tableName);

  if (deleteError) {
    loggingService.error('Error deleting old permissions', { error: deleteError }, 'PermissionService');
    return { error: deleteError };
  }

  // Insert new permissions
  if (permissions.length > 0) {
    const { error: insertError } = await supabase
      .from('column_permissions')
      .insert(
        permissions.map(p => ({
          user_id: userId,
          table_name: tableName,
          column_name: p.column_name,
          permission_level: p.permission_level,
        }))
      );

    if (insertError) {
      loggingService.error('Error inserting new permissions', { error: insertError }, 'PermissionService');
      return { error: insertError };
    }
  }

  return { error: null };
}

/**
 * Check if a user can edit a specific column
 */
export async function canEditColumn(
  userId: string,
  columnName: string,
  tableName: string = 'vehicles'
): Promise<boolean> {
  // Get user profile first to check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, can_edit_vehicles')
    .eq('id', userId)
    .single();

  // Super admins and company admins can edit everything
  if (profile?.role === 'super_admin' || profile?.role === 'company_admin') {
    return true;
  }

  // Check if user has general edit permission
  if (!profile?.can_edit_vehicles) {
    return false;
  }

  // Check column-specific permission
  const { data: perm } = await supabase
    .from('column_permissions')
    .select('permission_level')
    .eq('user_id', userId)
    .eq('table_name', tableName)
    .eq('column_name', columnName)
    .single();

  return perm?.permission_level === 'edit';
}

/**
 * Get comprehensive permissions for a user
 */
export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!profile) {
    return {
      columns: new Map(),
      canViewDetails: false,
      canEdit: false,
      canBulkEdit: false,
    };
  }

  // Get column permissions
  const columnPerms = await getUserColumnPermissions(userId, 'vehicles');
  const columnMap = new Map<string, PermissionLevel>(
    columnPerms.map(p => [p.column_name, p.permission_level])
  );

  // Super admins and company admins have full access
  if (profile.role === 'super_admin' || profile.role === 'company_admin') {
    return {
      columns: new Map(), // All columns implicitly 'edit'
      canViewDetails: true,
      canEdit: true,
      canBulkEdit: true,
    };
  }

  return {
    columns: columnMap,
    canViewDetails: profile.can_view_vehicle_details ?? true,
    canEdit: profile.can_edit_vehicles ?? false,
    canBulkEdit: profile.can_bulk_edit_vehicles ?? false,
  };
}

/**
 * Check if a user can view a specific column
 */
export function canViewColumn(
  userPermissions: UserPermissions,
  columnName: string
): boolean {
  const perm = userPermissions.columns.get(columnName);
  return perm === 'view' || perm === 'edit' || userPermissions.canEdit;
}

/**
 * Get default permissions based on role
 */
export function getDefaultPermissionsForRole(role: string): {
  columns: { column_name: string; permission_level: PermissionLevel }[];
  canEdit: boolean;
  canBulkEdit: boolean;
  canViewDetails: boolean;
} {
  const defaultPerms: Record<string, {
    columns: { column_name: string; permission_level: PermissionLevel }[];
    canEdit: boolean;
    canBulkEdit: boolean;
    canViewDetails: boolean;
  }> = {
    super_admin: {
      columns: [],
      canEdit: true,
      canBulkEdit: true,
      canViewDetails: true,
    },
    company_admin: {
      columns: [],
      canEdit: true,
      canBulkEdit: true,
      canViewDetails: true,
    },
    director: {
      columns: [
        { column_name: 'customer_name', permission_level: 'view' as const },
        { column_name: 'salesman_name', permission_level: 'view' as const },
        { column_name: 'remark', permission_level: 'edit' as const },
      ],
      canEdit: true,
      canBulkEdit: false,
      canViewDetails: true,
    },
    general_manager: {
      columns: [
        { column_name: 'customer_name', permission_level: 'view' as const },
        { column_name: 'salesman_name', permission_level: 'view' as const },
        { column_name: 'remark', permission_level: 'edit' as const },
      ],
      canEdit: true,
      canBulkEdit: false,
      canViewDetails: true,
    },
    manager: {
      columns: [
        { column_name: 'customer_name', permission_level: 'view' as const },
        { column_name: 'salesman_name', permission_level: 'view' as const },
        { column_name: 'remark', permission_level: 'edit' as const },
      ],
      canEdit: true,
      canBulkEdit: false,
      canViewDetails: true,
    },
    sales: {
      columns: [
        { column_name: 'chassis_no', permission_level: 'view' as const },
        { column_name: 'model', permission_level: 'view' as const },
        { column_name: 'variant', permission_level: 'view' as const },
        { column_name: 'branch_code', permission_level: 'view' as const },
        { column_name: 'customer_name', permission_level: 'view' as const },
        { column_name: 'salesman_name', permission_level: 'view' as const },
      ],
      canEdit: false,
      canBulkEdit: false,
      canViewDetails: true,
    },
    accounts: {
      columns: [
        { column_name: 'chassis_no', permission_level: 'view' as const },
        { column_name: 'payment_method', permission_level: 'view' as const },
        { column_name: 'dealer_transfer_price', permission_level: 'view' as const },
        { column_name: 'full_payment_date', permission_level: 'view' as const },
        { column_name: 'lou_amount', permission_level: 'view' as const },
      ],
      canEdit: false,
      canBulkEdit: false,
      canViewDetails: true,
    },
    analyst: {
      columns: [], // View all columns by default
      canEdit: false,
      canBulkEdit: false,
      canViewDetails: true,
    },
  };

  return defaultPerms[role] || defaultPerms.analyst;
}