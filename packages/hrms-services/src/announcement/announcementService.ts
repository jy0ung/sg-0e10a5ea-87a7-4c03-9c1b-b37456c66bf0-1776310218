import type { Announcement, CreateAnnouncementInput } from '@flc/types';
import { supabase } from '../shared/supabaseClient';

/**
 * Lists company announcements, ordered by pinned-first then recency.
 * Throws on database error.
 */
export async function listAnnouncements(
  companyId: string,
  opts?: { limit?: number },
): Promise<Announcement[]> {
  let q = supabase
    .from('announcements')
    .select('*, profiles(name)')
    .eq('company_id', companyId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
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
    authorName:  (r.profiles as Record<string, unknown> | null)?.name
      ? String((r.profiles as Record<string, unknown>).name)
      : undefined,
    createdAt:   String(r.created_at),
    updatedAt:   String(r.updated_at),
  }));
}

/**
 * Creates a new announcement. Throws on database error.
 */
export async function createAnnouncement(
  companyId: string,
  authorId: string,
  input: CreateAnnouncementInput,
): Promise<void> {
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
  if (error) throw new Error(error.message);
}

/**
 * Deletes an announcement by ID within a company scope.
 * Throws on database error.
 */
export async function deleteAnnouncement(
  id: string,
  companyId: string,
): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
}
