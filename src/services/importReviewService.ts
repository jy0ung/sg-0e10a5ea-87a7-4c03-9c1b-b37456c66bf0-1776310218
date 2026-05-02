import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';
import type { ImportReviewReason, ImportReviewRow, ImportReviewStatus, ValidationError } from '@/types';

function mapValidationErrors(raw: unknown): ValidationError[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const value = entry as Record<string, unknown>;
      return {
        field: String(value.field ?? ''),
        message: String(value.message ?? ''),
        code: String(value.code ?? ''),
        severity: value.severity === 'warning' ? 'warning' : 'error',
        rowNumber: typeof value.rowNumber === 'number' ? value.rowNumber : undefined,
      } satisfies ValidationError;
    })
    .filter((value): value is ValidationError => Boolean(value));
}

function mapImportReviewRow(row: Record<string, unknown>): ImportReviewRow {
  return {
    id: String(row.id ?? ''),
    importBatchId: String(row.import_batch_id ?? ''),
    companyId: String(row.company_id ?? ''),
    rowNumber: Number(row.row_number ?? 0),
    sourceRowId: row.source_row_id ? String(row.source_row_id) : undefined,
    chassisNo: row.chassis_no ? String(row.chassis_no) : undefined,
    branchCode: row.branch_code ? String(row.branch_code) : undefined,
    rawPayload: (row.raw_payload as Record<string, unknown>) ?? {},
    normalizedPayload: row.normalized_payload ? (row.normalized_payload as Record<string, unknown>) : undefined,
    validationErrors: mapValidationErrors(row.validation_errors),
    reviewReason: String(row.review_reason ?? 'blocking') as ImportReviewReason,
    reviewStatus: String(row.review_status ?? 'pending') as ImportReviewStatus,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    resolvedVehicleId: row.resolved_vehicle_id ? String(row.resolved_vehicle_id) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function getImportReviewRows(batchId: string, companyId: string): Promise<ImportReviewRow[]> {
  const { data, error } = await supabase
    .from('import_review_rows')
    .select('*')
    .eq('company_id', companyId)
    .eq('import_batch_id', batchId)
    .order('row_number', { ascending: true });

  if (error) {
    loggingService.error('Failed to load import review rows', { batchId, companyId, error }, 'ImportReviewService');
    return [];
  }

  return (data ?? []).map((row) => mapImportReviewRow(row as unknown as Record<string, unknown>));
}

export async function reviewRow(
  id: string,
  status: ImportReviewStatus,
  opts?: { comment?: string; reviewedBy?: string },
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    review_status: status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'resolved' || status === 'discarded') {
    payload.resolved_at = new Date().toISOString();
  }
  if (opts?.reviewedBy) {
    payload.assigned_to = opts.reviewedBy;
  }

  const { error } = await supabase
    .from('import_review_rows')
    .update(payload)
    .eq('id', id);

  if (error) {
    loggingService.error('Failed to review import row', { id, status, error }, 'ImportReviewService');
    return { error: error.message };
  }

  return { error: null };
}