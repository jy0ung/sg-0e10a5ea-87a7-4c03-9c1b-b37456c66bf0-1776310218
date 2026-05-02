import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ExcelTable, type TableColumn } from '@/components/shared/ExcelTable';
import { ValidationSummaryModal } from '@/components/shared/ValidationSummaryModal';
import { useData } from '@/contexts/DataContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, AlertCircle, Info, PlusCircle } from 'lucide-react';
import { parseWorkbook, publishCanonical } from '@/lib/import-parser';
import { splitImportRowsForPublish } from '@/lib/import-review';
import { loadBranchMappingLookup, loadPaymentMappingLookup, createBranchMapping } from '@/services/mappingService';
import { validateVehicleImportBatch } from '@/services/validationService';
import { createImportBatch, insertImportReviewRows, validateAndInsertVehicles } from '@/services/importService';
import { resolveNamesToIds } from '@/services/hrmsService';
import type { DataQualityIssue, ImportBatchInsert, ImportStatus, VehicleRaw, ValidationError } from '@/types';
import { loggingService } from '@/services/loggingService';
import { normalizeVehicleRawCell, normalizeVehicleRawRow } from '@/lib/import-parser';

type Step = 'upload' | 'validating' | 'review' | 'publishing' | 'done';

type BulkIncompleteFieldKey = 'branch_code' | 'model' | 'payment_method' | 'salesman_name' | 'customer_name';

const BULK_INCOMPLETE_FIELDS: Array<{
  key: BulkIncompleteFieldKey;
  label: string;
  placeholder: string;
}> = [
  { key: 'salesman_name', label: 'Salesman Name', placeholder: 'Enter the salesman name' },
  { key: 'customer_name', label: 'Customer Name', placeholder: 'Enter the customer name' },
  { key: 'payment_method', label: 'Payment Method', placeholder: 'Enter the payment method' },
  { key: 'model', label: 'Model', placeholder: 'Enter the vehicle model' },
  { key: 'branch_code', label: 'Branch Code', placeholder: 'Enter the branch code' },
];

function areSameRowNumbers(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildBlockingSuggestions(messages: string[]): string[] {
  const suggestions: string[] = [];

  if (messages.some(message => /invalid date format/i.test(message))) {
    suggestions.push('Use YYYY-MM-DD, DD/MM/YYYY, or DD.MM.YYYY with a real calendar date.');
  }

  if (messages.some(message => /dealer transfer price must be a valid number/i.test(message))) {
    suggestions.push('Use digits only for dealer transfer price. Remove letters and keep decimals with a period if needed.');
  }

  if (messages.some(message => /chassis .* appears/i.test(message) || /already exists in database/i.test(message))) {
    suggestions.push('Check the chassis number against the source file and replace duplicates with a unique value before publish.');
  }

  if (messages.some(message => /chassis number is too short/i.test(message))) {
    suggestions.push('Use the full chassis number. Values shorter than 5 characters will stay blocked.');
  }

  if (messages.some(message => /missing chassis number/i.test(message))) {
    suggestions.push('Enter the chassis number first. Other row fixes will not matter until the chassis is present.');
  }

  return suggestions;
}

function requiredTextValidator(label: string) {
  return (value: unknown) => String(value ?? '').trim() ? null : `${label} is required`;
}

function chassisValidator(value: unknown) {
  const normalized = normalizeVehicleRawCell('chassis_no', value).value;
  if (!normalized) return 'Chassis number is required';
  return String(normalized).length < 5 ? 'Chassis number must be at least 5 characters' : null;
}

function dateValidator(field: keyof VehicleRaw, label: string) {
  return (value: unknown) => {
    const normalized = normalizeVehicleRawCell(field, value);
    if (!normalized.value) return null;
    return normalized.invalid ? `${label} must be a real calendar date` : null;
  };
}

function numberValidator(label: string) {
  return (value: unknown) => {
    const normalized = normalizeVehicleRawCell('dealer_transfer_price', value).value;
    if (!normalized) return null;
    return Number.isNaN(Number(String(normalized))) ? `${label} must be a valid number` : null;
  };
}

function textColumn(key: keyof VehicleRaw, label: string, width: number, validate?: (value: unknown) => string | null): TableColumn<VehicleRaw> {
  return {
    key,
    label,
    width,
    editable: true,
    type: 'text',
    validate,
  };
}

const PREVIEW_COLUMNS: TableColumn<VehicleRaw>[] = [
  {
    key: 'row_number',
    label: '#',
    width: 72,
    editable: false,
    format: (value) => String(value ?? ''),
  },
  textColumn('chassis_no', 'Chassis No.', 160, chassisValidator),
  textColumn('bg_date', 'BG Date', 120, dateValidator('bg_date', 'BG Date')),
  textColumn('shipment_etd_pkg', 'Shipment ETD PKG', 140, dateValidator('shipment_etd_pkg', 'Shipment ETD PKG')),
  textColumn('shipment_eta_kk_twu_sdk', 'Shipment ETA', 140, dateValidator('shipment_eta_kk_twu_sdk', 'Shipment ETA')),
  textColumn('date_received_by_outlet', 'Date Received', 140, dateValidator('date_received_by_outlet', 'Date Received')),
  textColumn('reg_date', 'Reg Date', 120, dateValidator('reg_date', 'Reg Date')),
  textColumn('delivery_date', 'Delivery Date', 120, dateValidator('delivery_date', 'Delivery Date')),
  textColumn('disb_date', 'Disb. Date', 120, dateValidator('disb_date', 'Disb. Date')),
  textColumn('branch_code', 'Branch Code', 120, requiredTextValidator('Branch Code')),
  textColumn('model', 'Model', 140, requiredTextValidator('Model')),
  textColumn('payment_method', 'Payment Method', 140, requiredTextValidator('Payment Method')),
  textColumn('salesman_name', 'Salesman Name', 160, requiredTextValidator('Salesman Name')),
  textColumn('customer_name', 'Customer Name', 180, requiredTextValidator('Customer Name')),
  textColumn('remark', 'Remark', 220),
  textColumn('vaa_date', 'VAA Date', 120, dateValidator('vaa_date', 'VAA Date')),
  textColumn('full_payment_date', 'Full Payment Date', 140, dateValidator('full_payment_date', 'Full Payment Date')),
  textColumn('source_row_no', 'Source Row', 100),
  textColumn('variant', 'Variant', 140),
  textColumn('dealer_transfer_price', 'Dealer Transfer Price', 160, numberValidator('Dealer Transfer Price')),
  textColumn('full_payment_type', 'Full Payment Type', 160),
  textColumn('shipment_name', 'Shipment Name', 180),
  textColumn('lou', 'LOU', 100),
  textColumn('contra_sola', 'Contra Sola', 120),
  textColumn('reg_no', 'Reg No.', 120),
  textColumn('invoice_no', 'Invoice No.', 120),
  textColumn('obr', 'OBR', 120),
];

const PREVIEW_PERMISSIONS = Object.fromEntries(
  PREVIEW_COLUMNS.map(column => [column.key, column.editable ? 'edit' : 'view'])
) as Record<string, 'view' | 'edit'>;

const PREVIEW_DATE_FIELDS: (keyof VehicleRaw)[] = [
  'bg_date',
  'shipment_etd_pkg',
  'shipment_eta_kk_twu_sdk',
  'date_received_by_outlet',
  'reg_date',
  'delivery_date',
  'disb_date',
  'vaa_date',
  'full_payment_date',
];

function buildPreviewIssues(rows: VehicleRaw[], batchId: string): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  rows.forEach(row => {
    if (!row.chassis_no) {
      issues.push({
        id: `preview-${row.id}-chassis`,
        chassisNo: row.chassis_no ?? '',
        field: 'chassis_no',
        issueType: 'missing',
        message: `Row ${row.row_number}: Missing chassis number`,
        severity: 'error',
        importBatchId: batchId,
        rowNumber: row.row_number,
      });
    }

    PREVIEW_DATE_FIELDS.forEach(field => {
      const rawValue = row[field];
      if (!rawValue) return;

      const normalized = normalizeVehicleRawCell(field, rawValue);
      if (normalized.invalid) {
        issues.push({
          id: `preview-${row.id}-${field}`,
          chassisNo: row.chassis_no ?? '',
          field,
          issueType: 'format_error',
          message: `Row ${row.row_number}: ${field} has invalid date format`,
          severity: 'error',
          importBatchId: batchId,
          rowNumber: row.row_number,
        });
      }
    });

    if (row.dealer_transfer_price) {
      const normalizedPrice = normalizeVehicleRawCell('dealer_transfer_price', row.dealer_transfer_price).value;
      if (normalizedPrice && Number.isNaN(Number(normalizedPrice))) {
        issues.push({
          id: `preview-${row.id}-dealer-transfer-price`,
          chassisNo: row.chassis_no ?? '',
          field: 'dealer_transfer_price',
          issueType: 'invalid',
          message: `Row ${row.row_number}: Dealer transfer price must be a valid number`,
          severity: 'error',
          importBatchId: batchId,
          rowNumber: row.row_number,
        });
      }
    }
  });

  const rowsByChassis = new Map<string, VehicleRaw[]>();
  rows.forEach(row => {
    if (!row.chassis_no) return;
    const existingRows = rowsByChassis.get(row.chassis_no) ?? [];
    existingRows.push(row);
    rowsByChassis.set(row.chassis_no, existingRows);
  });

  rowsByChassis.forEach((duplicateRows, chassis) => {
    if (duplicateRows.length <= 1) return;

    duplicateRows.forEach(row => {
      issues.push({
        id: `preview-dup-${chassis}-${row.row_number}`,
        chassisNo: chassis,
        field: 'chassis_no',
        issueType: 'duplicate',
        message: `Chassis ${chassis} appears ${duplicateRows.length} times`,
        severity: 'warning',
        importBatchId: batchId,
        rowNumber: row.row_number,
      });
    });
  });

  return issues;
}

export default function ImportCenter() {
  const navigate = useNavigate();
  const { addImportBatch, updateImportBatch, setVehicles, addQualityIssues, refreshKpis, vehicles, user } = useData();
  const companyId = useCompanyId();
  const { toast } = useToast();
  const companyId = useCompanyId();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<VehicleRaw[]>([]);
  const [editPatchesByRowId, setEditPatchesByRowId] = useState<Map<string, Partial<VehicleRaw>>>(new Map());
  const [validationIssues, setValidationIssues] = useState<DataQualityIssue[]>([]);
  const [serverErrors, setServerErrors] = useState<ValidationError[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [batchId, setBatchId] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [validationProgress, setValidationProgress] = useState({ processed: 0, total: 0 });
  const [previewValidationRevision, setPreviewValidationRevision] = useState(0);
  const [previewValidationState, setPreviewValidationState] = useState<'idle' | 'validating' | 'ready'>('idle');
  const [selectedBlockingRowNumber, setSelectedBlockingRowNumber] = useState<number | null>(null);
  const [focusBlockingRow, setFocusBlockingRow] = useState(false);
  const [bulkIncompleteField, setBulkIncompleteField] = useState<BulkIncompleteFieldKey | ''>('');
  const [bulkIncompleteValue, setBulkIncompleteValue] = useState('');
  const [bulkIncompleteSelections, setBulkIncompleteSelections] = useState<Partial<Record<BulkIncompleteFieldKey, number[]>>>({});
  const selectedBlockingRowIndexRef = useRef(0);
  const reviewValidationRequestIdRef = useRef(0);

  // Branch-mapping proposal: rawCode → user-entered canonical value
  const [branchMappingInputs, setBranchMappingInputs] = useState<Record<string, string>>({});
  const [savedBranchMappings, setSavedBranchMappings] = useState<Set<string>>(new Set());
  const [savingBranch, setSavingBranch] = useState<string | null>(null);
  const [lastPublishSummary, setLastPublishSummary] = useState<{
    publishedRows: number;
    reviewRows: number;
    status: ImportStatus;
  } | null>(null);

  // ─── Error classification helpers ────────────────────────────────────────────
  const blockingValidationIssues = validationIssues.filter(issue => issue.severity === 'error');
  const warningValidationIssues = validationIssues.filter(issue => issue.severity === 'warning');

  // Hard blockers: rows that genuinely cannot be published
  const HARD_BLOCKER_CODES = ['DUPLICATE_CHASSIS', 'CHASSIS_TOO_SHORT', 'INVALID_DATE_FORMAT', 'INVALID_NUMBER'];
  const HARD_BLOCKER_FIELDS = ['chassis_no']; // for REQUIRED_FIELD_MISSING
  const INCOMPLETE_WARNING_CODES = ['OPTIONAL_FIELD_MISSING'];

  const hardBlockers = serverErrors.filter(
    e => e.severity === 'error' && (
      HARD_BLOCKER_CODES.includes(e.code) ||
      (e.code === 'REQUIRED_FIELD_MISSING' && HARD_BLOCKER_FIELDS.includes(e.field))
    )
  );

  // Reference data errors: branch doesn't exist in system → propose to add
  const referenceErrors = serverErrors.filter(e => e.code === 'INVALID_BRANCH_CODE');
  // Extract unique unknown branch codes from error messages
  const unknownBranchCodes = [...new Set(
    referenceErrors.map(e => {
      const match = e.message.match(/Branch code '([^']+)'/);
      return match ? match[1] : e.field;
    })
  )];

  // Real/external-data errors: salesman, customer, dates, numbers — mark as incomplete
  const incompleteErrors = serverErrors.filter(
    e => INCOMPLETE_WARNING_CODES.includes(e.code) || (
      e.severity === 'error' &&
      !HARD_BLOCKER_CODES.includes(e.code) &&
      !(e.code === 'REQUIRED_FIELD_MISSING' && HARD_BLOCKER_FIELDS.includes(e.field)) &&
      e.code !== 'INVALID_BRANCH_CODE'
    )
  );

  // Count rows affected by incomplete data (deduplicate by row number)
  const incompleteRowNums = [...new Set(incompleteErrors.map(e => e.rowNumber).filter(Boolean))];

  const previewBlockingRowNums = useMemo(
    () => [...new Set(blockingValidationIssues.map(issue => issue.rowNumber).filter(Boolean))],
    [blockingValidationIssues]
  );
  const hardBlockerRowNums = useMemo(
    () => [...new Set(hardBlockers.map(error => error.rowNumber).filter(Boolean))],
    [hardBlockers]
  );
  const blockedRowNums = useMemo(
    () => new Set([...previewBlockingRowNums, ...hardBlockerRowNums]),
    [hardBlockerRowNums, previewBlockingRowNums]
  );
  const previewWarningRowNums = useMemo(
    () => [...new Set(warningValidationIssues.map(issue => issue.rowNumber).filter(Boolean))],
    [warningValidationIssues]
  );
  const pendingReferenceErrors = useMemo(
    () => referenceErrors.filter(error => {
      const match = error.message.match(/Branch code '([^']+)'/);
      return match ? !savedBranchMappings.has(match[1]) : true;
    }),
    [referenceErrors, savedBranchMappings]
  );
  const rawRowIdByRowNumber = useMemo(
    () => new Map(rawRows.map(row => [row.row_number, row.id])),
    [rawRows]
  );
  const rawRowNumberByRowId = useMemo(
    () => new Map(rawRows.map(row => [row.id, row.row_number])),
    [rawRows]
  );
  const mergedRawRows = useMemo(
    () => rawRows.map(row => {
      const patch = editPatchesByRowId.get(row.id);
      return patch ? normalizeVehicleRawRow({ ...row, ...patch }) : row;
    }),
    [editPatchesByRowId, rawRows]
  );
  const publishableIncompleteErrors = useMemo(
    () => [...pendingReferenceErrors, ...incompleteErrors],
    [pendingReferenceErrors, incompleteErrors]
  );
  const blockingRows = useMemo(
    () => mergedRawRows.filter(row => blockedRowNums.has(row.row_number)),
    [blockedRowNums, mergedRawRows]
  );
  const publishableIncompleteRowNums = useMemo(() => {
    const rowNums = new Set<number>();
    publishableIncompleteErrors.forEach(error => {
      if (typeof error.rowNumber !== 'number' || blockedRowNums.has(error.rowNumber)) {
        return;
      }
      rowNums.add(error.rowNumber);
    });
    return rowNums;
  }, [blockedRowNums, publishableIncompleteErrors]);
  const publishableIncompleteRows = useMemo(
    () => mergedRawRows.filter(row => publishableIncompleteRowNums.has(row.row_number)),
    [mergedRawRows, publishableIncompleteRowNums]
  );
  const blockingReasonsByRow = useMemo(() => {
    const reasons = new Map<number, string[]>();

    [...hardBlockers, ...blockingValidationIssues].forEach((issue) => {
      if (typeof issue.rowNumber !== 'number') {
        return;
      }

      const existingReasons = reasons.get(issue.rowNumber) ?? [];
      if (!existingReasons.includes(issue.message)) {
        existingReasons.push(issue.message);
        reasons.set(issue.rowNumber, existingReasons);
      }
    });

    return reasons;
  }, [blockingValidationIssues, hardBlockers]);
  const selectedBlockingRow = useMemo(
    () => blockingRows.find(row => row.row_number === selectedBlockingRowNumber) ?? blockingRows[0] ?? null,
    [blockingRows, selectedBlockingRowNumber]
  );
  const selectedBlockingRowIndex = useMemo(
    () => selectedBlockingRow ? blockingRows.findIndex(row => row.row_number === selectedBlockingRow.row_number) : -1,
    [blockingRows, selectedBlockingRow]
  );
  const selectedBlockingSuggestions = useMemo(
    () => selectedBlockingRow ? buildBlockingSuggestions(blockingReasonsByRow.get(selectedBlockingRow.row_number) ?? []) : [],
    [blockingReasonsByRow, selectedBlockingRow]
  );
  const displayedBlockingRows = useMemo(
    () => focusBlockingRow && selectedBlockingRow ? [selectedBlockingRow] : blockingRows,
    [blockingRows, focusBlockingRow, selectedBlockingRow]
  );
  const publishableIncompleteReasonsByRow = useMemo(() => {
    const reasons = new Map<number, string[]>();
    publishableIncompleteErrors.forEach(error => {
      if (typeof error.rowNumber !== 'number' || blockedRowNums.has(error.rowNumber)) {
        return;
      }

      const existingReasons = reasons.get(error.rowNumber) ?? [];
      if (!existingReasons.includes(error.message)) {
        existingReasons.push(error.message);
        reasons.set(error.rowNumber, existingReasons);
      }
    });
    return reasons;
  }, [blockedRowNums, publishableIncompleteErrors]);
  const bulkIncompleteTargets = useMemo(
    () => BULK_INCOMPLETE_FIELDS
      .map(option => {
        const rowNumbers = [...new Set(
          incompleteErrors
            .filter(error => (
              error.code === 'REQUIRED_FIELD_MISSING' &&
              error.field === option.key &&
              typeof error.rowNumber === 'number' &&
              !blockedRowNums.has(error.rowNumber)
            ))
            .map(error => error.rowNumber as number)
        )];

        return {
          ...option,
          rowNumbers,
        };
      })
      .filter(option => option.rowNumbers.length > 0),
    [blockedRowNums, incompleteErrors]
  );
  const selectedBulkIncompleteTarget = useMemo(
    () => bulkIncompleteTargets.find(option => option.key === bulkIncompleteField) ?? bulkIncompleteTargets[0] ?? null,
    [bulkIncompleteField, bulkIncompleteTargets]
  );
  const publishableIncompleteRowsByNumber = useMemo(
    () => new Map(publishableIncompleteRows.map(row => [row.row_number, row])),
    [publishableIncompleteRows]
  );
  const selectedBulkIncompleteRowNumbers = useMemo(
    () => selectedBulkIncompleteTarget ? bulkIncompleteSelections[selectedBulkIncompleteTarget.key] ?? [] : [],
    [bulkIncompleteSelections, selectedBulkIncompleteTarget]
  );
  const selectableBulkIncompleteRows = useMemo(
    () => selectedBulkIncompleteTarget
      ? selectedBulkIncompleteTarget.rowNumbers
          .map(rowNumber => publishableIncompleteRowsByNumber.get(rowNumber))
          .filter((row): row is VehicleRaw => Boolean(row))
      : [],
    [publishableIncompleteRowsByNumber, selectedBulkIncompleteTarget]
  );
  const serverWarningRowNums = useMemo(
    () => [...new Set(serverErrors.filter(error => error.severity === 'warning').map(error => error.rowNumber).filter(Boolean))],
    [serverErrors]
  );
  const publishableIncompleteCount = publishableIncompleteRows.length;
  const queuedReviewCount = blockedRowNums.size + publishableIncompleteCount;

  const hasHardErrors = hardBlockers.length > 0 || blockingValidationIssues.length > 0 || missingCols.length > 0;
  const hasPendingReviewChanges = previewValidationRevision > 0;
  const isPreviewValidating = previewValidationState === 'validating';

  const runReviewValidation = useCallback(async (rowsToValidate: VehicleRaw[]) => {
    if (!batchId) {
      return;
    }

    const requestId = reviewValidationRequestIdRef.current + 1;
    reviewValidationRequestIdRef.current = requestId;
    setValidationIssues(buildPreviewIssues(rowsToValidate, batchId));
    setPreviewValidationState('validating');

    try {
      const validationResult = await validateVehicleImportBatch(
        rowsToValidate,
        companyId,
        (processed, total) => setValidationProgress({ processed, total })
      );

      if (requestId !== reviewValidationRequestIdRef.current) {
        return;
      }

      setServerErrors(validationResult.isValid ? validationResult.warnings : validationResult.errors);
      setPreviewValidationRevision(0);
      return {
        previewIssues: buildPreviewIssues(rowsToValidate, batchId),
        validationResult,
      };
    } catch (error) {
      if (requestId !== reviewValidationRequestIdRef.current) {
        return;
      }

      loggingService.error('Preview revalidation error', { error }, 'ImportCenter');
      return null;
    } finally {
      if (requestId === reviewValidationRequestIdRef.current) {
        setPreviewValidationState('ready');
      }
    }
  }, [batchId, companyId]);

  useEffect(() => {
    if (blockingRows.length === 0) {
      setSelectedBlockingRowNumber(null);
      setFocusBlockingRow(false);
      selectedBlockingRowIndexRef.current = 0;
      return;
    }

    if (!selectedBlockingRowNumber || !blockingRows.some(row => row.row_number === selectedBlockingRowNumber)) {
      const fallbackIndex = Math.min(selectedBlockingRowIndexRef.current, blockingRows.length - 1);
      setSelectedBlockingRowNumber(blockingRows[Math.max(fallbackIndex, 0)].row_number);
    }
  }, [blockingRows, selectedBlockingRowNumber]);

  useEffect(() => {
    if (selectedBlockingRowIndex >= 0) {
      selectedBlockingRowIndexRef.current = selectedBlockingRowIndex;
    }
  }, [selectedBlockingRowIndex]);

  useEffect(() => {
    if (bulkIncompleteTargets.length === 0) {
      if (bulkIncompleteField) {
        setBulkIncompleteField('');
      }
      if (bulkIncompleteValue) {
        setBulkIncompleteValue('');
      }
      if (Object.keys(bulkIncompleteSelections).length > 0) {
        setBulkIncompleteSelections({});
      }
      return;
    }

    if (!bulkIncompleteField || !bulkIncompleteTargets.some(option => option.key === bulkIncompleteField)) {
      setBulkIncompleteField(bulkIncompleteTargets[0].key);
    }

    setBulkIncompleteSelections(previousSelections => {
      const nextSelections: Partial<Record<BulkIncompleteFieldKey, number[]>> = { ...previousSelections };
      const activeKeys = new Set(bulkIncompleteTargets.map(option => option.key));
      let changed = false;

      (Object.keys(nextSelections) as BulkIncompleteFieldKey[]).forEach(key => {
        if (!activeKeys.has(key)) {
          delete nextSelections[key];
          changed = true;
        }
      });

      bulkIncompleteTargets.forEach(option => {
        const existingSelection = nextSelections[option.key];
        if (!existingSelection) {
          nextSelections[option.key] = option.rowNumbers;
          changed = true;
          return;
        }

        const prunedSelection = existingSelection.filter(rowNumber => option.rowNumbers.includes(rowNumber));
        if (!areSameRowNumbers(existingSelection, prunedSelection)) {
          nextSelections[option.key] = prunedSelection;
          changed = true;
        }
      });

      return changed ? nextSelections : previousSelections;
    });
  }, [bulkIncompleteField, bulkIncompleteSelections, bulkIncompleteTargets, bulkIncompleteValue]);

  // Save a proposed branch mapping to the DB
  const handleSaveBranchMapping = useCallback(async (rawCode: string) => {
    const canonical = branchMappingInputs[rawCode]?.trim();
    if (!canonical) return;
    setSavingBranch(rawCode);
    try {
      const { error } = await createBranchMapping({ rawValue: rawCode, canonicalCode: canonical, companyId });
      if (!error) {
        setSavedBranchMappings(prev => new Set([...prev, rawCode]));
        toast({ title: 'Branch mapping saved', description: `"${rawCode}" → "${canonical}" added. It will be applied when you publish.` });
      } else {
        toast({ title: 'Failed to save mapping', description: error.message, variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Failed to save mapping', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSavingBranch(null);
    }
  }, [branchMappingInputs, companyId, toast]);

  const handlePreviewEdit = useCallback(async (rowId: string, column: string, value: unknown) => {
    selectedBlockingRowIndexRef.current = selectedBlockingRowIndex >= 0 ? selectedBlockingRowIndex : 0;
    setEditPatchesByRowId(previousPatches => {
      const nextPatches = new Map(previousPatches);
      const existingPatch = nextPatches.get(rowId) ?? {};
      nextPatches.set(rowId, { ...existingPatch, [column]: value });
      return nextPatches;
    });

    const rowNumber = rawRowNumberByRowId.get(rowId);
    if (typeof rowNumber === 'number') {
      setSelectedBlockingRowNumber(rowNumber);
      setFocusBlockingRow(true);
    }

    setPreviewValidationState('idle');
    setPreviewValidationRevision(revision => revision + 1);
  }, [rawRowNumberByRowId, selectedBlockingRowIndex]);

  const handleRefreshChecks = useCallback(async () => {
    await runReviewValidation(mergedRawRows);
  }, [mergedRawRows, runReviewValidation]);

  const handleSetBulkIncompleteSelection = useCallback((rowNumbers: number[]) => {
    if (!selectedBulkIncompleteTarget) {
      return;
    }

    setBulkIncompleteSelections(previousSelections => {
      const currentSelection = previousSelections[selectedBulkIncompleteTarget.key] ?? [];
      if (areSameRowNumbers(currentSelection, rowNumbers)) {
        return previousSelections;
      }

      return {
        ...previousSelections,
        [selectedBulkIncompleteTarget.key]: rowNumbers,
      };
    });
  }, [selectedBulkIncompleteTarget]);

  const handleToggleBulkIncompleteRow = useCallback((rowNumber: number, checked: boolean) => {
    if (!selectedBulkIncompleteTarget) {
      return;
    }

    const nextSelection = checked
      ? selectedBulkIncompleteTarget.rowNumbers.filter(candidate => (
          candidate === rowNumber || selectedBulkIncompleteRowNumbers.includes(candidate)
        ))
      : selectedBulkIncompleteRowNumbers.filter(candidate => candidate !== rowNumber);

    handleSetBulkIncompleteSelection(nextSelection);
  }, [handleSetBulkIncompleteSelection, selectedBulkIncompleteRowNumbers, selectedBulkIncompleteTarget]);

  const handleBulkApplyIncompleteField = useCallback(() => {
    if (!selectedBulkIncompleteTarget || !bulkIncompleteValue.trim() || selectedBulkIncompleteRowNumbers.length === 0) {
      return;
    }

    setEditPatchesByRowId(previousPatches => {
      const nextPatches = new Map(previousPatches);

      selectedBulkIncompleteRowNumbers.forEach(rowNumber => {
        const rowId = rawRowIdByRowNumber.get(rowNumber);
        if (!rowId) {
          return;
        }

        const existingPatch = nextPatches.get(rowId) ?? {};
        nextPatches.set(rowId, {
          ...existingPatch,
          [selectedBulkIncompleteTarget.key]: bulkIncompleteValue,
        });
      });

      return nextPatches;
    });
    setPreviewValidationState('idle');
    setPreviewValidationRevision(revision => revision + 1);
    setBulkIncompleteValue('');
    toast({
      title: 'Bulk value applied',
      description: `Updated ${selectedBulkIncompleteRowNumbers.length} row${selectedBulkIncompleteRowNumbers.length !== 1 ? 's' : ''} missing ${selectedBulkIncompleteTarget.label.toLowerCase()}.`,
    });
  }, [bulkIncompleteValue, rawRowIdByRowNumber, selectedBulkIncompleteRowNumbers, selectedBulkIncompleteTarget, toast]);

  const moveSelectedBlockingRow = useCallback((direction: 'previous' | 'next') => {
    if (blockingRows.length === 0) {
      return;
    }

    const baseIndex = selectedBlockingRowIndex >= 0 ? selectedBlockingRowIndex : 0;
    const targetIndex = direction === 'previous'
      ? Math.max(baseIndex - 1, 0)
      : Math.min(baseIndex + 1, blockingRows.length - 1);

    selectedBlockingRowIndexRef.current = targetIndex;
    setSelectedBlockingRowNumber(blockingRows[targetIndex].row_number);
    setFocusBlockingRow(true);
  }, [blockingRows, selectedBlockingRowIndex]);

  const handleFileDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be chosen again (iOS Safari otherwise skips
    // the onChange when re-selecting). Must be done before any early return.
    try { e.target.value = ''; } catch { /* noop */ }
    if (!file) return;
    if (!companyId) {
      toast({
        title: 'Import unavailable',
        description: 'Your user profile does not have a company assigned.',
        variant: 'destructive',
      });
      return;
    }
    // Immediate feedback so the user knows the tap registered — critical on
    // tablets where there's no cursor / hover state to indicate progress.
    toast({ title: 'Reading file', description: file.name });
    setFileName(file.name);
    setValidationProgress({ processed: 0, total: 0 });
    setStep('validating');

    try {
      // Parse the workbook
      const buffer = await file.arrayBuffer();
      const { rows, missingColumns } = parseWorkbook(buffer);

      setMissingCols(missingColumns);

      // Server-side validation
      const validationResult = await validateVehicleImportBatch(
        rows,
        companyId,
        (processed, total) => setValidationProgress({ processed, total })
      );

      // Always create the batch record in DB first so we get a real UUID
      const errorRowCount = new Set(validationResult.errors.map(error => error.rowNumber).filter((rowNumber): rowNumber is number => typeof rowNumber === 'number')).size;
      const batch: ImportBatchInsert = {
        fileName: file.name,
        uploadedBy: user?.email || 'Unknown',
        uploadedAt: new Date().toISOString(),
        status: missingColumns.length > 0 ? 'failed' : 'validated',
        totalRows: rows.length,
        validRows: Math.max(rows.length - errorRowCount, 0),
        errorRows: errorRowCount,
        duplicateRows: rows.filter((row, index, allRows) => row.chassis_no && allRows.some((candidate, candidateIndex) => candidateIndex !== index && candidate.chassis_no === row.chassis_no)).length,
        companyId,
        publishedRows: 0,
        reviewRows: 0,
      };

      const { data: batchData, error: batchError } = await createImportBatch(batch, user?.id || 'system-user');

      if (batchError) {
        throw new Error(`Failed to create import batch: ${batchError.message}`);
      }

      const id = batchData?.id ?? '';
      if (!id) throw new Error('Import batch created but no ID returned');
      const previewIssues = buildPreviewIssues(rows, id);
      setBatchId(id);
      setRawRows(rows);
      setEditPatchesByRowId(new Map());
      setValidationIssues(previewIssues);
      setServerErrors(validationResult.isValid ? validationResult.warnings : validationResult.errors);
      setPreviewValidationRevision(0);
      setPreviewValidationState('ready');
      addImportBatch({ ...batch, id, duplicateRows: previewIssues.filter(issue => issue.issueType === 'duplicate').length });
      setLastPublishSummary(null);
      setStep('review');
    } catch (error) {
      loggingService.error('Import error', { error }, 'ImportCenter');
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setStep('upload');
    }
  }, [addImportBatch, companyId, toast, user]);

  const handlePublish = useCallback(async () => {
    if (missingCols.length > 0 || isPreviewValidating) {
      return; // button is disabled, but guard anyway
    }

    const reviewValidation = await runReviewValidation(mergedRawRows);
    if (!reviewValidation) {
      toast({ title: 'Validation check failed', description: 'We could not validate your edits. Try again.', variant: 'destructive' });
      return;
    }

    const effectiveValidationErrors = reviewValidation.validationResult.errors.filter(error => {
      if (error.code !== 'INVALID_BRANCH_CODE') {
        return true;
      }

      const match = error.message.match(/Branch code '([^']+)'/);
      return match ? !savedBranchMappings.has(match[1]) : true;
    });

    const { cleanRows, reviewRows } = splitImportRowsForPublish(
      rawRows,
      mergedRawRows,
      reviewValidation.previewIssues,
      effectiveValidationErrors,
      batchId,
      companyId,
    );

    if (cleanRows.length === 0 && reviewRows.length === 0) {
      toast({ title: 'Nothing to publish', description: 'There are no clean rows to publish or queue for review.', variant: 'destructive' });
      return;
    }

    setStep('publishing');
    updateImportBatch(batchId, { status: 'publish_in_progress' });

    try {
      let insertedVehicleCount = 0;

      if (cleanRows.length > 0) {
        const result = await validateAndInsertVehicles(
          cleanRows,
          batchId,
          companyId,
          user?.id || 'system-user'
        );

        if (result.error) {
          throw new Error(`Validation or insert failed: ${result.error.message}`);
        }

        insertedVehicleCount = result.inserted;
      }

      const reviewInsertResult = await insertImportReviewRows(reviewRows);
      if (reviewInsertResult.error) {
        throw new Error(`Review queue insert failed: ${reviewInsertResult.error.message}`);
      }

      if (cleanRows.length > 0) {
        const allNames = [...new Set(cleanRows.map(r => r.salesman_name).filter((n): n is string => Boolean(n)))];
        const [branchMap, paymentMap, nameToIdMap] = await Promise.all([
          loadBranchMappingLookup(companyId),
          loadPaymentMappingLookup(companyId),
          resolveNamesToIds(companyId, allNames),
        ]);
        const { canonical, issues } = publishCanonical(cleanRows, branchMap, paymentMap, nameToIdMap);
        const existingNonDup = vehicles.filter(v => !canonical.find(c => c.chassis_no === v.chassis_no));
        await setVehicles([...canonical, ...existingNonDup]);
        addQualityIssues([...reviewValidation.previewIssues, ...issues]);
        refreshKpis();
      } else {
        addQualityIssues(reviewValidation.previewIssues);
      }

      const nextStatus: ImportStatus = reviewRows.length === 0
        ? 'published'
        : cleanRows.length > 0
          ? 'published_with_review'
          : 'review_pending';

      const publishedAt = cleanRows.length > 0 ? new Date().toISOString() : undefined;

      updateImportBatch(batchId, {
        status: nextStatus,
        publishedAt,
        validRows: cleanRows.length,
        errorRows: reviewRows.length,
        publishedRows: cleanRows.length,
        reviewRows: reviewRows.length,
        reviewCompletedAt: reviewRows.length === 0 ? new Date().toISOString() : undefined,
      });

      setLastPublishSummary({
        publishedRows: cleanRows.length,
        reviewRows: reviewRows.length,
        status: nextStatus,
      });

      setRawRows(mergedRawRows);
      setEditPatchesByRowId(new Map());
      setStep('done');
    } catch (error) {
      loggingService.error('Publish error', { error }, 'ImportCenter');
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      updateImportBatch(batchId, { status: 'failed' });
      setStep('review');
    }
  }, [addQualityIssues, batchId, companyId, isPreviewValidating, mergedRawRows, missingCols.length, rawRows, refreshKpis, runReviewValidation, savedBranchMappings, setVehicles, toast, updateImportBatch, user, vehicles]);

  const handleExportErrors = useCallback(() => {
    const errorsText = serverErrors.map(e => 
      `Field: ${e.field}\nMessage: ${e.message}\nCode: ${e.code}\nSeverity: ${e.severity}\n---`
    ).join('\n');
    
    const blob = new Blob([errorsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_validation_errors.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [serverErrors, fileName]);

  const reset = () => { 
    setStep('upload'); 
    setRawRows([]); 
    setEditPatchesByRowId(new Map());
    setValidationIssues([]); 
    setServerErrors([]); 
    setMissingCols([]); 
    setPreviewValidationRevision(0);
    setPreviewValidationState('idle');
    setBranchMappingInputs({});
    setSavedBranchMappings(new Set());
    setLastPublishSummary(null);
  };

  const publishLabel = hasPendingReviewChanges
    ? 'Publish And Validate'
    : queuedReviewCount > 0
      ? `Publish Clean Rows (${queuedReviewCount} row${queuedReviewCount !== 1 ? 's' : ''} queued for review)`
      : 'Publish Canonical Data';

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Center"
        description="Upload and process consolidated inventory report workbooks"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Import Center' }]}
      />

      {/* Progress */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2">
          {(['upload', 'validating', 'review', 'publishing', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${step === s ? 'bg-primary/15 text-primary' : s < step ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                <span className="capitalize">{s}</span>
              </div>
              {i < 4 && <div className="flex-1 h-0.5 bg-border" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 'upload' && (
        <div className="glass-panel p-6 sm:p-12 text-center">
          {/*
            Tablet-safe file picker:
            - The actual tap target is the native file input itself, stretched
              over the whole drop zone with `opacity: 0`. This avoids the
              synthetic `element.click()` path that iPadOS Safari can silently
              ignore.
            - Keep the input in the normal layout tree; some tablet browsers do
              not allow opening the picker from `display:none`/visually-hidden
              controls.
            - Clear the current value on click so picking the same workbook a
              second time still fires `onChange`.
          */}
          <div
            className="relative w-full border-2 border-dashed border-border rounded-lg p-8 sm:p-12 hover:border-primary/50 transition-colors text-center overflow-hidden"
            onPointerEnter={preloadExcelJS}
            onFocusCapture={preloadExcelJS}
          >
            <input
              id="import-file-input"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileDrop}
              onClick={event => {
                event.currentTarget.value = '';
              }}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              aria-label="Choose consolidated inventory workbook to import"
            />
            <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">Tap to choose a workbook</p>
            <p className="text-sm text-muted-foreground mb-4">Supports .xlsx and .xls consolidated inventory workbooks, including multi-sheet replacements.</p>
            <span
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow"
            >
              <Upload className="h-4 w-4" />Browse files
            </span>
          </div>
        </div>
      )}

      {step === 'validating' && (
        <div className="glass-panel p-10 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-foreground font-medium mb-1">Validating {fileName}…</p>

          {validationProgress.total > 0 ? (
            <div className="mt-4 max-w-sm mx-auto">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Row {validationProgress.processed} of {validationProgress.total}</span>
                <span>{Math.round((validationProgress.processed / validationProgress.total) * 100)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150 rounded-full"
                  style={{ width: `${(validationProgress.processed / validationProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Parsing workbook…</p>
          )}

          <div className="mt-6 inline-block text-left space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Each row is checked for:</p>
            {[
              `Required fields — ${getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.')}, ${getAutoAgingFieldLabel('branch_code', 'BRCH K1')}, ${getAutoAgingFieldLabel('model', 'MODEL')}, ${getAutoAgingFieldLabel('payment_method', 'PAYMENT METHOD')}`,
              `Incomplete fields — ${getAutoAgingFieldLabel('customer_name', 'CUST NAME')} and ${getAutoAgingFieldLabel('salesman_name', 'SA NAME')} are flagged as pending, not blocked`,
              'Chassis number format (min 5 chars) & duplicate check against existing vehicles',
              `${getAutoAgingFieldLabel('branch_code', 'BRCH K1')} — must exist in your company's branch records`,
              'Date fields — valid format across 9 date columns',
              `Date order — e.g. ${getAutoAgingFieldLabel('shipment_etd_pkg', 'SHIPMENT ETD PKG')} must not precede ${getAutoAgingFieldLabel('bg_date', 'BG DATE')}`,
              'Transfer price — must be a valid number',
              `${getAutoAgingFieldLabel('payment_method', 'PAYMENT METHOD')} — flags unusual values as warnings`,
            ].map((check, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0 mt-1" />
                {check}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <p className="text-foreground font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">{rawRows.length} rows parsed</p>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-border/70 bg-secondary/20 p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Fix Now Or Queue</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Imported values are cleaned on load: spaces are trimmed, chassis and branch codes are uppercased, payment labels are standardized, and valid dates are normalized before publish. You can still fix rows here, but publishing now will insert clean rows and move the remaining rows into the review queue.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                  {isPreviewValidating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Running validation…
                    </>
                  ) : hasPendingReviewChanges ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Pending validation on submit
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      Last validation complete
                    </>
                  )}
                </div>
              </div>

              {hasPendingReviewChanges && (
                <div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  Edit all bad rows first, then submit. Validation will run when you click publish or use Refresh checks.
                </div>
              )}

              {selectedBlockingRow && (
                <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Blocking queue</p>
                      <p className="text-sm font-medium text-foreground">
                        Row {selectedBlockingRowIndex + 1} of {blockingRows.length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Working on row {selectedBlockingRow.row_number}{selectedBlockingRow.chassis_no ? ` · ${selectedBlockingRow.chassis_no}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedBlockingRowIndex <= 0}
                        onClick={() => moveSelectedBlockingRow('previous')}
                      >
                        Previous row
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedBlockingRowIndex < 0 || selectedBlockingRowIndex >= blockingRows.length - 1}
                        onClick={() => moveSelectedBlockingRow('next')}
                      >
                        Next row
                      </Button>
                      <Button
                        size="sm"
                        variant={focusBlockingRow ? 'default' : 'outline'}
                        onClick={() => setFocusBlockingRow(current => !current)}
                      >
                        {focusBlockingRow ? 'Show all blockers' : 'Focus current row'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPreviewValidating}
                        onClick={() => void handleRefreshChecks()}
                      >
                        {isPreviewValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh checks'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {(blockingReasonsByRow.get(selectedBlockingRow.row_number) ?? []).map((message) => (
                      <div key={`${selectedBlockingRow.id}-${message}`} className="flex items-start gap-2 text-xs text-foreground">
                        <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                        <span>{message}</span>
                      </div>
                    ))}
                  </div>
                  {selectedBlockingSuggestions.length > 0 && (
                    <div className="mt-3 rounded-md border border-primary/20 bg-background/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-2">Quick suggestions</p>
                      <div className="space-y-1">
                        {selectedBlockingSuggestions.map((suggestion) => (
                          <div key={suggestion} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Info className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
                            <span>{suggestion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {blockingRows.length > 0 ? (
                <ExcelTable
                  data={displayedBlockingRows}
                  columns={PREVIEW_COLUMNS}
                  onEdit={handlePreviewEdit}
                  onRowClick={(row) => setSelectedBlockingRowNumber(row.row_number)}
                  permissions={PREVIEW_PERMISSIONS}
                  showSelection={false}
                  getRowClassName={(row) => {
                    const rowNumber = row.row_number;
                    if (selectedBlockingRowNumber === rowNumber) return 'bg-primary/10 border-primary/20';
                    if (blockedRowNums.has(rowNumber)) return 'bg-destructive/5';
                    if (previewWarningRowNums.includes(rowNumber) || serverWarningRowNums.includes(rowNumber)) return 'bg-warning/5';
                    return '';
                  }}
                />
              ) : (
                <div className={`rounded-md border p-4 text-sm ${publishableIncompleteCount > 0 ? 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400' : 'border-success/20 bg-success/5 text-success'}`}>
                  {publishableIncompleteCount > 0
                    ? 'No blocking rows need attention. The remaining rows will be queued for review if you publish now.'
                    : 'No blocking rows need attention. This workbook is ready to publish.'}
                </div>
              )}
            </div>

            {/* ── Missing required columns (always blocks) ── */}
            {missingCols.length > 0 && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm text-destructive font-semibold">Missing required columns — cannot proceed</p>
                </div>
                <p className="text-sm text-destructive">{missingCols.join(', ')}</p>
              </div>
            )}

            {/* ── Hard blockers (duplicate chassis, chassis too short, missing chassis) ── */}
            {(hardBlockers.length > 0 || blockingValidationIssues.length > 0) && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <h4 className="text-sm font-semibold text-destructive">{blockedRowNums.size} blocking row{blockedRowNums.size !== 1 ? 's' : ''} are still unresolved</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a row in the queue or use the previous and next controls to work through blocking issues one row at a time. If you publish now, these rows will stay out of `vehicles` and move into the review queue.
                </p>
              </div>
            )}

            {publishableIncompleteCount > 0 && (
              <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-amber-600" />
                  <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    {publishableIncompleteCount} record{publishableIncompleteCount !== 1 ? 's' : ''} will be queued for review
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  These rows are intentionally excluded from the main blocking queue above. Save branch mappings now if you have them, or publish and update the remaining fields later from the review queue.
                </p>
                {selectedBulkIncompleteTarget && (
                  <div className="mb-3 rounded-md border border-amber-500/20 bg-background/70 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1 min-w-[180px]">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400" htmlFor="bulk-incomplete-field">
                          Bulk fill missing field
                        </label>
                        <select
                          id="bulk-incomplete-field"
                          aria-label="Bulk incomplete field"
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                          value={selectedBulkIncompleteTarget.key}
                          onChange={(event) => {
                            setBulkIncompleteField(event.target.value as BulkIncompleteFieldKey);
                            setBulkIncompleteValue('');
                          }}
                        >
                          {bulkIncompleteTargets.map(option => (
                            <option key={option.key} value={option.key}>
                              {option.label} ({option.rowNumbers.length})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1 flex-1 min-w-[220px]">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400" htmlFor="bulk-incomplete-value">
                          Value
                        </label>
                        <Input
                          id="bulk-incomplete-value"
                          aria-label="Bulk incomplete value"
                          className="h-8 text-xs bg-background"
                          placeholder={selectedBulkIncompleteTarget.placeholder}
                          value={bulkIncompleteValue}
                          onChange={(event) => setBulkIncompleteValue(event.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!bulkIncompleteValue.trim() || isPreviewValidating || selectedBulkIncompleteRowNumbers.length === 0}
                        onClick={handleBulkApplyIncompleteField}
                      >
                        Apply to {selectedBulkIncompleteRowNumbers.length} selected row{selectedBulkIncompleteRowNumbers.length !== 1 ? 's' : ''}
                      </Button>
                    </div>
                    <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Batch edit rows with missing {selectedBulkIncompleteTarget.label.toLowerCase()}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleSetBulkIncompleteSelection(selectedBulkIncompleteTarget.rowNumbers)}
                          >
                            Select all
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleSetBulkIncompleteSelection([])}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {selectableBulkIncompleteRows.map((row) => {
                          const isSelected = selectedBulkIncompleteRowNumbers.includes(row.row_number);

                          return (
                            <label
                              key={`bulk-incomplete-${selectedBulkIncompleteTarget.key}-${row.row_number}`}
                              className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${isSelected ? 'border-amber-500/30 bg-background' : 'border-transparent bg-transparent text-muted-foreground'}`}
                            >
                              <input
                                type="checkbox"
                                className="rounded border-input"
                                aria-label={`Select row ${row.row_number} for batch edit`}
                                checked={isSelected}
                                onChange={(event) => handleToggleBulkIncompleteRow(row.row_number, event.target.checked)}
                              />
                              <span className="font-mono">Row {row.row_number}</span>
                              <span className="text-foreground">{row.chassis_no || 'Missing chassis number'}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Applies only to the selected rows in this incomplete queue that are currently missing the selected field.
                    </p>
                  </div>
                )}
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {publishableIncompleteRows.map((row) => (
                    <div key={row.id} className="rounded bg-amber-500/5 p-2 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-muted-foreground">Row {row.row_number}</span>
                        <span className="font-medium text-foreground">{row.chassis_no || 'Missing chassis number'}</span>
                      </div>
                      <div className="space-y-1">
                        {(publishableIncompleteReasonsByRow.get(row.row_number) ?? []).map((message) => (
                          <div key={`${row.id}-${message}`} className="flex items-start gap-2">
                            <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0 mt-0.5" />
                            <span className="text-foreground">{message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Missing reference data (branch not in system) → propose to add ── */}
            {unknownBranchCodes.length > 0 && (
              <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <PlusCircle className="h-4 w-4 text-amber-600" />
                  <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Unknown branch codes — add mappings or send to review
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  These branch codes were not found in the system. You can add a canonical mapping now, or skip and the affected records will move into the review queue until updated.
                </p>
                <div className="space-y-2">
                  {unknownBranchCodes.map(rawCode => (
                    <div key={rawCode} className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-foreground min-w-[80px]">{rawCode}</span>
                      {savedBranchMappings.has(rawCode) ? (
                        <div className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Mapping saved — will be applied on publish
                        </div>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">→</span>
                          <Input
                            className="h-7 text-xs flex-1 max-w-[200px]"
                            placeholder="Canonical branch code…"
                            value={branchMappingInputs[rawCode] ?? ''}
                            onChange={e => setBranchMappingInputs(prev => ({ ...prev, [rawCode]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={!branchMappingInputs[rawCode]?.trim() || savingBranch === rawCode}
                            onClick={() => handleSaveBranchMapping(rawCode)}
                          >
                            {savingBranch === rawCode ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add Mapping'}
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Missing real-world data (salesman, customer, etc.) → mark incomplete ── */}
            {incompleteErrors.length > 0 && (
              <div className="mb-4 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-yellow-600" />
                  <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                    {incompleteRowNums.length} record{incompleteRowNums.length !== 1 ? 's' : ''} missing data — will be queued for review
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  The fields below require real-world data (e.g. salesman name, customer name) that cannot be added automatically. These records will stay out of `vehicles` until the missing fields are completed in the review queue.
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {incompleteErrors.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-1.5 rounded bg-yellow-500/5 text-xs">
                      <AlertTriangle className="h-3 w-3 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{error.message}</span>
                      <span className="ml-auto text-muted-foreground font-mono text-[10px] whitespace-nowrap">needs update</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Client-side data quality issues (duplicates, etc.) ── */}
            {warningValidationIssues.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Data Quality Issues</h4>
                <div className="space-y-1 max-h-36 overflow-y-auto p-3 rounded-md bg-secondary/30">
                  {warningValidationIssues.map(issue => (
                    <div key={issue.id} className="flex items-center gap-2 p-2 rounded bg-secondary/50 text-xs">
                      <AlertTriangle className={`h-3 w-3 flex-shrink-0 ${issue.severity === 'error' ? 'text-destructive' : 'text-warning'}`} />
                      <span className="text-foreground truncate">{issue.message}</span>
                      <StatusBadge status={issue.issueType} className="ml-auto flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Warnings (date order, unusual payment, etc.) ── */}
            {serverErrors.filter(e => e.severity === 'warning').length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Warnings</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto p-3 rounded-md bg-secondary/30">
                  {serverErrors.filter(e => e.severity === 'warning' && !INCOMPLETE_WARNING_CODES.includes(e.code)).map((error, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded bg-secondary/50 text-xs">
                      <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{error.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Summary stats ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-foreground">{rawRows.length}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-success">
                  {Math.max(rawRows.length - blockedRowNums.size - publishableIncompleteCount, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Clean</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-amber-500">{publishableIncompleteCount}</p>
                <p className="text-xs text-muted-foreground">Review</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-destructive">{blockedRowNums.size}</p>
                <p className="text-xs text-muted-foreground">Blocking</p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handlePublish}
                disabled={missingCols.length > 0 || isPreviewValidating || step === 'publishing'}
              >
                <CheckCircle className="h-4 w-4 mr-1" />{publishLabel}
              </Button>
              <Button variant="outline" onClick={reset}>Cancel</Button>
            </div>

            {/* View all errors in detail */}
            {serverErrors.length > 0 && (
              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={() => setShowErrorModal(true)}>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  View {serverErrors.length} validation issue{serverErrors.length !== 1 ? 's' : ''} in detail
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Validation Error Summary Modal */}
      <ValidationSummaryModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        errors={serverErrors}
        fileName={fileName}
        totalRows={rawRows.length}
        onExport={handleExportErrors}
      />

      {step === 'publishing' && (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-foreground font-medium">Publishing clean rows and queueing review rows...</p>
          <p className="text-sm text-muted-foreground mt-1">Resolving clean data, storing review rows, and refreshing snapshots</p>
        </div>
      )}

      {step === 'done' && (
        <div className="glass-panel p-12 text-center">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <p className="text-foreground font-semibold text-lg mb-1">
            {lastPublishSummary?.status === 'review_pending'
              ? 'Rows Queued For Review'
              : lastPublishSummary?.status === 'published'
                ? 'Import Published Successfully'
                : 'Import Processed Successfully'}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            {lastPublishSummary?.status === 'review_pending'
              ? 'No clean rows were inserted. The queued rows are waiting in the review queue.'
              : 'Clean rows have been published and dashboard snapshots have been refreshed.'}
          </p>
          {lastPublishSummary?.reviewRows ? (
            <div className="mb-6 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-700 dark:text-yellow-400 max-w-md mx-auto">
              <Info className="h-4 w-4 inline mr-1" />
              {lastPublishSummary.reviewRows} record{lastPublishSummary.reviewRows !== 1 ? 's were' : ' was'} queued for review and kept out of `vehicles` until resolved.
            </div>
          ) : null}
          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Import Another</Button>
            <Button variant="outline" onClick={() => navigate('/auto-aging')}>View Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
