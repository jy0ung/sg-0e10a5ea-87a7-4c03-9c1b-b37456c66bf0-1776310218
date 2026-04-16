import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { performanceService } from "./performanceService";
import { loggingService } from "./loggingService";

export type AuditLog = Tables<"audit_logs">;

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

export type UserActionType = 
  | "view" 
  | "create" 
  | "update" 
  | "delete" 
  | "export" 
  | "import" 
  | "login" 
  | "logout" 
  | "permission_change"
  | "search"
  | "filter"
  | "sort"
  | "navigate"
  | "download"
  | "share";

export interface UserActionMetadata {
  page?: string;
  component?: string;
  route?: string;
  referrer?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;
  itemCount?: number;
  searchQuery?: string;
  filterParams?: Record<string, unknown>;
}

export async function logUserAction(
  userId: string,
  actionType: UserActionType,
  entityType: string,
  entityId?: string,
  metadata?: UserActionMetadata
): Promise<{ error: Error | null }> {
  const queryId = `user-action-${actionType}-${entityId || 'none'}-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    const { error } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action: actionType,
      entity_type: entityType,
      entity_id: entityId || null,
      changes: metadata || {},
      table_name: "user_actions",
    });

    performanceService.endQueryTimer(queryId, "log_user_action");

    if (error) {
      loggingService.error("Failed to log user action", { userId, actionType, error }, "AuditService");
    }

    return { error: error || null };
  } catch (err) {
    performanceService.endQueryTimer(queryId, "log_user_action_failed");
    const error = err instanceof Error ? err : new Error(String(err));
    loggingService.error("Unexpected error logging user action", { userId, actionType, error }, "AuditService");
    return { error };
  }
}

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

  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "update",
    entity_type: "vehicle",
    entity_id: vehicleId,
    changes: changes as Record<string, unknown>,
    table_name: "vehicles",
    ...metadata,
  });

  performanceService.endQueryTimer(queryId, "log_vehicle_edit");

  if (error) {
    loggingService.error("Failed to log vehicle edit", { userId, vehicleId, error }, "AuditService");
  }

  return { error: error || null };
}

export async function getAuditLog(
  vehicleId: string,
  limit: number = 100
): Promise<{ data: AuditLogWithProfile[] | null; error: Error | null }> {
  const queryId = `audit-get-vehicle-${vehicleId}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name, email, role)")
    .eq("entity_id", vehicleId)
    .eq("entity_type", "vehicle")
    .order("created_at", { ascending: false })
    .limit(limit);

  performanceService.endQueryTimer(queryId, "get_audit_log_vehicle");

  if (error) {
    loggingService.error("Failed to get audit log", { vehicleId, error }, "AuditService");
  }

  return { data, error: error || null };
}

export async function getUserAuditLogs(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<{ data: AuditLog[] | null; error: Error | null }> {
  const queryId = `audit-get-user-${userId}`;
  performanceService.startQueryTimer(queryId);

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  performanceService.endQueryTimer(queryId, "get_user_audit_logs");

  if (error) {
    loggingService.error("Failed to get user audit logs", { userId, error }, "AuditService");
  }

  return { data, error: error || null };
}

export async function getUserActionHistory(
  userId: string,
  filters?: {
    actionType?: UserActionType;
    entityType?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: AuditLog[] | null; error: Error | null; count?: number }> {
  const queryId = `user-action-history-${userId}-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("table_name", "user_actions")
    .order("created_at", { ascending: false });

  if (filters?.actionType) {
    query = query.eq("action", filters.actionType);
  }

  if (filters?.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }

  if (filters?.fromDate) {
    query = query.gte("created_at", filters.fromDate.toISOString());
  }

  if (filters?.toDate) {
    query = query.lte("created_at", filters.toDate.toISOString());
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  performanceService.endQueryTimer(queryId, "get_user_action_history");

  if (error) {
    loggingService.error("Failed to get user action history", { userId, filters, error }, "AuditService");
  }

  return { data, error: error || null, count };
}

export async function getAllAuditLogs(
  limit: number = 100,
  offset: number = 0,
  filters?: {
    entityType?: string;
    userId?: string;
    action?: string;
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
    .from("audit_logs")
    .select("*, profiles(full_name, email, role)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }

  if (filters?.userId) {
    query = query.eq("user_id", filters.userId);
  }

  if (filters?.action) {
    query = query.eq("action", filters.action);
  }

  if (filters?.fromDate) {
    query = query.gte("created_at", filters.fromDate.toISOString());
  }

  if (filters?.toDate) {
    query = query.lte("created_at", filters.toDate.toISOString());
  }

  const { data, error, count } = await query;

  performanceService.endQueryTimer(queryId, "get_all_audit_logs");

  if (error) {
    loggingService.error("Failed to get all audit logs", { filters, error }, "AuditService");
  }

  return { data, error: error || null, count };
}

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

  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "permission_change",
    entity_type: "user",
    entity_id: targetUserId,
    changes: changes,
    table_name: "profiles",
    ...metadata,
  });

  performanceService.endQueryTimer(queryId, "log_permission_change");

  if (error) {
    loggingService.error("Failed to log permission change", { userId, targetUserId, error }, "AuditService");
  }

  return { error: error || null };
}

// Create a React Hook for automatic action logging
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function useActionLogger(
  entityType: string,
  entityId?: string,
  component?: string
) {
  const { user } = useAuth();
  const mountTimeRef = useRef<number>(Date.now());
  const previousEntityIdRef = useRef<string | undefined>(entityId);

  useEffect(() => {
    if (!user?.id) return;

    // Log view action when component mounts or entity changes
    if (previousEntityIdRef.current !== entityId) {
      logUserAction(user.id, "view", entityType, entityId, {
        page: window.location.pathname,
        component: component,
        route: window.location.pathname,
        referrer: document.referrer,
      });
      
      previousEntityIdRef.current = entityId;
    }
  }, [user?.id, entityType, entityId, component]);

  useEffect(() => {
    // Log navigation/exit action when component unmounts
    const mountTime = mountTimeRef.current;
    return () => {
      if (!user?.id) return;

      const duration = Date.now() - mountTime;
      
      logUserAction(user.id, "navigate", entityType, entityId, {
        page: window.location.pathname,
        component: component,
        route: window.location.pathname,
        duration,
      }).catch((err) => {
        // Silently fail during unmount
        loggingService.warn('Failed to log navigate action', { error: err }, 'AuditService');
      });
    };
  }, [user?.id, entityType, entityId, component]);

  const logAction = async (actionType: UserActionType, metadata?: Partial<UserActionMetadata>) => {
    if (!user?.id) {
      loggingService.warn("Cannot log action: User not authenticated", {}, "AuditService");
      return;
    }

    return logUserAction(user.id, actionType, entityType, entityId, {
      page: window.location.pathname,
      component: component,
      route: window.location.pathname,
      ...metadata,
    });
  };

  return { logAction };
}