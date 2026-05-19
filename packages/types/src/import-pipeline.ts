// ===== Import Pipeline =====
export type ImportStatus =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'normalization_in_progress'
  | 'normalization_complete'
  | 'publish_in_progress'
  | 'published'
  | 'published_with_review'
  | 'review_pending'
  | 'review_in_progress'
  | 'review_complete'
  | 'failed';

export interface ImportBatch {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  publishedRows?: number;
  reviewRows?: number;
  reviewCompletedAt?: string;
  publishedAt?: string;
}

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
  publishedRows?: number;
  reviewRows?: number;
  reviewCompletedAt?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
  rowNumber?: number;
}

export type ImportReviewStatus = 'pending' | 'in_review' | 'resolved' | 'discarded';
export type ImportReviewReason = 'incomplete' | 'blocking' | 'mixed';

export interface ImportReviewRow {
  id: string;
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
  reviewStatus: ImportReviewStatus;
  assignedTo?: string | null;
  resolvedVehicleId?: string | null;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
