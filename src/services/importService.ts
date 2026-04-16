import { supabase } from "@/integrations/supabase/client";
import { loggingService } from "./loggingService";
import { performanceService } from "./performanceService";
import { logVehicleEdit } from "./auditService";
import {
  validateVehicleImportBatch,
  validateImportBatch,
} from "./validationService";
import type { ImportBatch, ImportBatchInsert, ValidationError } from "@/types";

export async function createImportBatch(
  batch: ImportBatchInsert,
  userId: string
): Promise<{ data: ImportBatch | null; error: Error | null }> {
  const queryId = `import-create-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    // Validate batch metadata
    const validationResult = await validateImportBatch({
      fileName: batch.fileName,
      companyId: batch.companyId,
      totalRows: batch.totalRows,
      status: batch.status,
    });

    if (!validationResult.isValid) {
      loggingService.error("Import batch validation failed", {
        errors: validationResult.errors,
        batch,
      }, "ImportService");
      return {
        data: null,
        error: new Error(
          `Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`
        ),
      };
    }

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

    await logVehicleEdit(userId, data.id, {
      _create: { before: null, after: data },
    });

    loggingService.info("Import batch created", {
      id: data.id,
      fileName: batch.fileName,
      totalRows: batch.totalRows,
    }, "ImportService");

    return { data, error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "create_import_batch");
    loggingService.error("Unexpected error creating import batch", { batch, error }, "ImportService");
    return { data: null, error: error as Error };
  }
}

export async function updateImportBatch(
  id: string,
  updates: Partial<ImportBatch>,
  userId: string
): Promise<{ data: ImportBatch | null; error: Error | null }> {
  const queryId = `import-update-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
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

export async function validateAndInsertVehicles(
  vehicles: Record<string, unknown>[],
  batchId: string,
  companyId: string,
  userId: string
): Promise<{
  inserted: number;
  errors: ValidationError[];
  error: Error | null;
}> {
  const queryId = `import-validate-insert-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    // Validate all vehicles
    const validationResult = await validateVehicleImportBatch(vehicles, companyId);

    if (!validationResult.isValid) {
      loggingService.error("Vehicle validation failed before insert", {
        errorCount: validationResult.errors.length,
        batchId,
      }, "ImportService");
      return {
        inserted: 0,
        errors: validationResult.errors,
        error: new Error(
          `Validation failed: ${validationResult.errors.slice(0, 5).map(e => e.message).join(', ')}...`
        ),
      };
    }

    // Insert only valid vehicles
    const validVehicles = vehicles.filter((_, idx) => {
      const vehicleErrors = validationResult.errors.filter(e => e.field.includes(`Row ${idx + 1}`));
      return vehicleErrors.length === 0;
    });

    if (validVehicles.length === 0) {
      return {
        inserted: 0,
        errors: validationResult.errors,
        error: null,
      };
    }

    const dbVehicles = validVehicles.map((v, idx) => ({
      chassis_no: v.chassis_no,
      bg_date: v.bg_date,
      shipment_etd_pkg: v.shipment_etd_pkg,
      shipment_eta_kk_twu_sdk: v.shipment_eta_kk_twu_sdk,
      date_received_by_outlet: v.date_received_by_outlet,
      reg_date: v.reg_date,
      delivery_date: v.delivery_date,
      disb_date: v.disb_date,
      branch_code: v.branch_code,
      model: v.model,
      payment_method: v.payment_method,
      salesman_name: v.salesman_name,
      customer_name: v.customer_name,
      remark: v.remark,
      vaa_date: v.vaa_date,
      full_payment_date: v.full_payment_date,
      is_d2d: v.is_d2d || false,
      import_batch_id: batchId,
      source_row_id: v.id,
      variant: v.variant,
      dealer_transfer_price: v.dealer_transfer_price,
      full_payment_type: v.full_payment_type,
      shipment_name: v.shipment_name,
      lou: v.lou,
      contra_sola: v.contra_sola,
      reg_no: v.reg_no,
      invoice_no: v.invoice_no,
      obr: v.obr,
      company_id: companyId,
    }));

    for (let idx = 0; idx < dbVehicles.length; idx += 100) {
      const chunk = dbVehicles.slice(idx, idx + 100);
      const { error } = await supabase.from("vehicles").insert(chunk);
      if (error) {
        loggingService.error("Failed to insert vehicle chunk", { chunk: chunk.length, error }, "ImportService");
        return {
          inserted: idx,
          errors: validationResult.errors,
          error,
        };
      }
    }

    performanceService.endQueryTimer(queryId, "validate_and_insert_vehicles");

    loggingService.info("Vehicles validated and inserted", {
      inserted: dbVehicles.length,
      batchId,
    }, "ImportService");

    return {
      inserted: dbVehicles.length,
      errors: validationResult.errors,
      error: null,
    };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "validate_and_insert_vehicles");
    loggingService.error("Unexpected error validating and inserting vehicles", { error }, "ImportService");
    return {
      inserted: 0,
      errors: [],
      error: error as Error,
    };
  }
}