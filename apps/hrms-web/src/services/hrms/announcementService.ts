import * as pkg from '@flc/hrms-services';
import { logUserAction } from '@/services/auditService';
import { Announcement, CreateAnnouncementInput } from '@/types';

export async function listAnnouncements(
  companyId: string,
  opts?: { limit?: number },
): Promise<{ data: Announcement[]; error: string | null }> {
  try {
    const data = await pkg.listAnnouncements(companyId, opts);
    return { data: data as Announcement[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createAnnouncement(
  companyId: string,
  authorId: string,
  input: CreateAnnouncementInput,
): Promise<{ error: string | null }> {
  try {
    await pkg.createAnnouncement(companyId, authorId, input);
    void logUserAction(authorId, 'create', 'announcement', undefined,
      { title: input.title, category: input.category, priority: input.priority });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteAnnouncement(
  id: string,
  companyId: string,
  actorId?: string,
): Promise<{ error: string | null }> {
  try {
    await pkg.deleteAnnouncement(id, companyId);
    if (actorId) void logUserAction(actorId, 'delete', 'announcement', id);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
