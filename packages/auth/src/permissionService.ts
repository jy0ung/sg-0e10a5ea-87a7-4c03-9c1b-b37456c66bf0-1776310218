import { supabase, type Tables } from '@flc/supabase';
import { loggingService } from '@flc/platform-services';

export type PermissionLevel = 'none' | 'view' | 'edit';
export type ColumnPermission = Tables<'column_permissions'>;

export interface UserPermissions {
  columns: Map<string, PermissionLevel>; // column_name -> permission_level
  canViewDetails: boolean;
  canEdit: boolean;
  canBulkEdit: boolean;
}

export interface VehiclePermissionDraft {
  canEdit: boolean;
  canBulkEdit: boolean;
  canViewDetails: boolean;
  columns: Record<string, PermissionLevel>;
}

/** Read the stored draft, including flags that an admin role may override at runtime. */
export async function getVehiclePermissionDraft(userId: string): Promise<VehiclePermissionDraft> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('can_edit_vehicles,can_bulk_edit_vehicles,can_view_vehicle_details')
    .eq('id', userId)
    .single();
  if (profileError || !profile) throw new Error(profileError?.message ?? 'User not found');

  const { data: columns, error: columnsError } = await supabase
    .from('column_permissions')
    .select('column_name,permission_level')
    .eq('user_id', userId)
    .eq('table_name', 'vehicles');
  if (columnsError) throw new Error(columnsError.message);

  return {
    canEdit: profile.can_edit_vehicles ?? false,
    canBulkEdit: profile.can_bulk_edit_vehicles ?? false,
    canViewDetails: profile.can_view_vehicle_details ?? true,
    columns: Object.fromEntries((columns ?? []).map(column => [column.column_name, column.permission_level as PermissionLevel])),
  };
}

/** Save the entire Vehicle permission draft in one audited backend transaction. */
export async function saveVehiclePermissionDraft(
  userId: string,
  draft: VehiclePermissionDraft,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('save_vehicle_user_permissions' as never, {
    p_user_id: userId,
    p_can_edit: draft.canEdit,
    p_can_bulk_edit: draft.canBulkEdit,
    p_can_view_details: draft.canViewDetails,
    p_columns: draft.columns,
  } as never);
  return { error: error ? new Error(error.message) : null };
}

interface PermissionMutationAuditContext {
  actorId?: string;
  companyId?: string;
}

async function assertTargetUserInCompany(
  userId: string,
  companyId?: string,
): Promise<{ error: Error | null }> {
  if (!companyId) return { error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) return { error: new Error(error.message) };
  if (!data) return { error: new Error('Target user is outside the current company scope') };
  return { error: null };
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

/** @deprecated Prefer saveVehiclePermissionDraft for a complete atomic edit. */
export async function setUserColumnPermissions(
  userId: string,
  permissions: { column_name: string; permission_level: PermissionLevel }[],
  tableName: string = 'vehicles',
  auditContext: PermissionMutationAuditContext = {}
): Promise<{ error: Error | null }> {
  if (tableName !== 'vehicles') {
    return { error: new Error('A domain-specific atomic command is required for this permission table') };
  }
  const scopeCheck = await assertTargetUserInCompany(userId, auditContext.companyId);
  if (scopeCheck.error) {
    loggingService.error('Permission update blocked by company scope check', { userId, tableName, error: scopeCheck.error }, 'PermissionService');
    return scopeCheck;
  }

  try {
    const stored = await getVehiclePermissionDraft(userId);
    return saveVehiclePermissionDraft(userId, {
      ...stored,
      columns: Object.fromEntries(permissions.map(permission => [permission.column_name, permission.permission_level])),
    });
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unable to load Vehicle permissions') };
  }
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
    columnPerms.map(p => [p.column_name, p.permission_level as unknown as PermissionLevel])
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

  return defaultPerms[role] || defaultPerms.creator_updater;
}
