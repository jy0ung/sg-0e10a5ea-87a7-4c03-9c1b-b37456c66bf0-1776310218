import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Download, X, Filter, ArrowUpDown } from 'lucide-react';
import type { ValidationError } from '@/types';

interface ValidationSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: ValidationError[];
  fileName: string;
  totalRows: number;
  onExport?: () => void;
}

type SortField = 'severity' | 'field' | 'code' | 'message';
type SortOrder = 'asc' | 'desc';

export function ValidationSummaryModal({
  isOpen,
  onClose,
  errors,
  fileName,
  totalRows,
  onExport,
}: ValidationSummaryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [sortField, setSortField] = useState<SortField>('severity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Filter and sort errors
  const filteredErrors = useMemo(() => {
    let result = errors;

    // Filter by severity
    if (severityFilter !== 'all') {
      result = result.filter(e => e.severity === severityFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.field.toLowerCase().includes(query) ||
        e.message.toLowerCase().includes(query) ||
        e.code.toLowerCase().includes(query)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'severity':
          comparison = a.severity.localeCompare(b.severity);
          break;
        case 'field':
          comparison = a.field.localeCompare(b.field);
          break;
        case 'code':
          comparison = a.code.localeCompare(b.code);
          break;
        case 'message':
          comparison = a.message.localeCompare(b.message);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [errors, severityFilter, searchQuery, sortField, sortOrder]);

  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSeverityIcon = (severity: string) => {
    return severity === 'error' ? (
      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
    );
  };

  const getSeverityBadge = (severity: string) => {
    return severity === 'error' ? (
      <Badge variant="destructive" className="text-xs">Error</Badge>
    ) : (
      <Badge variant="warning" className="text-xs bg-warning/15 text-warning border-warning/20">Warning</Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <div>
                <DialogTitle className="text-xl">Validation Errors</DialogTitle>
                <DialogDescription className="mt-1">
                  {fileName} - {filteredErrors.length} of {totalRows} rows have issues
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 pb-4 border-b">
          <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-2xl font-bold text-destructive">{errorCount}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-2xl font-bold text-warning">{warningCount}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50 border">
            <p className="text-2xl font-bold text-foreground">{totalRows - filteredErrors.length}</p>
            <p className="text-xs text-muted-foreground">Valid</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="flex items-center gap-2 flex-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by field, message, or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <Select value={severityFilter} onValueChange={(v: 'all' | 'error' | 'warning') => setSeverityFilter(v)}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="error">Errors Only</SelectItem>
              <SelectItem value="warning">Warnings Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Errors List */}
        <div className="flex-1 overflow-auto min-h-0">
          {filteredErrors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-3 opacity-20" />
              <p>No validation errors found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredErrors.map((error, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  {getSeverityIcon(error.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground text-sm">{error.field}</span>
                      {getSeverityBadge(error.severity)}
                      <Badge variant="outline" className="text-xs font-mono">
                        {error.code}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{error.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {filteredErrors.length} of {errors.length} issues
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mr-4">
              <span>Sort by:</span>
              <Select value={sortField} onValueChange={(v: SortField) => setSortField(v)}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="severity">Severity</SelectItem>
                  <SelectItem value="field">Field</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                  <SelectItem value="message">Message</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => toggleSort(sortField)}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}