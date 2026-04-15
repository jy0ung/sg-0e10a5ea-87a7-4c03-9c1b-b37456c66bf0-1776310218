import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

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
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'update',
    entity_type: 'vehicle',
    entity_id: vehicleId,
    changes: changes as Record<string, unknown>,
    table_name: 'vehicles',
    ...metadata,
  });

  if (error) {
    console.error('Error logging vehicle edit:', error);
  }

  return { error: error || null };
}

/**
 * Get audit log for a specific vehicle
 */
export async function getAuditLog(
  vehicleId: string,
  limit: number = 100
): Promise<{ data: AuditLogWithProfile[] | null; error: any }> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, profiles(full_name, email, role)')
    .eq('entity_id', vehicleId)
    .eq('entity_type', 'vehicle')
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: AuditLog[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

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
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'permission_change',
    entity_type: 'user',
    entity_id: targetUserId,
    changes: changes,
    table_name: 'profiles',
    ...metadata,
  });

  if (error) {
    console.error('Error logging permission change:', error);
  }

  return { error: error || null };
}