import { supabase } from "@/integrations/supabase/client";
import { normalizeSupportedDateValue } from "@/lib/dateParsing";
import { publishCanonical } from "@/lib/import-parser";
import { loadBranchMappingLookup, loadPaymentMappingLookup } from "./mappingService";
import { loggingService } from "./loggingService";
import { performanceService } from "./performanceService";
import { logVehicleEdit } from "./auditService";
import { resolveNamesToIds } from "./hrmsService";
import { validateImportBatch } from "./validationService";
import type { ImportBatch, ImportBatchInsert, ValidationError, VehicleRaw } from "@/types";

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
  companyId: string,
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
      .eq("company_id", companyId)
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
      .eq("company_id", companyId)
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
  const queryId = `import-insert-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    if (vehicles.length === 0) {
      return { inserted: 0, errors: [], error: null };
    }

    const sanitizeDate = (value: unknown) => normalizeSupportedDateValue(value) ?? null;
    const [branchLookup, paymentLookup] = await Promise.all([
      loadBranchMappingLookup(companyId),
      loadPaymentMappingLookup(companyId),
    ]);
    const allNames = [...new Set(
      vehicles
        .map(vehicle => typeof vehicle.salesman_name === 'string' ? vehicle.salesman_name.trim() : '')
        .filter(Boolean)
    )];
    const nameToIdMap = await resolveNamesToIds(companyId, allNames);
    const { canonical } = publishCanonical(
      vehicles as VehicleRaw[],
      branchLookup,
      paymentLookup,
      nameToIdMap,
    );

    const dbVehicles = canonical.map((vehicle) => ({
      chassis_no: vehicle.chassis_no,
      bg_date: sanitizeDate(vehicle.bg_date),
      shipment_etd_pkg: sanitizeDate(vehicle.shipment_etd_pkg),
      shipment_eta_kk_twu_sdk: sanitizeDate(vehicle.shipment_eta_kk_twu_sdk),
      date_received_by_outlet: sanitizeDate(vehicle.date_received_by_outlet),
      reg_date: sanitizeDate(vehicle.reg_date),
      delivery_date: sanitizeDate(vehicle.delivery_date),
      disb_date: sanitizeDate(vehicle.disb_date),
      branch_code: vehicle.branch_code,
      model: vehicle.model,
      payment_method: vehicle.payment_method,
      salesman_name: vehicle.salesman_name,
      customer_name: vehicle.customer_name,
      remark: vehicle.remark || null,
      vaa_date: sanitizeDate(vehicle.vaa_date),
      full_payment_date: sanitizeDate(vehicle.full_payment_date),
      is_d2d: vehicle.is_d2d,
      import_batch_id: batchId,
      source_row_id: vehicle.source_row_id,
      variant: vehicle.variant || null,
      dealer_transfer_price: vehicle.dealer_transfer_price || null,
      full_payment_type: vehicle.full_payment_type || null,
      shipment_name: vehicle.shipment_name || null,
      lou: vehicle.lou || null,
      contra_sola: vehicle.contra_sola || null,
      reg_no: vehicle.reg_no || null,
      invoice_no: vehicle.invoice_no || null,
      obr: vehicle.obr || null,
      bg_to_delivery: vehicle.bg_to_delivery ?? null,
      bg_to_shipment_etd: vehicle.bg_to_shipment_etd ?? null,
      etd_to_outlet: vehicle.etd_to_outlet ?? null,
      outlet_to_reg: vehicle.outlet_to_reg ?? null,
      reg_to_delivery: vehicle.reg_to_delivery ?? null,
      bg_to_disb: vehicle.bg_to_disb ?? null,
      delivery_to_disb: vehicle.delivery_to_disb ?? null,
      salesman_id: vehicle.salesman_id ?? null,
      company_id: companyId,
    }));

    const CHUNK_SIZE = 500;
    for (let idx = 0; idx < dbVehicles.length; idx += CHUNK_SIZE) {
      const chunk = dbVehicles.slice(idx, idx + CHUNK_SIZE);
      const { error } = await supabase
        .from("vehicles")
        .upsert(chunk, { onConflict: 'chassis_no,company_id' });
      if (error) {
        loggingService.error("Failed to insert vehicle chunk", { chunk: chunk.length, error }, "ImportService");
        return { inserted: idx, errors: [], error };
      }
    }

    performanceService.endQueryTimer(queryId, "insert_vehicles");

    loggingService.info("Vehicles inserted", { inserted: dbVehicles.length, batchId }, "ImportService");

    return { inserted: dbVehicles.length, errors: [], error: null };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "insert_vehicles");
    loggingService.error("Unexpected error inserting vehicles", { error }, "ImportService");
    return { inserted: 0, errors: [], error: error as Error };
  }
}

/**
 * Phase 2 #18: transactional import commit.
 *
 * Shapes the raw rows into canonical vehicle records, then hands off vehicles +
 * quality issues + batch finalization to the `commit_import_batch` RPC so the
 * three writes succeed or fail together. Returns a shape identical to
 * `validateAndInsertVehicles` so call sites can migrate incrementally.
 */
export async function commitImportBatch(
  rows: VehicleRaw[],
  batchId: string,
  companyId: string,
  qualityIssues: Array<{
    chassisNo: string;
    field: string;
    issueType: string;
    message: string;
    severity: string;
  }>,
  _userId: string,
): Promise<{
  inserted: number;
  qualityIssuesInserted: number;
  error: Error | null;
}> {
  const queryId = `import-commit-${Date.now()}`;
  performanceService.startQueryTimer(queryId);

  try {
    const sanitizeDate = (value: unknown) => normalizeSupportedDateValue(value) ?? null;
    const [branchLookup, paymentLookup] = await Promise.all([
      loadBranchMappingLookup(companyId),
      loadPaymentMappingLookup(companyId),
    ]);
    const allNames = [
      ...new Set(
        rows
          .map((vehicle) =>
            typeof vehicle.salesman_name === "string" ? vehicle.salesman_name.trim() : "",
          )
          .filter(Boolean),
      ),
    ];
    const nameToIdMap = await resolveNamesToIds(companyId, allNames);
    const { canonical } = publishCanonical(rows, branchLookup, paymentLookup, nameToIdMap);

    const dbVehicles = canonical.map((vehicle) => ({
      chassis_no: vehicle.chassis_no,
      bg_date: sanitizeDate(vehicle.bg_date),
      shipment_etd_pkg: sanitizeDate(vehicle.shipment_etd_pkg),
      shipment_eta_kk_twu_sdk: sanitizeDate(vehicle.shipment_eta_kk_twu_sdk),
      date_received_by_outlet: sanitizeDate(vehicle.date_received_by_outlet),
      reg_date: sanitizeDate(vehicle.reg_date),
      delivery_date: sanitizeDate(vehicle.delivery_date),
      disb_date: sanitizeDate(vehicle.disb_date),
      branch_code: vehicle.branch_code,
      model: vehicle.model,
      payment_method: vehicle.payment_method,
      salesman_name: vehicle.salesman_name,
      customer_name: vehicle.customer_name,
      remark: vehicle.remark || null,
      vaa_date: sanitizeDate(vehicle.vaa_date),
      full_payment_date: sanitizeDate(vehicle.full_payment_date),
      is_d2d: vehicle.is_d2d,
      import_batch_id: batchId,
      source_row_id: vehicle.source_row_id,
      variant: vehicle.variant || null,
      dealer_transfer_price: vehicle.dealer_transfer_price || null,
      full_payment_type: vehicle.full_payment_type || null,
      shipment_name: vehicle.shipment_name || null,
      lou: vehicle.lou || null,
      contra_sola: vehicle.contra_sola || null,
      reg_no: vehicle.reg_no || null,
      invoice_no: vehicle.invoice_no || null,
      obr: vehicle.obr || null,
      bg_to_delivery: vehicle.bg_to_delivery ?? null,
      bg_to_shipment_etd: vehicle.bg_to_shipment_etd ?? null,
      etd_to_outlet: vehicle.etd_to_outlet ?? null,
      outlet_to_reg: vehicle.outlet_to_reg ?? null,
      reg_to_delivery: vehicle.reg_to_delivery ?? null,
      bg_to_disb: vehicle.bg_to_disb ?? null,
      delivery_to_disb: vehicle.delivery_to_disb ?? null,
      salesman_id: vehicle.salesman_id ?? null,
      company_id: companyId,
    }));

    const dbIssues = qualityIssues.map((issue) => ({
      chassis_no: issue.chassisNo,
      field: issue.field,
      issue_type: issue.issueType,
      message: issue.message,
      severity: issue.severity,
    }));

    const validRows = dbVehicles.length;
    const errorRows = qualityIssues.filter((i) => i.severity === "error").length;

    const { data, error } = await supabase.rpc("commit_import_batch", {
      p_batch_id: batchId,
      p_vehicles: dbVehicles,
      p_quality_issues: dbIssues,
      p_valid_rows: validRows,
      p_error_rows: errorRows,
    });

    performanceService.endQueryTimer(queryId, "commit_import_batch");

    if (error) {
      loggingService.error(
        "commit_import_batch RPC failed",
        { batchId, error },
        "ImportService",
      );
      return { inserted: 0, qualityIssuesInserted: 0, error };
    }

    const result = (data ?? {}) as {
      vehicles_upserted?: number;
      quality_issues_inserted?: number;
    };

    loggingService.info(
      "Import batch committed transactionally",
      { batchId, result },
      "ImportService",
    );

    return {
      inserted: Number(result.vehicles_upserted ?? 0),
      qualityIssuesInserted: Number(result.quality_issues_inserted ?? 0),
      error: null,
    };
  } catch (error) {
    performanceService.endQueryTimer(queryId, "commit_import_batch");
    loggingService.error(
      "Unexpected error committing import batch",
      { batchId, error },
      "ImportService",
    );
    return { inserted: 0, qualityIssuesInserted: 0, error: error as Error };
  }
}