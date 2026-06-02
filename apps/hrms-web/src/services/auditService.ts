import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  logUserAction,
  loggingService,
  type UserActionMetadata,
  type UserActionType,
} from "@flc/platform-services";

export {
  getAllAuditLogs,
  getAuditLog,
  getUserActionHistory,
  getUserAuditLogs,
  logPermissionChange,
  logUserAction,
  logVehicleEdit,
} from "@flc/platform-services";
export type {
  AuditChange,
  AuditLog,
  AuditLogWithProfile,
  UserActionMetadata,
  UserActionType,
} from "@flc/platform-services";

export function useActionLogger(
  entityType: string,
  entityId?: string,
  component?: string,
) {
  const { user } = useAuth();
  const mountTimeRef = useRef<number>(Date.now());
  const previousEntityIdRef = useRef<string | undefined>(entityId);

  useEffect(() => {
    if (!user?.id) return;

    if (previousEntityIdRef.current !== entityId) {
      void logUserAction(user.id, "view", entityType, entityId, {
        page: window.location.pathname,
        component,
        route: window.location.pathname,
        referrer: document.referrer,
      });

      previousEntityIdRef.current = entityId;
    }
  }, [user?.id, entityType, entityId, component]);

  useEffect(() => {
    const mountTime = mountTimeRef.current;
    return () => {
      if (!user?.id) return;

      const duration = Date.now() - mountTime;

      logUserAction(user.id, "navigate", entityType, entityId, {
        page: window.location.pathname,
        component,
        route: window.location.pathname,
        duration,
      }).catch((err) => {
        loggingService.warn("Failed to log navigate action", { error: err }, "AuditService");
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
      component,
      route: window.location.pathname,
      ...metadata,
    });
  };

  return { logAction };
}
