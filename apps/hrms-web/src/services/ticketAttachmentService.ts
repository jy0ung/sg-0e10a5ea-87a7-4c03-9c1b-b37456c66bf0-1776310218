// Re-export shim — implementation lives in @flc/platform-services.
// Kept so existing '@/services/ticketAttachmentService' import paths continue to work.
export {
  DEFAULT_ATTACHMENT_SETTINGS,
  getAttachmentSettings,
  upsertAttachmentSettings,
  uploadTicketAttachment,
  listTicketAttachments,
  listAttachmentsForTickets,
  getAttachmentSignedUrl,
  deleteTicketAttachment,
} from '@flc/platform-services';
export type { AttachmentSettings, TicketAttachmentRecord, AttachmentServiceResult } from '@flc/platform-services';
