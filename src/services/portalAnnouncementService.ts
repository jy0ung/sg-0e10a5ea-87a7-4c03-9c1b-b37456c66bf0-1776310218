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

export interface CreatePortalAnnouncementInput {
  title: string;
  body: string;
  announcement_type: PortalAnnouncementType;
  priority: PortalAnnouncementPriority;
  audience_scope: PortalAnnouncementAudience;
  status: PortalAnnouncementStatus;
  is_pinned: boolean;
  publish_at: string | null;
  expires_at: string | null;
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
