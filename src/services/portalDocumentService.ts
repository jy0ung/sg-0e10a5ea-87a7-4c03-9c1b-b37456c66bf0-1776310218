import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortalDocumentCategory =
  | 'form'
  | 'template'
  | 'sop'
  | 'guideline'
  | 'checklist'
  | 'policy'
  | 'general';

export type PortalDocumentStatus = 'active' | 'inactive' | 'archived';

export type PortalDocumentVisibility = 'all' | 'admin_approver' | 'requester_staff';

export interface PortalDocumentRecord {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: PortalDocumentCategory;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  version: string;
  effective_date: string | null;
  expires_at: string | null;
  is_pinned: boolean;
  status: PortalDocumentStatus;
  visibility_scope: PortalDocumentVisibility;
  uploaded_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CreatePortalDocumentInput {
  title: string;
  description: string | null;
  category: PortalDocumentCategory;
  version: string;
  effective_date: string | null;
  expires_at: string | null;
  is_pinned: boolean;
  status: PortalDocumentStatus;
  visibility_scope: PortalDocumentVisibility;
}

export interface UpdatePortalDocumentInput extends Partial<CreatePortalDocumentInput> {
  archived_at?: string | null;
}

export interface DocumentServiceResult<T> {
  data: T | null;
  error: string | null;
}

const STORAGE_BUCKET = 'portal-documents';

// ── Helpers ───────────────────────────────────────────────────────────────────

function documentsTable() {
  return supabase.from('portal_documents');
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listPortalDocuments(
  companyId: string,
): Promise<DocumentServiceResult<PortalDocumentRecord[]>> {
  try {
    const { data, error } = await documentsTable()
      .select('*')
      .eq('company_id', companyId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: (data as PortalDocumentRecord[]) ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load documents';
    return { data: [], error: message };
  }
}

// ── Upload + Create ───────────────────────────────────────────────────────────

export async function uploadPortalDocument(
  file: File,
  companyId: string,
  uploadedBy: string,
  input: CreatePortalDocumentInput,
): Promise<DocumentServiceResult<PortalDocumentRecord>> {
  const uuid = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${companyId}/documents/${uuid}-${safeName}`;

  try {
    // 1. Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // 2. Insert record with file metadata
    const { data, error: insertError } = await documentsTable()
      .insert({
        company_id: companyId,
        uploaded_by: uploadedBy,
        updated_by: uploadedBy,
        file_path: storagePath,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        ...input,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up orphaned storage object
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw insertError;
    }

    return { data: data as PortalDocumentRecord, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload document';
    return { data: null, error: message };
  }
}

// ── Update metadata ───────────────────────────────────────────────────────────

export async function updatePortalDocument(
  id: string,
  companyId: string,
  updatedBy: string,
  input: UpdatePortalDocumentInput,
): Promise<DocumentServiceResult<PortalDocumentRecord>> {
  try {
    const { data, error } = await documentsTable()
      .update({ ...input, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as PortalDocumentRecord, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update document';
    return { data: null, error: message };
  }
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archivePortalDocument(
  id: string,
  companyId: string,
  updatedBy: string,
): Promise<DocumentServiceResult<null>> {
  try {
    const { error } = await documentsTable()
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
    const message = err instanceof Error ? err.message : 'Failed to archive document';
    return { data: null, error: message };
  }
}

// ── Delete (metadata + storage) ───────────────────────────────────────────────

export async function deletePortalDocument(
  id: string,
  companyId: string,
  filePath: string | null,
): Promise<DocumentServiceResult<null>> {
  try {
    // Remove DB record first
    const { error } = await documentsTable()
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    // Best-effort remove storage object
    if (filePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    }

    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete document';
    return { data: null, error: message };
  }
}

// ── Get signed download URL ───────────────────────────────────────────────────

/**
 * In-memory cache for signed download URLs. Previously every download click
 * round-tripped to storage.createSignedUrl, which is the more expensive of
 * the two storage operations — multiple clicks on the same file (re-download,
 * preview, share) blew through the bandwidth budget on portal-heavy tenants.
 *
 * Keyed by `${filePath}:${expiresInSeconds}` so distinct callers requesting
 * different TTLs don't trample each other. Cleared 60s before the server-side
 * expiry so we never return an about-to-expire URL.
 */
interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}
const signedUrlCache = new Map<string, CachedSignedUrl>();
const SIGNED_URL_SAFETY_MARGIN_MS = 60 * 1000;

/** Test helper: drop everything so a fresh fetch happens next call. */
export function clearPortalDocumentSignedUrlCache(): void {
  signedUrlCache.clear();
}

export async function getPortalDocumentSignedUrl(
  filePath: string,
  expiresInSeconds = 3600,
): Promise<DocumentServiceResult<string>> {
  const cacheKey = `${filePath}:${expiresInSeconds}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.url, error: null };
  }
  // Stale entry — drop it before the refetch so a transient failure doesn't
  // leave a broken URL in the map.
  if (cached) signedUrlCache.delete(cacheKey);

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error) throw error;
    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + expiresInSeconds * 1000 - SIGNED_URL_SAFETY_MARGIN_MS,
    });
    return { data: data.signedUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate download link';
    return { data: null, error: message };
  }
}
