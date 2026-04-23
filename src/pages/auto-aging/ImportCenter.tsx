import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ValidationSummaryModal } from '@/components/shared/ValidationSummaryModal';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, AlertCircle, Info, PlusCircle } from 'lucide-react';
import { parseWorkbook, publishCanonical } from '@/lib/import-parser';
import { loadBranchMappingLookup, loadPaymentMappingLookup, createBranchMapping } from '@/services/mappingService';
import { validateVehicleImportBatch } from '@/services/validationService';
import { createImportBatch, commitImportBatch } from '@/services/importService';
import { resolveNamesToIds } from '@/services/hrmsService';
import type { ImportBatchInsert, VehicleRaw, ValidationError } from '@/types';
import { loggingService } from '@/services/loggingService';

type Step = 'upload' | 'validating' | 'review' | 'publishing' | 'done';

export default function ImportCenter() {
  const navigate = useNavigate();
  const { addImportBatch, updateImportBatch, setVehicles, addQualityIssues, refreshKpis, vehicles, user } = useData();
  const { toast } = useToast();
  const companyId = useCompanyId();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<VehicleRaw[]>([]);
  const [validationIssues, setValidationIssues] = useState<{ id: string; chassisNo: string; field: string; issueType: string; message: string; severity: string; importBatchId: string }[]>([]);
  const [serverErrors, setServerErrors] = useState<ValidationError[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [batchId, setBatchId] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [validationProgress, setValidationProgress] = useState({ processed: 0, total: 0 });

  // Branch-mapping proposal: rawCode → user-entered canonical value
  const [branchMappingInputs, setBranchMappingInputs] = useState<Record<string, string>>({});
  const [savedBranchMappings, setSavedBranchMappings] = useState<Set<string>>(new Set());
  const [savingBranch, setSavingBranch] = useState<string | null>(null);

  // ─── Error classification helpers ────────────────────────────────────────────
  // Hard blockers: rows that genuinely cannot be published
  const HARD_BLOCKER_CODES = ['DUPLICATE_CHASSIS', 'CHASSIS_TOO_SHORT'];
  const HARD_BLOCKER_FIELDS = ['chassis_no']; // for REQUIRED_FIELD_MISSING

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
    e => e.severity === 'error' &&
      !HARD_BLOCKER_CODES.includes(e.code) &&
      !(e.code === 'REQUIRED_FIELD_MISSING' && HARD_BLOCKER_FIELDS.includes(e.field)) &&
      e.code !== 'INVALID_BRANCH_CODE'
  );

  // Count rows affected by incomplete data (deduplicate by row number)
  const incompleteRowNums = [...new Set(incompleteErrors.map(e => e.rowNumber).filter(Boolean))];

  // Count unique rows affected by hard-blocker issues (will be skipped on publish).
  // publishCanonical already filters chassis-less rows and dedupes duplicates, so
  // these rows do not break the publish RPC — they are simply excluded.
  const hardBlockerRowNums = [...new Set(hardBlockers.map(e => e.rowNumber).filter(Boolean))];

  // Only a structurally-broken file (missing required columns) truly blocks publish.
  // Per-row hard blockers (duplicate / too-short / missing chassis) are skipped during
  // canonicalisation, so we let the user proceed and clearly disclose how many rows
  // will be excluded.
  const hasHardErrors = missingCols.length > 0;
  const skippedRowCount = hardBlockerRowNums.length;

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

  const handleFileDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!companyId) {
      toast({
        title: 'Import unavailable',
        description: 'Your user profile does not have a company assigned.',
        variant: 'destructive',
      });
      return;
    }
    setFileName(file.name);
    setValidationProgress({ processed: 0, total: 0 });
    setStep('validating');

    try {
      // Parse the workbook
      const buffer = await file.arrayBuffer();
      const { rows, issues, missingColumns } = parseWorkbook(buffer);

      setMissingCols(missingColumns);

      // Server-side validation
      const validationResult = await validateVehicleImportBatch(
        rows,
        companyId,
        (processed, total) => setValidationProgress({ processed, total })
      );

      // Always create the batch record in DB first so we get a real UUID.
      // Validation errors can appear multiple times per row (one per offending
      // field), so count unique row numbers — not raw error count — to derive
      // validRows. And stay in the 'validated' state even when errors exist:
      // the user decides whether to publish. 'failed' is reserved for a
      // publish step that actually throws.
      const errorRowNumbers = new Set(
        validationResult.errors.map(e => e.rowNumber).filter((n): n is number => typeof n === 'number')
      );
      const errorRowCount = errorRowNumbers.size;
      const batch: ImportBatchInsert = {
        fileName: file.name,
        uploadedBy: user?.email || 'Unknown',
        uploadedAt: new Date().toISOString(),
        status: 'validated',
        totalRows: rows.length,
        validRows: Math.max(0, rows.length - errorRowCount),
        errorRows: errorRowCount,
        duplicateRows: issues.filter(i => i.issueType === 'duplicate').length,
        companyId,
      };

      const { data: batchData, error: batchError } = await createImportBatch(batch, user?.id || 'system-user');

      if (batchError) {
        throw new Error(`Failed to create import batch: ${batchError.message}`);
      }

      const id = batchData?.id ?? '';
      if (!id) throw new Error('Import batch created but no ID returned');
      setBatchId(id);
      setRawRows(rows);
      setValidationIssues(issues);
      setServerErrors(validationResult.isValid ? validationResult.warnings : validationResult.errors);
      addImportBatch({ ...batch, id });
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
    if (hasHardErrors) {
      return; // button is disabled, but guard anyway
    }
    setStep('publishing');
    updateImportBatch(batchId, { status: 'publish_in_progress' });

    try {
      // Resolve canonical rows + per-row quality issues up front; we need both the
      // shaped vehicles for the RPC and the canonical data for the UI cache.
      const allNames = [...new Set(rawRows.map(r => r.salesman_name).filter((n): n is string => Boolean(n)))];
      const [branchMap, paymentMap, nameToIdMap] = await Promise.all([
        loadBranchMappingLookup(companyId),
        loadPaymentMappingLookup(companyId),
        resolveNamesToIds(companyId, allNames),
      ]);
      const { canonical, issues: canonicalIssues } = publishCanonical(rawRows, branchMap, paymentMap, nameToIdMap);

      // Combine batch-level validation issues with per-row canonical issues
      // and send them to the transactional commit RPC.
      const combinedIssues = [
        ...validationIssues.map(i => ({
          chassisNo: i.chassisNo,
          field: i.field,
          issueType: i.issueType,
          message: i.message,
          severity: i.severity,
        })),
        ...canonicalIssues.map(i => ({
          chassisNo: i.chassisNo,
          field: i.field,
          issueType: i.issueType,
          message: i.message,
          severity: i.severity,
        })),
      ];

      // Single transactional call: vehicles upsert + quality_issues insert + batch finalize.
      // If any step fails the whole batch rolls back — no orphaned rows.
      const result = await commitImportBatch(
        rawRows,
        batchId,
        companyId,
        combinedIssues,
        user?.id || 'system-user',
      );

      if (result.error) {
        throw new Error(`Commit failed: ${result.error.message}`);
      }

      // Refresh local caches with the canonical rows now that the DB is consistent.
      const existingNonDup = vehicles.filter(v => !canonical.find(c => c.chassis_no === v.chassis_no));
      await setVehicles([...canonical, ...existingNonDup]);
      addQualityIssues([...validationIssues, ...canonicalIssues]);
      // Reflect the DB-finalized state in the UI cache (the RPC already persisted it).
      updateImportBatch(batchId, {
        status: 'published',
        publishedAt: new Date().toISOString(),
        validRows: result.inserted,
        errorRows: combinedIssues.filter(i => i.severity === 'error').length,
      });
      refreshKpis();
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
  }, [batchId, rawRows, vehicles, updateImportBatch, setVehicles, addQualityIssues, refreshKpis, validationIssues, hasHardErrors, companyId, user]);

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
    setValidationIssues([]); 
    setServerErrors([]); 
    setMissingCols([]); 
    setBranchMappingInputs({});
    setSavedBranchMappings(new Set());
  };

  const publishableRowCount = Math.max(0, rawRows.length - skippedRowCount);
  const labelParts: string[] = [];
  if (skippedRowCount > 0) labelParts.push(`${skippedRowCount} skipped`);
  if (incompleteRowNums.length > 0) labelParts.push(`${incompleteRowNums.length} incomplete`);
  const publishLabel = labelParts.length > 0
    ? `Publish ${publishableRowCount} row${publishableRowCount !== 1 ? 's' : ''} (${labelParts.join(', ')})`
    : 'Publish Canonical Data';

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Center"
        description="Upload and process vehicle data workbooks"
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
            Mobile-safe file picker:
            - The <input> is `sr-only` (kept in layout & a11y tree). iOS/Android
              browsers refuse to open the picker from a `display:none` input.
            - Avoid the legacy <label> wrapping: nesting an interactive <button>
              inside <label> is invalid HTML and on iOS Safari the synthetic
              click on the label cancels the button's programmatic
              `input.click()`. Use an htmlFor-only label as the visual surface
              instead.
          */}
          <input
            id="import-file-input"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileDrop}
            className="sr-only"
          />
          <label
            htmlFor="import-file-input"
            className="block cursor-pointer border-2 border-dashed border-border rounded-lg p-8 sm:p-12 hover:border-primary/50 transition-colors"
          >
            <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">Tap to choose a workbook</p>
            <p className="text-sm text-muted-foreground mb-4">Supports .xlsx and .xls files with a "Combine Data" sheet</p>
            <span
              role="button"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow hover:bg-primary/90"
            >
              <Upload className="h-4 w-4" />Browse files
            </span>
          </label>
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
              'Required fields — chassis no, branch, model, customer, salesman, payment method',
              'Chassis number format (min 5 chars) & duplicate check against existing vehicles',
              'Branch code — must exist in your company\'s branch records',
              'Date fields — valid format across 9 date columns',
              'Date order — e.g. shipment ETD must not precede BG date',
              'Transfer price — must be a valid number',
              'Payment method — flags unusual values as warnings',
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
            {/* These rows are skipped — not blocked. publishCanonical drops chassis-less rows
                and de-duplicates by chassis, so the publish RPC accepts the remaining rows. */}
            {hardBlockers.length > 0 && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <h4 className="text-sm font-semibold text-destructive">
                    {skippedRowCount} row{skippedRowCount !== 1 ? 's' : ''} will be skipped — duplicate, too-short, or missing chassis number
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  These rows cannot be uniquely identified, so they are excluded from the publish.
                  All other valid rows in the file will still be published.
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {hardBlockers.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded bg-destructive/5 text-xs">
                      <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{error.message}</span>
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
                    Unknown branch codes — add mappings or publish as incomplete
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  These branch codes were not found in the system. You can add a canonical mapping now, or skip and the affected records will be published as <span className="font-medium">incomplete</span> and excluded from statistics until updated.
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
                    {incompleteRowNums.length} record{incompleteRowNums.length !== 1 ? 's' : ''} missing data — will be published as incomplete
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  The fields below require real-world data (e.g. salesman name, customer name) that cannot be added automatically. These records will be published with a <span className="font-medium">"Pending"</span> placeholder and will <span className="font-medium">not count towards statistical analysis</span> until the missing fields are updated.
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
            {validationIssues.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Data Quality Issues</h4>
                <div className="space-y-1 max-h-36 overflow-y-auto p-3 rounded-md bg-secondary/30">
                  {validationIssues.map(issue => (
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
                  {serverErrors.filter(e => e.severity === 'warning').map((error, idx) => (
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
                  {Math.max(0, rawRows.length - skippedRowCount - incompleteRowNums.length)}
                </p>
                <p className="text-xs text-muted-foreground">Clean</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-amber-500">{incompleteRowNums.length}</p>
                <p className="text-xs text-muted-foreground">Incomplete</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-destructive">{skippedRowCount}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={handlePublish} disabled={hasHardErrors || step === 'publishing'}>
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
          <p className="text-foreground font-medium">Publishing canonical data...</p>
          <p className="text-sm text-muted-foreground mt-1">Resolving duplicates, computing KPIs, and refreshing snapshots</p>
        </div>
      )}

      {step === 'done' && (
        <div className="glass-panel p-12 text-center">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <p className="text-foreground font-semibold text-lg mb-1">Import Published Successfully</p>
          <p className="text-sm text-muted-foreground mb-6">Dashboard snapshots have been refreshed with the latest data.</p>
          {incompleteRowNums.length > 0 && (
            <div className="mb-6 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-700 dark:text-yellow-400 max-w-md mx-auto">
              <Info className="h-4 w-4 inline mr-1" />
              {incompleteRowNums.length} record{incompleteRowNums.length !== 1 ? 's were' : ' was'} published as incomplete and excluded from statistics. Update the missing fields in the Vehicle Explorer to include them.
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Import Another</Button>
            <Button variant="outline" onClick={() => navigate('/auto-aging')}>View Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
