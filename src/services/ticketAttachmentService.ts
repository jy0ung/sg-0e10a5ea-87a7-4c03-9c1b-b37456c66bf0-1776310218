import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachmentSettings {
  max_file_size_mb: number;
  max_files_per_ticket: number;
}

export const DEFAULT_ATTACHMENT_SETTINGS: AttachmentSettings = {
  max_file_size_mb: 3,
  max_files_per_ticket: 3,
};

export interface TicketAttachmentRecord {
  id: string;
  ticket_id: string;
  company_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
}

export interface AttachmentServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function settingsTable() {
  return supabase.from('request_attachment_settings' as never);
}

function attachmentsTable() {
  return supabase.from('ticket_attachments' as never);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getAttachmentSettings(
  companyId: string,
): Promise<AttachmentServiceResult<AttachmentSettings>> {
  try {
    const { data, error } = await settingsTable()
      .select('max_file_size_mb, max_files_per_ticket')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw error;
    return {
      data: (data as AttachmentSettings | null) ?? DEFAULT_ATTACHMENT_SETTINGS,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attachment settings';
    return { data: DEFAULT_ATTACHMENT_SETTINGS, error: message };
  }
}

export async function upsertAttachmentSettings(
  companyId: string,
  settings: AttachmentSettings,
  updatedBy: string,
): Promise<AttachmentServiceResult<AttachmentSettings>> {
  try {
    const { data, error } = await settingsTable()
      .upsert(
        {
          company_id: companyId,
          max_file_size_mb: settings.max_file_size_mb,
          max_files_per_ticket: settings.max_files_per_ticket,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      )
      .select('max_file_size_mb, max_files_per_ticket')
      .single();

    if (error) throw error;
    return { data: data as AttachmentSettings, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save attachment settings';
    return { data: null, error: message };
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadTicketAttachment(
  file: File,
  ticketId: string,
  companyId: string,
  uploadedBy: string,
): Promise<AttachmentServiceResult<TicketAttachmentRecord>> {
  // Build a unique storage path: {companyId}/{ticketId}/{uuid}-{sanitisedName}
  const uuid = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${companyId}/${ticketId}/${uuid}-${safeName}`;

  try {
    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('ticket-attachments')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // 2. Record in ticket_attachments table
    const { data, error: insertError } = await attachmentsTable()
      .insert({
        ticket_id: ticketId,
        company_id: companyId,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        uploaded_by: uploadedBy,
      })
      .select()
      .single();

    if (insertError) {
      // Clean up the orphaned storage object
      await supabase.storage.from('ticket-attachments').remove([storagePath]);
      throw insertError;
    }

    return { data: data as TicketAttachmentRecord, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload attachment';
    return { data: null, error: message };
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listTicketAttachments(
  ticketId: string,
  companyId: string,
): Promise<AttachmentServiceResult<TicketAttachmentRecord[]>> {
  try {
    const { data, error } = await attachmentsTable()
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data: (data as TicketAttachmentRecord[]) ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attachments';
    return { data: [], error: message };
  }
}

// ── Get signed URL for download ───────────────────────────────────────────────

export async function getAttachmentSignedUrl(
  filePath: string,
  expiresInSeconds = 3600,
): Promise<AttachmentServiceResult<string>> {
  try {
    const { data, error } = await supabase.storage
      .from('ticket-attachments')
      .createSignedUrl(filePath, expiresInSeconds);

    if (error) throw error;
    return { data: data.signedUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate download link';
    return { data: null, error: message };
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteTicketAttachment(
  attachmentId: string,
  filePath: string,
  companyId: string,
): Promise<AttachmentServiceResult<true>> {
  try {
    // Delete storage object first
    const { error: storageError } = await supabase.storage
      .from('ticket-attachments')
      .remove([filePath]);
    if (storageError) throw storageError;

    // Delete DB record
    const { error: dbError } = await attachmentsTable()
      .delete()
      .eq('id', attachmentId)
      .eq('company_id', companyId);
    if (dbError) throw dbError;

    return { data: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete attachment';
    return { data: null, error: message };
  }
}
