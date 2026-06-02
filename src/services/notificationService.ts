// Re-export shim — implementation lives in @flc/platform-services.
// Kept so existing '@/services/notificationService' import paths continue to work.
export { createNotifications, getNotifications, markAsRead, markAllAsRead } from '@flc/platform-services';
export type { NotificationRow, CreateNotificationInput } from '@flc/platform-services';
