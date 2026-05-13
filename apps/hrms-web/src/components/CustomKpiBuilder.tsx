import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import {
  CUSTOM_KPI_AGGREGATION_LABELS,
  CUSTOM_KPI_FIELD_CATALOG,
  CUSTOM_KPI_OPERATOR_LABELS,
  CUSTOM_KPI_PRESETS,
  CUSTOM_KPI_SOURCE_LABELS,
  DEFAULT_CUSTOM_KPI_FORMULA,
  type CustomKpiAggregation,
  type CustomKpiFilter,
  type CustomKpiFormat,
  type CustomKpiFormula,
  type CustomKpiOperator,
  type CustomKpiSource,
  type CustomKpiTarget,
} from '@/lib/customKpiFormula';

const AGGREGATIONS: CustomKpiAggregation[] = ['count', 'sum', 'avg', 'min', 'max', 'median'];
const OPERATORS: CustomKpiOperator[] = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'is_null', 'is_not_null',
];
const FORMATS: CustomKpiFormat[] = ['number', 'currency', 'percent', 'days'];
const SOURCES: CustomKpiSource[] = ['vehicles', 'sales_orders', 'customers', 'kpi_summaries'];

export interface CustomKpiBuilderProps {
  /** Called when the user clicks "Add to dashboard" with a finalized formula. */
  onAdd: (title: string, formula: CustomKpiFormula) => void;
}

/**
 * Inline form that lets a user assemble a KPI formula from the field catalog
 * and either start from a preset or build from scratch. Never uses eval.
 */
export function CustomKpiBuilder({ onAdd }: CustomKpiBuilderProps) {
  const [title, setTitle] = useState('');
  const [formula, setFormula] = useState<CustomKpiFormula>(DEFAULT_CUSTOM_KPI_FORMULA);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fieldCatalog = CUSTOM_KPI_FIELD_CATALOG[formula.source];
  const numericFields = useMemo(() => fieldCatalog.filter(f => f.kind === 'number'), [fieldCatalog]);
  const groupableFields = useMemo(() => fieldCatalog.filter(f => f.kind === 'string'), [fieldCatalog]);
  const needsField = formula.aggregation !== 'count';

  const loadPreset = (presetId: string) => {
    const preset = CUSTOM_KPI_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setTitle(preset.title);
    setFormula(preset.formula);
  };

  const setSource = (source: CustomKpiSource) => {
    // Reset field selections because the catalog changed.
    setFormula({ ...DEFAULT_CUSTOM_KPI_FORMULA, source, aggregation: 'count', filters: [] });
  };

  const setAggregation = (aggregation: CustomKpiAggregation) => {
    setFormula(prev => {
      const next: CustomKpiFormula = { ...prev, aggregation };
      if (aggregation !== 'count' && !next.field) {
        next.field = CUSTOM_KPI_FIELD_CATALOG[prev.source].find(f => f.kind === 'number')?.key;
      }
      return next;
    });
  };

  const addFilter = () => {
    const firstField = fieldCatalog[0]?.key;
    if (!firstField) return;
    setFormula(prev => ({
      ...prev,
      filters: [...prev.filters, { field: firstField, operator: 'eq', value: '' }],
    }));
  };

  const updateFilter = (index: number, patch: Partial<CustomKpiFilter>) => {
    setFormula(prev => ({
      ...prev,
      filters: prev.filters.map((f, i) => i === index ? { ...f, ...patch } : f),
    }));
  };

  const removeFilter = (index: number) => {
    setFormula(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== index) }));
  };

  const setTarget = (patch: Partial<CustomKpiTarget> | null) => {
    setFormula(prev => {
      if (patch === null) return { ...prev, target: undefined };
      const base: CustomKpiTarget = prev.target ?? { value: 0, comparison: 'gte' };
      return { ...prev, target: { ...base, ...patch } };
    });
  };

  const canSubmit = Boolean(
    title.trim()
    && formula.source
    && formula.aggregation
    && (!needsField || formula.field),
  );

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd(title.trim(), formula);
    setTitle('');
    setFormula(DEFAULT_CUSTOM_KPI_FORMULA);
  };

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border/70 p-4 bg-secondary/20">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Build your own KPI</p>
          <p className="text-xs text-muted-foreground">Pick a data source, filter rows, choose how to aggregate them, and optionally set a target.</p>
        </div>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <Label htmlFor="kpi-preset">Start from a preset (optional)</Label>
        <Select onValueChange={loadPreset}>
          <SelectTrigger id="kpi-preset">
            <SelectValue placeholder="Choose a preset to pre-fill the form" />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_KPI_PRESETS.map(preset => (
              <SelectItem key={preset.id} value={preset.id}>{preset.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="kpi-title">Card title</Label>
        <Input
          id="kpi-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Monthly booking target"
        />
      </div>

      {/* Source + aggregation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="kpi-source">Data source</Label>
          <Select value={formula.source} onValueChange={(v: CustomKpiSource) => setSource(v)}>
            <SelectTrigger id="kpi-source"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCES.map(source => (
                <SelectItem key={source} value={source}>{CUSTOM_KPI_SOURCE_LABELS[source]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-agg">Aggregation</Label>
          <Select value={formula.aggregation} onValueChange={(v: CustomKpiAggregation) => setAggregation(v)}>
            <SelectTrigger id="kpi-agg"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AGGREGATIONS.map(agg => (
                <SelectItem key={agg} value={agg}>{CUSTOM_KPI_AGGREGATION_LABELS[agg]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-field">Field {needsField ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(ignored for Count)</span>}</Label>
          <Select
            value={formula.field ?? ''}
            onValueChange={v => setFormula(prev => ({ ...prev, field: v }))}
            disabled={!needsField}
          >
            <SelectTrigger id="kpi-field"><SelectValue placeholder="Select field" /></SelectTrigger>
            <SelectContent>
              {numericFields.map(field => (
                <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Filters <span className="text-muted-foreground">(AND)</span></Label>
          <Button type="button" size="sm" variant="ghost" onClick={addFilter}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add filter
          </Button>
        </div>
        {formula.filters.length === 0 && (
          <p className="text-xs text-muted-foreground">No filters — the KPI will consider every row in scope.</p>
        )}
        {formula.filters.map((filter, index) => {
          const needsValue = filter.operator !== 'is_null' && filter.operator !== 'is_not_null';
          return (
            <div key={index} className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_2fr_auto] gap-2 items-center">
              <Select value={filter.field} onValueChange={v => updateFilter(index, { field: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fieldCatalog.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filter.operator} onValueChange={(v: CustomKpiOperator) => updateFilter(index, { operator: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map(op => (
                    <SelectItem key={op} value={op}>{CUSTOM_KPI_OPERATOR_LABELS[op]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={needsValue ? String(filter.value ?? '') : ''}
                onChange={e => updateFilter(index, { value: e.target.value })}
                placeholder={needsValue ? 'Value' : 'n/a'}
                disabled={!needsValue}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeFilter(index)} aria-label="Remove filter">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Group by */}
      <div className={showAdvanced ? '' : 'hidden'}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="kpi-group">Group by (optional)</Label>
          <Select
            value={formula.groupBy ?? '__none__'}
            onValueChange={v => setFormula(prev => ({ ...prev, groupBy: v === '__none__' ? undefined : v }))}
          >
            <SelectTrigger id="kpi-group"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None — single value</SelectItem>
              {groupableFields.map(f => (
                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-sort">Pick group</Label>
          <Select
            value={formula.sort ?? 'desc'}
            onValueChange={(v: 'asc' | 'desc') => setFormula(prev => ({ ...prev, sort: v }))}
            disabled={!formula.groupBy}
          >
            <SelectTrigger id="kpi-sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Highest</SelectItem>
              <SelectItem value="asc">Lowest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-format">Display format</Label>
          <Select value={formula.format} onValueChange={(v: CustomKpiFormat) => setFormula(prev => ({ ...prev, format: v }))}>
            <SelectTrigger id="kpi-format"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMATS.map(format => (
                <SelectItem key={format} value={format}>{format}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Target */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Target (optional)</Label>
          {formula.target && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setTarget(null)}>Clear</Button>
          )}
        </div>
        {formula.target ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select
              value={formula.target.comparison}
              onValueChange={(v: 'gte' | 'lte') => setTarget({ comparison: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gte">Value should be ≥ target</SelectItem>
                <SelectItem value="lte">Value should be ≤ target</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={formula.target.value}
              onChange={e => setTarget({ value: Number(e.target.value) })}
              placeholder="Target value"
            />
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setTarget({})}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add target
          </Button>
        )}
      </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(v => !v)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
          {showAdvanced ? 'Hide advanced options' : 'Advanced options (group, format, target)'}
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          <Sparkles className="h-4 w-4 mr-1.5" />Add to dashboard
        </Button>
      </div>
    </div>
  );
}
