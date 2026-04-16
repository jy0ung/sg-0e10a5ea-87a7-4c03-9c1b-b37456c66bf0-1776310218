import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ValidationSummaryModal } from '@/components/shared/ValidationSummaryModal';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, AlertCircle } from 'lucide-react';
import { parseWorkbook, publishCanonical } from '@/lib/import-parser';
import { validateVehicleImportBatch, validateImportBatch } from '@/services/validationService';
import { createImportBatch, validateAndInsertVehicles } from '@/services/importService';
import type { ImportBatchInsert, VehicleRaw, ValidationError } from '@/types';

type Step = 'upload' | 'validating' | 'review' | 'publishing' | 'done';

export default function ImportCenter() {
  const navigate = useNavigate();
  const { addImportBatch, updateImportBatch, setVehicles, addQualityIssues, refreshKpis, vehicles, user } = useData();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<VehicleRaw[]>([]);
  const [validationIssues, setValidationIssues] = useState<{ id: string; chassisNo: string; field: string; issueType: string; message: string; severity: string; importBatchId: string }[]>([]);
  const [serverErrors, setServerErrors] = useState<ValidationError[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [batchId, setBatchId] = useState('');
  const [companyId, setCompanyId] = useState('default-company');
  const [showErrorModal, setShowErrorModal] = useState(false);

  const handleFileDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('validating');

    try {
      // Parse the workbook
      const buffer = await file.arrayBuffer();
      const { rows, issues, missingColumns } = parseWorkbook(buffer);

      setMissingCols(missingColumns);

      // Server-side validation
      const validationResult = await validateVehicleImportBatch(rows, companyId);

      if (!validationResult.isValid) {
        setRawRows(rows);
        setValidationIssues(issues);
        setServerErrors(validationResult.errors);
        setBatchId(`batch-${Date.now()}`);
        setStep('review');
        return;
      }

      // Create import batch
      const batch: ImportBatchInsert = {
        fileName: file.name,
        uploadedBy: user?.email || 'Unknown',
        uploadedAt: new Date().toISOString(),
        status: 'validated',
        totalRows: rows.length,
        validRows: rows.length - validationResult.errors.length,
        errorRows: validationResult.errors.length,
        duplicateRows: issues.filter(i => i.issueType === 'duplicate').length,
        companyId,
      };

      const { data: batchData, error: batchError } = await createImportBatch(batch, user?.id || 'system-user');

      if (batchError) {
        throw new Error(`Failed to create import batch: ${batchError.message}`);
      }

      const id = batchData?.id || `batch-${Date.now()}`;
      setBatchId(id);
      setRawRows(rows);
      setValidationIssues(issues);
      setServerErrors(validationResult.warnings);
      addImportBatch({ ...batch, id });
      setStep('review');
    } catch (error) {
      console.error('Import error:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStep('upload');
    }
  }, [addImportBatch, companyId, user]);

  const handlePublish = useCallback(async () => {
    if (serverErrors.length > 0) {
      alert('Please fix all validation errors before publishing.');
      return;
    }

    setStep('publishing');
    updateImportBatch(batchId, { status: 'publish_in_progress' });

    try {
      // Validate and insert vehicles server-side
      const result = await validateAndInsertVehicles(
        rawRows,
        batchId,
        companyId,
        user?.id || 'system-user'
      );

      if (result.error) {
        throw new Error(`Validation or insert failed: ${result.error.message}`);
      }

      // Publish canonical data to UI
      const { canonical, issues } = publishCanonical(rawRows);
      const existingNonDup = vehicles.filter(v => !canonical.find(c => c.chassis_no === v.chassis_no));
      await setVehicles([...canonical, ...existingNonDup]);
      addQualityIssues([...validationIssues, ...issues]);
      updateImportBatch(batchId, { 
        status: 'published', 
        publishedAt: new Date().toISOString(),
        validRows: result.inserted,
        errorRows: result.errors.length
      });
      refreshKpis();
      setStep('done');
    } catch (error) {
      console.error('Publish error:', error);
      alert(`Publish failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      updateImportBatch(batchId, { status: 'failed' });
      setStep('review');
    }
  }, [batchId, rawRows, vehicles, updateImportBatch, setVehicles, addQualityIssues, refreshKpis, validationIssues, serverErrors, companyId, user]);

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
  };

  const hasErrors = serverErrors.filter(e => e.severity === 'error').length > 0;

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
        <div className="glass-panel p-12 text-center">
          <label className="cursor-pointer block">
            <input type="file" accept=".xlsx,.xls" onChange={handleFileDrop} className="hidden" />
            <div className="border-2 border-dashed border-border rounded-lg p-12 hover:border-primary/50 transition-colors">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-medium mb-1">Drop your workbook here or click to browse</p>
              <p className="text-sm text-muted-foreground">Supports .xlsx and .xls files with a "Combine Data" sheet</p>
            </div>
          </label>
        </div>
      )}

      {step === 'validating' && (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-foreground font-medium">Validating {fileName}...</p>
          <p className="text-sm text-muted-foreground mt-1">Running server-side schema validation and data integrity checks</p>
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

            {missingCols.length > 0 && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-4">
                <p className="text-sm text-destructive font-medium">Missing required columns: {missingCols.join(', ')}</p>
              </div>
            )}

            {/* Server-side validation errors */}
            {serverErrors.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Server-Side Validation Errors</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto p-3 rounded-md bg-destructive/5 border border-destructive/10">
                  {serverErrors.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded bg-secondary/30">
                      <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${error.severity === 'error' ? 'text-destructive' : 'text-warning'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{error.message}</p>
                        <p className="text-xs text-muted-foreground">Field: {error.field} | Code: {error.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Client-side validation issues */}
            {validationIssues.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Data Quality Issues</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto p-3 rounded-md bg-secondary/30">
                  {validationIssues.map(issue => (
                    <div key={issue.id} className="flex items-center gap-2 p-2 rounded bg-secondary/50 text-xs">
                      {issue.severity === 'error' ? <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" /> : <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0" />}
                      <span className="text-foreground truncate">{issue.message}</span>
                      <StatusBadge status={issue.issueType} className="ml-auto flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-foreground">{rawRows.length}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-success">{rawRows.length - serverErrors.filter(e => e.severity === 'error').length}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-destructive">{serverErrors.filter(e => e.severity === 'error').length}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-warning">{serverErrors.filter(e => e.severity === 'warning').length + validationIssues.filter(i => i.issueType === 'duplicate').length}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handlePublish} disabled={hasErrors || missingCols.length > 0}>
                <CheckCircle className="h-4 w-4 mr-1" />Publish Canonical Data
              </Button>
              <Button variant="outline" onClick={reset}>Cancel</Button>
            </div>

            {/* View Detailed Errors Button */}
            {serverErrors.length > 0 && (
              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={() => setShowErrorModal(true)}>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  View {serverErrors.length} Validation Errors in Detail
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
          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Import Another</Button>
            <Button variant="outline" onClick={() => navigate('/auto-aging')}>View Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
