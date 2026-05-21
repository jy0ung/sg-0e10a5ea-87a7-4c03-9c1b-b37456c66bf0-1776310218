/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Info,
  Loader2,
  Paperclip,
  Save,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { InternalRequestApprovalPlan } from '@/services/requestApprovalService';
import {
  listRequestFieldOptions,
  type DatabaseFieldOption,
  type RequestFieldDataSource,
  type RequestFormFieldRecord,
} from '@/services/requestFormFieldService';
import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestSubcategoryRecord } from '@/services/requestSubcategoryService';
import type { RequestTemplateRecord } from '@/services/requestTemplateService';
import type { AttachmentSettings } from '@/services/ticketAttachmentService';
import type { AppRole } from '@/types';

export const ticketSchema = z.object({
  subject: z.string().min(6, 'Subject must be at least 6 characters'),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  requested_due_date: z.string().optional(),
  desired_outcome: z.string().optional(),
  business_impact: z.string().optional(),
});

export type TicketFormData = z.infer<typeof ticketSchema>;

export const DEFAULT_FORM: TicketFormData = {
  subject: '',
  category: '',
  subcategory: '',
  priority: 'medium',
  description: '',
  requested_due_date: '',
  desired_outcome: '',
  business_impact: '',
};

interface PriorityOption {
  value: TicketFormData['priority'];
  label: string;
  hint: string;
  activeClasses: string;
}

export const PRIORITY_OPTIONS: PriorityOption[] = [
  {
    value: 'low',
    label: 'Low',
    hint: 'Informational - no time pressure',
    activeClasses:
      'bg-slate-100 text-slate-800 border-slate-400 dark:bg-slate-800 dark:text-slate-200',
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Needs attention today',
    activeClasses:
      'bg-amber-50 text-amber-800 border-amber-400 dark:bg-amber-950/40 dark:text-amber-300',
  },
  {
    value: 'high',
    label: 'High',
    hint: 'Urgent - blocking a transaction',
    activeClasses:
      'bg-red-50 text-red-700 border-red-400 dark:bg-red-950/40 dark:text-red-400',
  },
];

const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300',
  high: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400',
};

export interface RoleContext {
  pageTitle: string;
  pageSubtitle: string;
  descriptionPlaceholder: string;
}

export const ROLE_CONTEXT: Partial<Record<AppRole, RoleContext>> = {
  sales: {
    pageTitle: 'New Sales Support Request',
    pageSubtitle:
      'Submit a request for sales, documentation, or customer coordination.',
    descriptionPlaceholder:
      'Include customer name, vehicle model, booking or sales order number, and any other relevant information.',
  },
  accounts: {
    pageTitle: 'New Accounts Support Request',
    pageSubtitle:
      'Submit a request for invoicing, payments, or finance coordination.',
    descriptionPlaceholder:
      'Include the invoice number, payment reference, transaction amount, and any relevant context.',
  },
};

export const DEFAULT_ROLE_CONTEXT: RoleContext = {
  pageTitle: 'New Request',
  pageSubtitle: 'Submit an internal request for review and resolution.',
  descriptionPlaceholder:
    'Describe your request clearly. Provide as much context as possible so the assigned team can respond quickly.',
};

export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

export type ApprovalPlanState = InternalRequestApprovalPlan | null | 'loading' | 'error';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DatabaseFieldSelect({
  companyId,
  field,
  value,
  inputId,
  onChange,
}: {
  companyId?: string;
  field: RequestFormFieldRecord;
  value: string;
  inputId: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DatabaseFieldOption[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    const dataSource = field.data_source;
    if (!companyId || !dataSource) {
      setOptions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    listRequestFieldOptions(companyId, dataSource as RequestFieldDataSource).then((result) => {
      if (cancelled) return;
      setOptions(result.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, field.data_source]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={inputId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {selectedOption?.label ?? (field.placeholder || 'Search and select')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search..." />
          <CommandList>
            <CommandEmpty>{loading ? 'Loading...' : 'No matches found.'}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.description}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{option.label}</p>
                    {option.description && <p className="truncate text-xs text-muted-foreground">{option.description}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface TemplateChooserProps {
  templates: RequestTemplateRecord[];
  categories: RequestCategoryRecord[];
  activeTemplateId: string | null;
  onSelect: (template: RequestTemplateRecord) => void;
  onClear: () => void;
  loading: boolean;
}

export function TemplateChooser({
  templates,
  categories,
  activeTemplateId,
  onSelect,
  onClear,
  loading,
}: TemplateChooserProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.is_active),
    [templates],
  );

  const templateCategories = useMemo(() => {
    const keys = new Set(activeTemplates.map((template) => template.category_key));
    return categories.filter((category) => keys.has(category.key));
  }, [activeTemplates, categories]);

  const filtered = useMemo(() => {
    let list = activeTemplates;
    if (filterCategory !== 'all') list = list.filter((template) => template.category_key === filterCategory);
    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter(
        (template) =>
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.subject.toLowerCase().includes(query),
      );
    }
    return list;
  }, [activeTemplates, filterCategory, search]);

  const getCategoryLabel = (key: string) =>
    categories.find((category) => category.key === key)?.label ?? key;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading templates...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeTemplates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates..."
              aria-label="Search request templates"
              className="h-8 pl-8 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear template search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {templateCategories.length > 1 && (
            <div className="flex flex-wrap gap-1" aria-label="Template category filter">
              <button
                type="button"
                onClick={() => setFilterCategory('all')}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                  filterCategory === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                All
              </button>
              {templateCategories.map((category) => (
                <button
                  type="button"
                  key={category.key}
                  onClick={() => setFilterCategory(category.key)}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                    filterCategory === category.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={cn('grid gap-2', activeTemplates.length > 0 ? 'sm:grid-cols-2' : '')}>
        <button
          type="button"
          onClick={onClear}
          className={cn(
            'rounded-lg border px-3 py-2.5 text-left transition-colors',
            !activeTemplateId
              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
              : 'border-dashed border-border bg-background hover:bg-muted/40',
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                !activeTemplateId
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30',
              )}
            >
              {!activeTemplateId && <Check className="h-3 w-3" />}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Custom request</p>
              <p className="text-xs text-muted-foreground">Fill in the form manually</p>
            </div>
          </div>
        </button>

        {activeTemplates.length === 0 ? null : filtered.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed px-3 py-4">
            <p className="text-xs text-muted-foreground">No templates match your search.</p>
          </div>
        ) : (
          filtered.map((template) => {
            const isSelected = activeTemplateId === template.id;
            return (
              <button
                type="button"
                key={template.id}
                onClick={() => onSelect(template)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          isSelected ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {template.name}
                      </p>
                    </div>
                    {template.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {getCategoryLabel(template.category_key)}
                  </Badge>
                </div>
                <div className="mt-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      PRIORITY_BADGE[template.priority],
                    )}
                  >
                    {template.priority.charAt(0).toUpperCase() + template.priority.slice(1)} priority
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {activeTemplates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No templates are configured yet. Continue filling in the form below.
        </p>
      )}
    </div>
  );
}

export function TemplateChooserSection(props: TemplateChooserProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Choose a template</p>
        <p className="text-xs text-muted-foreground">
          Templates prefill the form fields. Pick one or start with a custom request.
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <TemplateChooser {...props} />
      </CardContent>
    </Card>
  );
}

interface TemplateDropdownProps {
  templates: RequestTemplateRecord[];
  categories: RequestCategoryRecord[];
  activeTemplateId: string | null;
  onSelect: (template: RequestTemplateRecord) => void;
  onClear: () => void;
  loading: boolean;
}

export function TemplateDropdown({
  templates,
  categories,
  activeTemplateId,
  onSelect,
  onClear,
  loading,
}: TemplateDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.is_active),
    [templates],
  );

  const filtered = useMemo(() => {
    let list = activeTemplates;
    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.subject.toLowerCase().includes(query),
      );
    }
    return list;
  }, [activeTemplates, search]);

  const getCategoryLabel = (key: string) =>
    categories.find((c) => c.key === key)?.label ?? key;

  const selectedTemplate = activeTemplates.find((t) => t.id === activeTemplateId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading templates...
      </div>
    );
  }

  if (activeTemplates.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setSearch('');
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal shadow-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText className={cn('h-3.5 w-3.5 shrink-0', selectedTemplate ? 'text-primary' : 'text-muted-foreground')} />
            <span className={cn('truncate', !selectedTemplate && 'text-muted-foreground')}>
              {selectedTemplate ? selectedTemplate.name : 'Custom request'}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search templates..."
          />
          <CommandList>
            <CommandEmpty>No templates found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="custom-request"
                onSelect={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4 shrink-0', !activeTemplateId ? 'opacity-100' : 'opacity-0')} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Custom request</p>
                  <p className="text-xs text-muted-foreground">Fill in the form manually</p>
                </div>
              </CommandItem>
              {filtered.map((template) => (
                <CommandItem
                  key={template.id}
                  value={`${template.name} ${template.description} ${template.subject}`}
                  onSelect={() => {
                    onSelect(template);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', activeTemplateId === template.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{template.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {getCategoryLabel(template.category_key)} · {template.priority}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TemplateSelectorCard({
  templates,
  categories,
  activeTemplateId,
  onSelect,
  onClear,
  loading,
}: TemplateDropdownProps) {
  const activeTemplates = templates.filter((t) => t.is_active);
  const activeTemplate = activeTemplates.find((t) => t.id === activeTemplateId) ?? null;
  const getCategoryLabel = (key: string) =>
    categories.find((c) => c.key === key)?.label ?? key;

  if (!loading && activeTemplates.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Template</p>
            <p className="truncate text-xs text-muted-foreground">
              {loading
                ? 'Loading available templates…'
                : activeTemplate
                  ? `${getCategoryLabel(activeTemplate.category_key)} · ${activeTemplate.priority} priority`
                  : 'Custom request — optionally start from a template'}
            </p>
          </div>
          {activeTemplate && (
            <button
              type="button"
              onClick={onClear}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </CardHeader>
      {loading ? (
        <CardContent className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates…
        </CardContent>
      ) : (
        <CardContent className="p-3">
          <TemplateDropdown
            templates={templates}
            categories={categories}
            activeTemplateId={activeTemplateId}
            onSelect={onSelect}
            onClear={onClear}
            loading={false}
          />
        </CardContent>
      )}
    </Card>
  );
}

function ApprovalFlowPreview({ plan }: { plan: ApprovalPlanState }) {
  if (plan === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking approval route...
      </div>
    );
  }
  if (plan === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>No approval flow configured. Contact an admin before submitting.</span>
      </div>
    );
  }
  if (!plan) {
    return <p className="text-xs text-muted-foreground">No approval required.</p>;
  }
  const stepName =
    plan.firstStepName ??
    (plan.approverRole ? plan.approverRole.replace(/_/g, ' ') : 'Approver');
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">You</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground capitalize">
        {stepName}
      </span>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
        Support Team
      </span>
    </div>
  );
}

interface SummaryPanelProps {
  activeTemplate: RequestTemplateRecord | null;
  categoryLabel: string;
  subcategoryLabel: string | null;
  priority: TicketFormData['priority'];
  attachedFiles: File[];
  approvalPlan: ApprovalPlanState;
}

/** @deprecated Use RequestSummaryCard + ApprovalRouteCard instead. */
export function RequestSummaryPanel({
  activeTemplate,
  categoryLabel,
  subcategoryLabel,
  priority,
  attachedFiles,
  approvalPlan,
}: SummaryPanelProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Request Summary
        </p>
        <div className="space-y-2.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">Template</span>
            <span className="text-right font-medium text-foreground">
              {activeTemplate ? activeTemplate.name : 'Custom'}
            </span>
          </div>
          <Separator />
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">Category</span>
            <span className="text-right font-medium text-foreground">{categoryLabel || '-'}</span>
          </div>
          {subcategoryLabel && (
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">Subcategory</span>
              <span className="text-right font-medium text-foreground">{subcategoryLabel}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">Priority</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                PRIORITY_BADGE[priority],
              )}
            >
              {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </span>
          </div>
          {attachedFiles.length > 0 && (
            <>
              <Separator />
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">Attachments</span>
                <span className="font-medium text-foreground">
                  {attachedFiles.length} file{attachedFiles.length !== 1 ? 's' : ''}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-2.5 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Approval Route
          </p>
        </div>
        <ApprovalFlowPreview plan={approvalPlan} />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Text is saved locally; re-attach files after reload.
      </p>
    </div>
  );
}

// ─── Standalone sidebar components ───────────────────────────────────────────

interface RequestSummaryCardProps {
  activeTemplate: RequestTemplateRecord | null;
  categoryLabel: string;
  subcategoryLabel: string | null;
  priority: TicketFormData['priority'];
  attachedFiles: File[];
  maxFiles: number;
  branchCode?: string | null;
  draftSavedAt?: Date | null;
}

export function RequestSummaryCard({
  activeTemplate,
  categoryLabel,
  subcategoryLabel,
  priority,
  attachedFiles,
  maxFiles,
  branchCode,
  draftSavedAt,
}: RequestSummaryCardProps) {
  const draftLabel = draftSavedAt
    ? `Saved ${draftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Request Summary
      </p>
      <div className="space-y-2.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Template</span>
          <span className="text-right font-medium text-foreground">
            {activeTemplate ? activeTemplate.name : 'Custom'}
          </span>
        </div>
        <Separator />
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Category</span>
          <span className="text-right font-medium text-foreground">{categoryLabel || '—'}</span>
        </div>
        {subcategoryLabel && (
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">Subcategory</span>
            <span className="text-right font-medium text-foreground">{subcategoryLabel}</span>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Priority</span>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              PRIORITY_BADGE[priority],
            )}
          >
            {priority.charAt(0).toUpperCase() + priority.slice(1)}
          </span>
        </div>
        {branchCode && (
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">Branch</span>
            <span className="text-right font-medium text-foreground">{branchCode}</span>
          </div>
        )}
        <Separator />
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Attachments</span>
          <span className="font-medium tabular-nums text-foreground">
            {attachedFiles.length} / {maxFiles}
          </span>
        </div>
        {draftLabel && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5">
            <Save className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Draft {draftLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ApprovalRouteCard({ plan }: { plan: ApprovalPlanState }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Approval Route
        </p>
      </div>
      <ApprovalFlowPreview plan={plan} />
    </div>
  );
}

interface StickySubmitPanelProps {
  canSubmit: boolean;
  submitting: boolean;
  draftSavedLabel?: string | null;
  submitBlocker?: string | null;
}

export function StickySubmitPanel({ canSubmit, submitting, draftSavedLabel, submitBlocker }: StickySubmitPanelProps) {
  return (
    <div className="space-y-2">
      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit Request'
        )}
      </Button>
      {!canSubmit && submitBlocker ? (
        <p className="flex items-start justify-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{submitBlocker}</span>
        </p>
      ) : null}
      {draftSavedLabel ? (
        <div className="space-y-1">
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Save className="h-3 w-3" />
            {draftSavedLabel}
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Text is saved locally; re-attach files after reload.
          </p>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Text is saved locally; re-attach files after reload.
        </p>
      )}
    </div>
  );
}

interface RequestRoutingSectionProps {
  form: UseFormReturn<TicketFormData>;
  categories: RequestCategoryRecord[];
  categoriesLoading: boolean;
  selectedCategoryKey: string;
  selectedCategory: RequestCategoryRecord | null;
  availableSubcategories: RequestSubcategoryRecord[];
  subcategoriesLoading: boolean;
  selectedSubcategoryKey?: string;
  selectedSubcategory: RequestSubcategoryRecord | null;
  selectedPriority: TicketFormData['priority'];
  categorySelectionDisabled: boolean;
  requiresSubcategory: boolean;
}

export function RequestRoutingSection({
  form,
  categories,
  categoriesLoading,
  selectedCategoryKey,
  selectedCategory,
  availableSubcategories,
  subcategoriesLoading,
  selectedSubcategoryKey,
  selectedSubcategory,
  selectedPriority,
  categorySelectionDisabled,
  requiresSubcategory,
}: RequestRoutingSectionProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Request routing</p>
        <p className="text-xs text-muted-foreground">
          Select the category and urgency for this request.
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="category">
              Category <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedCategoryKey}
              onValueChange={(value) =>
                form.setValue('category', value as TicketFormData['category'], {
                  shouldValidate: true,
                })
              }
              disabled={categorySelectionDisabled}
            >
              <SelectTrigger
                id="category"
                className={cn(
                  form.formState.errors.category ? 'border-destructive' : '',
                  !form.formState.errors.category && form.formState.touchedFields.category && 'border-success/50',
                )}
              >
                <SelectValue
                  placeholder={
                    categoriesLoading ? 'Loading categories...' : 'Select a category'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map(({ key, label }) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.category ? (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {form.formState.errors.category.message}
              </p>
            ) : selectedCategory?.description ? (
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {selectedCategory.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <p id="priority-label" className="text-sm font-medium leading-none">
              Priority <span className="text-destructive">*</span>
            </p>
            <div
              role="radiogroup"
              aria-labelledby="priority-label"
              className="flex overflow-hidden rounded-md border border-border bg-background"
            >
              {PRIORITY_OPTIONS.map((priority, index) => (
                <button
                  type="button"
                  key={priority.value}
                  role="radio"
                  aria-checked={selectedPriority === priority.value}
                  title={priority.hint}
                  onClick={() =>
                    form.setValue('priority', priority.value, { shouldValidate: true })
                  }
                  className={cn(
                    'flex-1 whitespace-nowrap px-3 py-2 text-xs font-semibold transition-colors',
                    index < PRIORITY_OPTIONS.length - 1 ? 'border-r border-border' : '',
                    selectedPriority === priority.value
                      ? priority.activeClasses
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {priority.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {PRIORITY_OPTIONS.find((priority) => priority.value === selectedPriority)?.hint}
            </p>
          </div>

          {(availableSubcategories.length > 0 ||
            (subcategoriesLoading && selectedCategoryKey)) && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="subcategory">
                Subcategory
                {requiresSubcategory && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>
              <Select
                value={selectedSubcategoryKey}
                onValueChange={(value) =>
                  form.setValue('subcategory', value, { shouldValidate: true })
                }
                disabled={subcategoriesLoading || availableSubcategories.length === 0}
              >
                <SelectTrigger
                  id="subcategory"
                  className={cn(
                    'max-w-sm',
                    form.formState.errors.subcategory ? 'border-destructive' : '',
                    !form.formState.errors.subcategory && form.formState.touchedFields.subcategory && 'border-success/50',
                  )}
                >
                  <SelectValue
                    placeholder={
                      subcategoriesLoading ? 'Loading...' : 'Select subcategory'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableSubcategories.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.subcategory ? (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {form.formState.errors.subcategory.message}
                </p>
              ) : selectedSubcategory?.description ? (
                <p className="flex items-start gap-1 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {selectedSubcategory.description}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface RequestDetailsSectionProps {
  form: UseFormReturn<TicketFormData>;
  roleContext: RoleContext;
  descriptionValue: string;
  subjectValue: string;
  subjectStatus: 'valid' | 'invalid' | 'untouched';
  descriptionStatus: 'valid' | 'invalid' | 'untouched';
}

export function RequestDetailsSection({
  form,
  roleContext,
  descriptionValue,
  subjectValue,
  subjectStatus,
  descriptionStatus,
}: RequestDetailsSectionProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Request details</p>
        <p className="text-xs text-muted-foreground">
          Provide a clear title and a detailed description of your request.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="subject">
              Request title <span className="text-destructive">*</span>
            </Label>
            {subjectStatus === 'valid' && (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )}
            {subjectStatus === 'invalid' && (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <Input
            id="subject"
            placeholder="e.g. Urgent invoice correction for customer delivery"
            {...form.register('subject')}
            className={cn(
              'transition-colors',
              subjectStatus === 'valid' && 'border-success/50 focus-visible:ring-success/50',
              subjectStatus === 'invalid' && 'border-destructive',
            )}
          />
          {form.formState.errors.subject && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {form.formState.errors.subject.message}
            </p>
          )}
          {subjectValue.length > 0 && subjectStatus !== 'invalid' && (
            <p className="text-xs text-muted-foreground">
              {subjectValue.length} character{subjectValue.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <span
              className={cn(
                'flex items-center gap-1 text-xs tabular-nums transition-colors',
                descriptionStatus === 'valid'
                  ? 'text-success'
                  : descriptionStatus === 'invalid'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
              )}
            >
              {descriptionStatus === 'valid' && <CheckCircle2 className="h-3 w-3" />}
              {descriptionValue.length} / 20 min
            </span>
          </div>
          <Textarea
            id="description"
            placeholder={roleContext.descriptionPlaceholder}
            rows={7}
            {...form.register('description')}
            className={cn(
              'transition-colors',
              descriptionStatus === 'valid' && 'border-success/50 focus-visible:ring-success/50',
              descriptionStatus === 'invalid' && 'border-destructive',
            )}
          />
          {form.formState.errors.description && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {form.formState.errors.description.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface OperationalContextSectionProps {
  form: UseFormReturn<TicketFormData>;
}

export function OperationalContextSection({ form }: OperationalContextSectionProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Operational context</p>
        <p className="text-xs text-muted-foreground">
          Add timing, outcome, and impact details for assignees.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="requested_due_date">Requested due date</Label>
            <Input
              id="requested_due_date"
              type="date"
              {...form.register('requested_due_date')}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="desired_outcome">Desired outcome</Label>
            <Textarea
              id="desired_outcome"
              rows={3}
              placeholder="What result should this request produce?"
              {...form.register('desired_outcome')}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="business_impact">Business impact</Label>
            <Textarea
              id="business_impact"
              rows={3}
              placeholder="Who or what is affected if this is delayed?"
              {...form.register('business_impact')}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface CustomFieldsSectionProps {
  customFields: RequestFormFieldRecord[];
  selectedCategory: RequestCategoryRecord | null;
  customFieldValues: Record<string, string>;
  companyId?: string;
  setCustomFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function CustomFieldsSection({
  customFields,
  selectedCategory,
  customFieldValues,
  companyId,
  setCustomFieldValues,
}: CustomFieldsSectionProps) {
  if (customFields.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Additional information
            </p>
            <p className="text-xs text-muted-foreground">
              Extra details required for{' '}
              {selectedCategory?.label.toLowerCase() ?? 'this category'} requests.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {customFields.length} field{customFields.length === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {customFields.map((field) => {
            const inputId = `cf-${field.key}`;
            const value = customFieldValues[field.key] ?? '';
            const hasValue = value.trim().length > 0;
            const updateValue = (nextValue: string) => {
              setCustomFieldValues((prev) => ({ ...prev, [field.key]: nextValue }));
            };
            return (
              <div
                key={field.id}
                className={cn(
                  'space-y-1.5',
                  field.field_type === 'textarea' && 'sm:col-span-2',
                )}
              >
                <Label htmlFor={inputId}>
                  {field.label}
                  {field.is_required && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                {field.field_type === 'textarea' ? (
                  <Textarea
                    id={inputId}
                    value={value}
                    onChange={(event) => updateValue(event.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className={cn(
                      field.is_required && hasValue && 'border-success/50',
                    )}
                  />
                ) : field.field_type === 'database_select' ? (
                  <DatabaseFieldSelect
                    companyId={companyId}
                    field={field}
                    value={value}
                    inputId={inputId}
                    onChange={updateValue}
                  />
                ) : (
                  <Input
                    id={inputId}
                    type={
                      field.field_type === 'number'
                        ? 'number'
                        : field.field_type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={value}
                    onChange={(event) => updateValue(event.target.value)}
                    placeholder={field.placeholder}
                    className={cn(
                      field.is_required && hasValue && 'border-success/50',
                    )}
                  />
                )}
                {field.help_text && (
                  <p className="text-xs text-muted-foreground">{field.help_text}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface AttachmentsSectionProps {
  attachmentSettings: AttachmentSettings;
  attachedFiles: File[];
  fileErrors: string[];
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Compact mode for sidebar placement: smaller drop zone, tighter padding. */
  compact?: boolean;
  setDragOver: (dragOver: boolean) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
}

export function AttachmentsSection({
  attachmentSettings,
  attachedFiles,
  fileErrors,
  dragOver,
  fileInputRef,
  compact = false,
  setDragOver,
  onDrop,
  onFileInputChange,
  onRemoveFile,
}: AttachmentsSectionProps) {
  const isLimitReached = attachedFiles.length >= attachmentSettings.max_files_per_ticket;

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Attachments
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, Word, Excel, images, CSV, TXT · up to{' '}
              {attachmentSettings.max_file_size_mb} MB each
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
              attachedFiles.length > 0
                ? 'border-primary/30 bg-primary/5 text-primary'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            {attachedFiles.length} / {attachmentSettings.max_files_per_ticket}
          </span>
        </div>
      </CardHeader>
      <CardContent className={cn('space-y-3', compact ? 'p-3' : 'p-4')}>
        <div
          role="button"
          tabIndex={0}
          aria-label="Attach files"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
          }}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-dashed transition-colors',
            compact ? 'px-3 py-3' : 'flex-col px-4 py-5',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border bg-muted/30 hover:bg-muted/60',
            isLimitReached && 'pointer-events-none opacity-50',
          )}
        >
          {compact ? (
            <>
              <UploadCloud className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {isLimitReached ? 'File limit reached' : 'Click or drag to attach files'}
              </span>
            </>
          ) : (
            <>
              <Paperclip className="h-5 w-5 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Click to browse or drag &amp; drop
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Max {attachmentSettings.max_files_per_ticket} files,{' '}
                  {attachmentSettings.max_file_size_mb} MB each
                </p>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label="Upload attachments"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          onChange={onFileInputChange}
        />

        {attachedFiles.length > 0 && (
          <ul className="space-y-1">
            {attachedFiles.map((file, index) => (
              <li
                key={`${file.name}-${file.size}`}
                className={cn(
                  'group flex items-center gap-2 rounded-lg border bg-card transition-colors hover:bg-muted/40',
                  compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
                )}
              >
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-xs text-foreground">
                  {file.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(index)}
                  className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {fileErrors.length > 0 && (
          <div className="space-y-1.5">
            {fileErrors.map((error, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{error}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MobileSubmitPanel({
  canSubmit,
  submitting,
}: {
  canSubmit: boolean;
  submitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm xl:hidden">
      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Request'
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Text is saved locally; re-attach files after reload.
      </p>
    </div>
  );
}
