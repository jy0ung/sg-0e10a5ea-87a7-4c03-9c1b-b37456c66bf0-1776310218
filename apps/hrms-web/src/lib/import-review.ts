import type { DataQualityIssue, ImportReviewReason, ValidationError, VehicleRaw } from '@/types';

export interface ImportReviewRowInsertInput {
  importBatchId: string;
  companyId: string;
  rowNumber: number;
  sourceRowId?: string;
  chassisNo?: string;
  branchCode?: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  validationErrors: ValidationError[];
  reviewReason: ImportReviewReason;
}

const HARD_BLOCKER_CODES = new Set(['DUPLICATE_CHASSIS', 'CHASSIS_TOO_SHORT', 'INVALID_DATE_FORMAT', 'INVALID_NUMBER']);
const HARD_BLOCKER_FIELDS = new Set(['chassis_no']);

function toRowNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function previewIssueToValidationError(issue: DataQualityIssue): ValidationError {
  return {
    field: issue.field,
    message: issue.message,
    code: issue.issueType.toUpperCase(),
    severity: issue.severity,
    rowNumber: issue.rowNumber,
  };
}

function isBlockingValidationError(error: ValidationError): boolean {
  return HARD_BLOCKER_CODES.has(error.code)
    || (error.code === 'REQUIRED_FIELD_MISSING' && HARD_BLOCKER_FIELDS.has(error.field));
}

function getReviewReason(validationErrors: ValidationError[], previewErrors: DataQualityIssue[]): ImportReviewReason {
  const hasBlockingErrors = previewErrors.length > 0 || validationErrors.some(isBlockingValidationError);
  const hasIncompleteErrors = validationErrors.some(error => !isBlockingValidationError(error));

  if (hasBlockingErrors && hasIncompleteErrors) {
    return 'mixed';
  }

  return hasBlockingErrors ? 'blocking' : 'incomplete';
}

export function splitImportRowsForPublish(
  baseRows: VehicleRaw[],
  mergedRows: VehicleRaw[],
  previewIssues: DataQualityIssue[],
  validationErrors: ValidationError[],
  importBatchId: string,
  companyId: string,
): { cleanRows: VehicleRaw[]; reviewRows: ImportReviewRowInsertInput[] } {
  const baseRowsById = new Map(baseRows.map(row => [row.id, row]));
  const previewErrorsByRowNumber = new Map<number, DataQualityIssue[]>();
  const validationErrorsByRowNumber = new Map<number, ValidationError[]>();

  previewIssues.forEach(issue => {
    if (issue.severity !== 'error' || typeof issue.rowNumber !== 'number') {
      return;
    }

    const existing = previewErrorsByRowNumber.get(issue.rowNumber) ?? [];
    existing.push(issue);
    previewErrorsByRowNumber.set(issue.rowNumber, existing);
  });

  validationErrors.forEach(error => {
    if (typeof error.rowNumber !== 'number') {
      return;
    }

    const existing = validationErrorsByRowNumber.get(error.rowNumber) ?? [];
    existing.push(error);
    validationErrorsByRowNumber.set(error.rowNumber, existing);
  });

  const cleanRows: VehicleRaw[] = [];
  const reviewRows: ImportReviewRowInsertInput[] = [];

  mergedRows.forEach((row, index) => {
    const sourceRowNumber = toRowNumber(row.row_number);
    const importRowNumber = index + 1;
    const rowPreviewErrors = [
      ...(sourceRowNumber !== null ? previewErrorsByRowNumber.get(sourceRowNumber) ?? [] : []),
      ...(sourceRowNumber !== importRowNumber ? previewErrorsByRowNumber.get(importRowNumber) ?? [] : []),
    ];
    const rowValidationErrors = [
      ...(sourceRowNumber !== null ? validationErrorsByRowNumber.get(sourceRowNumber) ?? [] : []),
      ...(sourceRowNumber !== importRowNumber ? validationErrorsByRowNumber.get(importRowNumber) ?? [] : []),
    ];

    if (rowPreviewErrors.length === 0 && rowValidationErrors.length === 0) {
      cleanRows.push(row);
      return;
    }

    const baseRow = baseRowsById.get(row.id) ?? row;

    reviewRows.push({
      importBatchId,
      companyId,
      rowNumber: row.row_number,
      sourceRowId: row.id,
      chassisNo: row.chassis_no,
      branchCode: row.branch_code,
      rawPayload: baseRow as unknown as Record<string, unknown>,
      normalizedPayload: row as unknown as Record<string, unknown>,
      validationErrors: [
        ...rowValidationErrors,
        ...rowPreviewErrors.map(previewIssueToValidationError),
      ],
      reviewReason: getReviewReason(rowValidationErrors, rowPreviewErrors),
    });
  });

  return { cleanRows, reviewRows };
}
