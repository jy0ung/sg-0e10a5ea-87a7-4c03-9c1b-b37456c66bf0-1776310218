import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { performanceService } from './performanceService';
import { loggingService } from './loggingService';

export type AuditLog = Tables<'audit_logs'>;

export interface AuditChange<T = unknown> {
  before: T;
  after: T;
}

export interface AuditLogWithProfile extends AuditLog {
  profiles?: {
    full_name: string | null;
    email: string;
    role: string;
  };
}

/**
 * Log a vehicle edit to audit trail
 */
export async function logVehicleEdit(
  userId: string,
  vehicleId: string,
  changes: Record<string, AuditChange<unknown>>,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ error: Error | null }> {
  const queryId = `audit-log-${vehicleId}-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'update',
    entity_type: 'vehicle',
    entity_id: vehicleId,
    changes: changes as Record<string, unknown>,
    table_name: 'vehicles',
    ...metadata,
  });

  performanceService.endQueryTimer(queryId, "log_vehicle_edit");

  if (error) {
    loggingService.error("Failed to log vehicle edit", { userId, vehicleId, error }, "AuditService");
  }

  return { error: error || null };
}

/**
 * Get audit log for a specific vehicle
 */
export async function getAuditLog(
  vehicleId: string,
  limit: number = 100
): Promise<{ data: AuditLogWithProfile[] | null; error: Error | null }> {
  const queryId = `audit-get-vehicle-${vehicleId}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, profiles(full_name, email, role)')
    .eq('entity_id', vehicleId)
    .eq('entity_type', 'vehicle')
    .order('created_at', { ascending: false })
    .limit(limit);

  performanceService.endQueryTimer(queryId, "get_audit_log_vehicle");

  if (error) {
    loggingService.error("Failed to get audit log", { vehicleId, error }, "AuditService");
  }

  return { data, error: error || null };
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: AuditLog[] | null; error: Error | null }> {
  const queryId = `audit-get-user-${userId}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  performanceService.endQueryTimer(queryId, "get_user_audit_logs");

  if (error) {
    loggingService.error("Failed to get user audit logs", { userId, error }, "AuditService");
  }

  return { data, error: error || null };
}

/**
 * Get all audit logs (admin only)
 */
export async function getAllAuditLogs(
  limit: number = 100,
  offset: number = 0,
  filters?: {
    entityType?: string;
    userId?: string;
    fromDate?: Date;
    toDate?: Date;
  }
): Promise<{ 
  data: AuditLogWithProfile[] | null; 
  error: Error | null; 
  count?: number 
}> {
  const queryId = `audit-get-all-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  let query = supabase
    .from('audit_logs')
    .select('*, profiles(full_name, email, role)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.entityType) {
    query = query.eq('entity_type', filters.entityType);
  }

  if (filters?.userId) {
    query = query.eq('user_id', filters.userId);
  }

  if (filters?.fromDate) {
    query = query.gte('created_at', filters.fromDate.toISOString());
  }

  if (filters?.toDate) {
    query = query.lte('created_at', filters.toDate.toISOString());
  }

  const { data, error, count } = await query;

  performanceService.endQueryTimer(queryId, "get_all_audit_logs");

  if (error) {
    loggingService.error("Failed to get all audit logs", { filters, error }, "AuditService");
  }

  return { data, error: error || null, count };
}

/**
 * Log a permission change
 */
export async function logPermissionChange(
  userId: string,
  targetUserId: string,
  changes: Record<string, AuditChange<unknown>>,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ error: Error | null }> {
  const queryId = `audit-perm-${targetUserId}-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'permission_change',
    entity_type: 'user',
    entity_id: targetUserId,
    changes: changes,
    table_name: 'profiles',
    ...metadata,
  });

  performanceService.endQueryTimer(queryId, "log_permission_change");

  if (error) {
    loggingService.error("Failed to log permission change", { userId, targetUserId, error }, "AuditService");
  }

  return { error: error || null };
}