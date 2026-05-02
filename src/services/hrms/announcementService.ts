import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from '@/services/auditService';
import { Announcement, CreateAnnouncementInput } from '@/types';

export async function listAnnouncements(
  companyId: string,
  opts?: { limit?: number },
): Promise<{ data: Announcement[]; error: string | null }> {
  let q = supabase
    .from('announcements')
    .select('*, profiles(name)')
    .eq('company_id', companyId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const mapped: Announcement[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id:          String(r.id),
    companyId:   String(r.company_id),
    title:       String(r.title),
    body:        String(r.body),
    category:    r.category as Announcement['category'],
    priority:    r.priority as Announcement['priority'],
    pinned:      Boolean(r.pinned),
    publishedAt: r.published_at ? String(r.published_at) : undefined,
    expiresAt:   r.expires_at ? String(r.expires_at) : undefined,
    authorId:    r.author_id ? String(r.author_id) : undefined,
    authorName:  (r.profiles as Record<string, unknown> | null)?.name ? String((r.profiles as Record<string, unknown>).name) : undefined,
    createdAt:   String(r.created_at),
    updatedAt:   String(r.updated_at),
  }));
  return { data: mapped, error: null };
}

export async function createAnnouncement(
  companyId: string,
  authorId: string,
  input: CreateAnnouncementInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('announcements').insert({
    company_id:   companyId,
    author_id:    authorId,
    title:        input.title,
    body:         input.body,
    category:     input.category,
    priority:     input.priority,
    pinned:       input.pinned ?? false,
    published_at: input.publishedAt ?? new Date().toISOString(),
    expires_at:   input.expiresAt ?? null,
  });
  if (!error) {
    void logUserAction(authorId, 'create', 'announcement', undefined,
      { title: input.title, category: input.category, priority: input.priority });
  }
  return { error: error?.message ?? null };
}

export async function deleteAnnouncement(id: string, companyId: string, actorId?: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);
  if (!error && actorId) {
    void logUserAction(actorId, 'delete', 'announcement', id);
  }
  return { error: error?.message ?? null };
}
