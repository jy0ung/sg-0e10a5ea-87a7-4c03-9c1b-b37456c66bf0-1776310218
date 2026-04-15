<![CDATA[
import { supabase } from "@/integrations/supabase/client";
import { loggingService } from "./loggingService";
import { performanceService } from "./performanceService";
import { logVehicleEdit } from "./auditService";
import type { ImportBatch } from "@/types";

export interface ImportBatchInsert {
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  companyId: string;
}

/**
 * Create a new import batch with audit logging
 */
export async function createImportBatch(
  batch: ImportBatchInsert,
  userId: string
): Promise<{ data: ImportBatch | null; error: Error | null }> {
  const queryId = `import-create-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    const { data, error } = await supabase
      .from("import_batches")
      .insert({
        file_name: batch.fileName,
        uploaded_by: batch.uploadedBy,
        uploaded_at: batch.uploadedAt,
        status: batch.status,
        total_rows: batch.totalRows,
        valid_rows: batch.validRows,
        error_rows: batch.errorRows,
        duplicate_rows: batch.duplicateRows,
        company_id: batch.companyId,
      })
      .select()
      .single();

    performanceService.endQueryTimer(queryId, "create_import_batch");

    if (error) {
      loggingService.error("Failed to create import batch", { batch, error }, "ImportService");
      return { data: null, error };
    }

    // Log audit
    await logVehicleEdit(userId, data.id, {
      _create: { before: null, after: data },
    });

    loggingService.info("Import batch created", {
      id: data.id,
      fileName: batch.fileName,
      totalRows: batch.totalRows,
    }, "ImportService");

    return { data: error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "create_import_batch");
    loggingService.error("Unexpected error creating import batch", { batch, error }, "ImportService");
    return { data: null, error: error as Error };
  }
}

/**
 * Update import batch status with audit logging
 */
export async function updateImportBatch(
  id: string,
  updates: Partial<ImportBatch>,
  userId: string
): Promise<{ data: ImportBatch | null; error: Error | null }> {
  const queryId = `import-update-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    // Fetch current values
    const { data: current, error: fetchError } = await supabase
      .from("import_batches")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      loggingService.error("Failed to fetch current import batch", { id, error: fetchError }, "ImportService");
      return { data: null, error: fetchError };
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.publishedAt) dbUpdates.published_at = updates.publishedAt;
    if (updates.totalRows !== undefined) dbUpdates.total_rows = updates.totalRows;
    if (updates.validRows !== undefined) dbUpdates.valid_rows = updates.validRows;
    if (updates.errorRows !== undefined) dbUpdates.error_rows = updates.errorRows;

    const { data, error } = await supabase
      .from("import_batches")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    performanceService.endQueryTimer(queryId, "update_import_batch");

    if (error) {
      loggingService.error("Failed to update import batch", { id, error }, "ImportService");
      return { data: null, error };
    }

    // Log audit if changes exist
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    Object.keys(dbUpdates).forEach((key) => {
      const currentVal = current[key as keyof ImportBatch];
      const newVal = dbUpdates[key];
      if (currentVal !== newVal) {
        changes[key] = { before: currentVal, after: newVal };
      }
    });

    if (Object.keys(changes).length > 0) {
      await logVehicleEdit(userId, id, changes);
      loggingService.info("Import batch updated", { id, changes }, "ImportService");
    }

    return { data, error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "update_import_batch");
    loggingService.error("Unexpected error updating import batch", { id, error }, "ImportService");
    return { data: null, error: error as Error };
  }
}

/**
 * Log quality issues for import
 */
export async function logQualityIssues(
  issues: Array<{
    chassisNo: string;
    field: string;
    issueType: string;
    message: string;
    severity: string;
    importBatchId: string;
    companyId: string;
  }>
): Promise<{ error: Error | null }> {
  if (issues.length === 0) return { error: null };

  const queryId = `quality-issues-insert-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    const dbIssues = issues.map((issue) => ({
      chassis_no: issue.chassisNo,
      field: issue.field,
      issue_type: issue.issueType,
      message: issue.message,
      severity: issue.severity,
      import_batch_id: issue.importBatchId,
      company_id: issue.companyId,
    }));

    // Insert in chunks
    for (let idx = 0; idx < dbIssues.length; idx += 500) {
      const chunk = dbIssues.slice(idx, idx + 500);
      const { error } = await supabase.from("quality_issues").insert(chunk);
      if (error) {
        loggingService.error("Failed to insert quality issues", { chunk: chunk.length, error }, "ImportService");
        return { error };
      }
    }

    performanceService.endQueryTimer(queryId, "insert_quality_issues");
    loggingService.info("Quality issues logged", { count: issues.length }, "ImportService");

    return { error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "insert_quality_issues");
    loggingService.error("Unexpected error logging quality issues", { error }, "ImportService");
    return { error: error as Error };
  }
}
]]>

[Tool result trimmed: kept first 100 chars and last 100 chars of 6892 chars.]