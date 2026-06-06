import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortalAnnouncementType =
  | 'general'
  | 'process_update'
  | 'reminder'
  | 'policy_note'
  | 'maintenance'
  | 'deadline';

export type PortalAnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';

export type PortalAnnouncementAudience = 'all' | 'admin_approver' | 'requester_staff';

export type PortalAnnouncementStatus = 'draft' | 'published' | 'archived';

export interface PortalAnnouncementRecord {
  id: string;
  company_id: string;
  title: string;
  body: string;
  announcement_type: PortalAnnouncementType;
  priority: PortalAnnouncementPriority;
  audience_scope: PortalAnnouncementAudience;
  status: PortalAnnouncementStatus;
  is_pinned: boolean;
  publish_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface PortalAnnouncementAttachment {
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface CreatePortalAnnouncementInput {
  title: string;
  body: string;
  announcement_type?: PortalAnnouncementType;
  priority?: PortalAnnouncementPriority;
  audience_scope: PortalAnnouncementAudience;
  status: PortalAnnouncementStatus;
  is_pinned: boolean;
  publish_at?: string | null;
  expires_at?: string | null;
}

export interface UpdatePortalAnnouncementInput extends Partial<CreatePortalAnnouncementInput> {
  archived_at?: string | null;
}

export interface AnnouncementServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function announcementsTable() {
  return supabase.from('portal_announcements');
}

const PORTAL_ANNOUNCEMENT_ATTACHMENT_BUCKET = 'portal-announcement-attachments';
const PORTAL_ANNOUNCEMENT_ATTACHMENT_PREFIX = '__PORTAL_ATTACHMENT__';
const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

function sanitizeAttachmentName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encodePortalAttachment(payload: PortalAnnouncementAttachment) {
  return `${PORTAL_ANNOUNCEMENT_ATTACHMENT_PREFIX}${JSON.stringify(payload)}`;
}

export function parsePortalAnnouncementAttachment(body: string): PortalAnnouncementAttachment | null {
  if (!body.startsWith(PORTAL_ANNOUNCEMENT_ATTACHMENT_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(body.slice(PORTAL_ANNOUNCEMENT_ATTACHMENT_PREFIX.length)) as PortalAnnouncementAttachment;
    if (!parsed?.path || !parsed?.name) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function uploadPortalAnnouncementAttachment(
  file: File,
  companyId: string,
  userId: string,
): Promise<AnnouncementServiceResult<string>> {
  try {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
      return {
        data: null,
        error: 'Allowed file types: PDF, PNG, JPG, WEBP, DOC, DOCX.',
      };
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return {
        data: null,
        error: 'Attachment size must be 15MB or below.',
      };
    }

    const filePath = `${companyId}/${userId}/${crypto.randomUUID()}-${sanitizeAttachmentName(file.name)}`;
    const { error } = await supabase.storage
      .from(PORTAL_ANNOUNCEMENT_ATTACHMENT_BUCKET)
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (error) throw error;

    const encoded = encodePortalAttachment({
      name: file.name,
      path: filePath,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    });
    return { data: encoded, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload attachment';
    return { data: null, error: message };
  }
}

export async function getPortalAnnouncementAttachmentUrl(
  record: PortalAnnouncementRecord,
  expiresInSeconds = 60 * 60,
): Promise<AnnouncementServiceResult<string>> {
  const attachment = parsePortalAnnouncementAttachment(record.body);
  if (!attachment) {
    return { data: null, error: 'No attachment found' };
  }

  try {
    const { data, error } = await supabase.storage
      .from(PORTAL_ANNOUNCEMENT_ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.path, expiresInSeconds);
    if (error) throw error;
    return { data: data.signedUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attachment';
    return { data: null, error: message };
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listPortalAnnouncements(
  companyId: string,
): Promise<AnnouncementServiceResult<PortalAnnouncementRecord[]>> {
  try {
    const { data, error } = await announcementsTable()
      .select('*')
      .eq('company_id', companyId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: (data as PortalAnnouncementRecord[]) ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load announcements';
    return { data: [], error: message };
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createPortalAnnouncement(
  companyId: string,
  createdBy: string,
  input: CreatePortalAnnouncementInput,
): Promise<AnnouncementServiceResult<PortalAnnouncementRecord>> {
  try {
    const { data, error } = await announcementsTable()
      .insert({
        company_id: companyId,
        created_by: createdBy,
        updated_by: createdBy,
        ...input,
        announcement_type: input.announcement_type ?? 'general',
        priority: input.priority ?? 'normal',
        publish_at: input.publish_at ?? new Date().toISOString(),
        expires_at: input.expires_at ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data as PortalAnnouncementRecord, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create announcement';
    return { data: null, error: message };
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updatePortalAnnouncement(
  id: string,
  companyId: string,
  updatedBy: string,
  input: UpdatePortalAnnouncementInput,
): Promise<AnnouncementServiceResult<PortalAnnouncementRecord>> {
  try {
    const { data, error } = await announcementsTable()
      .update({ ...input, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as PortalAnnouncementRecord, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update announcement';
    return { data: null, error: message };
  }
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archivePortalAnnouncement(
  id: string,
  companyId: string,
  updatedBy: string,
): Promise<AnnouncementServiceResult<null>> {
  try {
    const { error } = await announcementsTable()
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;
    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to archive announcement';
    return { data: null, error: message };
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deletePortalAnnouncement(
  id: string,
  companyId: string,
): Promise<AnnouncementServiceResult<null>> {
  try {
    const { error } = await announcementsTable()
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;
    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete announcement';
    return { data: null, error: message };
  }
}
