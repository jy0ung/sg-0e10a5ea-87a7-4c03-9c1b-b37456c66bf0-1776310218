// ===== Platform Module =====
export interface PlatformModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'coming_soon' | 'planned';
  path?: string;
}

// ===== Notification =====
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
  userId: string;
}

// ===== Audit =====
export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}
