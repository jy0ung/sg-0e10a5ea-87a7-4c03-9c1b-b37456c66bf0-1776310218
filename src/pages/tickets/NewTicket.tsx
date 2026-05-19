import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Info,
  Loader2,
  Paperclip,
  Search,
  ShieldCheck,
  X,
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
import { useAuth } from '@/contexts/AuthContext';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestTemplates } from '@/hooks/useRequestTemplates';
import { useAttachmentSettings } from '@/hooks/useAttachmentSettings';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { createTicket } from '@/services/ticketService';
import { uploadTicketAttachment } from '@/services/ticketAttachmentService';
import { resolveBranchCode } from '@/services/branchService';
import {
  getInternalRequestApprovalPlan,
  type InternalRequestApprovalPlan,
} from '@/services/requestApprovalService';
import {
  listRequestFieldOptions,
  type DatabaseFieldOption,
  type RequestFieldDataSource,
  type RequestFormFieldRecord,
} from '@/services/requestFormFieldService';
import type { RequestCategoryRecord } from '@/services/requestCategoryService';
import type { RequestTemplateRecord } from '@/services/requestTemplateService';
import type { AppRole } from '@/types';

// ── Schema ────────────────────────────────────────────────────────────────────

const ticketSchema = z.object({
  subject: z.string().min(6, 'Subject must be at least 6 characters'),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  description: z.string().min(20, 'Description must be at least 20 characters'),
});

type TicketFormData = z.infer<typeof ticketSchema>;

const DEFAULT_FORM: TicketFormData = {
  subject: '',
  category: '',
  subcategory: '',
  priority: 'medium',
  description: '',
};

// ── Priority options ──────────────────────────────────────────────────────────

interface PriorityOption {
  value: TicketFormData['priority'];
  label: string;
  hint: string;
  activeClasses: string;
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  {
    value: 'low',
    label: 'Low',
    hint: 'Informational — no time pressure',
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
    hint: 'Urgent — blocking a transaction',
    activeClasses:
      'bg-red-50 text-red-700 border-red-400 dark:bg-red-950/40 dark:text-red-400',
  },
];

const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300',
  high: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400',
};

// ── Role-aware context ────────────────────────────────────────────────────────

interface RoleContext {
  pageTitle: string;
  pageSubtitle: string;
  descriptionPlaceholder: string;
}

const ROLE_CONTEXT: Partial<Record<AppRole, RoleContext>> = {
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

const DEFAULT_ROLE_CONTEXT: RoleContext = {
  pageTitle: 'New Request',
  pageSubtitle: 'Submit an internal request for review and resolution.',
  descriptionPlaceholder:
    'Describe your request clearly. Provide as much context as possible so the assigned team can respond quickly.',
};

// ── Attachment helpers ────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_TYPES = [
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

function DatabaseFieldSelect({
  companyId,
  field,
  value,
  onChange,
}: {
  companyId?: string;
  field: RequestFormFieldRecord;
  value: string;
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

// ── TemplateChooser ───────────────────────────────────────────────────────────

interface TemplateChooserProps {
  templates: RequestTemplateRecord[];
  categories: RequestCategoryRecord[];
  activeTemplateId: string | null;
  onSelect: (template: RequestTemplateRecord) => void;
  onClear: () => void;
  loading: boolean;
}

function TemplateChooser({
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
    () => templates.filter((t) => t.is_active),
    [templates],
  );

  const templateCategories = useMemo(() => {
    const keys = new Set(activeTemplates.map((t) => t.category_key));
    return categories.filter((c) => keys.has(c.key));
  }, [activeTemplates, categories]);

  const filtered = useMemo(() => {
    let list = activeTemplates;
    if (filterCategory !== 'all') list = list.filter((t) => t.category_key === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeTemplates, filterCategory, search]);

  const getCategoryLabel = (key: string) =>
    categories.find((c) => c.key === key)?.label ?? key;

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
      {/* Search + category filter */}
      {activeTemplates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="h-8 pl-8 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {templateCategories.length > 1 && (
            <div className="flex flex-wrap gap-1">
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
              {templateCategories.map((cat) => (
                <button
                  type="button"
                  key={cat.key}
                  onClick={() => setFilterCategory(cat.key)}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                    filterCategory === cat.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Card grid: custom + templates */}
      <div className={cn('grid gap-2', activeTemplates.length > 0 ? 'sm:grid-cols-2' : '')}>
        {/* "Custom request" option — always first */}
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

        {/* Template cards */}
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

// ── Approval flow types & preview ─────────────────────────────────────────────

type ApprovalPlanState = InternalRequestApprovalPlan | null | 'loading' | 'error';

function ApprovalFlowPreview({ plan }: { plan: ApprovalPlanState }) {
  if (plan === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking approval route…
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

// ── RequestSummaryPanel ───────────────────────────────────────────────────────

interface SummaryPanelProps {
  activeTemplate: RequestTemplateRecord | null;
  categoryLabel: string;
  subcategoryLabel: string | null;
  priority: TicketFormData['priority'];
  attachedFiles: File[];
  approvalPlan: ApprovalPlanState;
  canSubmit: boolean;
  isSubmitting: boolean;
}

function RequestSummaryPanel({
  activeTemplate,
  categoryLabel,
  subcategoryLabel,
  priority,
  attachedFiles,
  approvalPlan,
  canSubmit,
  isSubmitting,
}: SummaryPanelProps) {
  return (
    <div className="space-y-3">
      {/* Summary card */}
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

      {/* Approval route */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-2.5 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Approval Route
          </p>
        </div>
        <ApprovalFlowPreview plan={approvalPlan} />
      </div>

      {/* Desktop submit CTA */}
      <Button
        type="submit"
        form="new-request-form"
        className="w-full"
        disabled={!canSubmit}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit Request'
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Drafts are saved locally until submitted.
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, loading: categoriesLoading, error: categoriesError } =
    useRequestCategories(user?.company_id);
  const { subcategories, loading: subcategoriesLoading } =
    useRequestSubcategories(user?.company_id);
  const { templates, loading: templatesLoading } = useRequestTemplates(user?.company_id);
  const { settings: attachmentSettings } = useAttachmentSettings(user?.company_id);

  const [submitting, setSubmitting] = useState(false);
  const [branchCode, setBranchCode] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [approvalPlan, setApprovalPlan] = useState<ApprovalPlanState>('loading');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRestoredRef = useRef(false);
  const skipDraftSaveRef = useRef(false);

  const roleContext = ROLE_CONTEXT[user?.role as AppRole] ?? DEFAULT_ROLE_CONTEXT;

  useEffect(() => {
    if (user?.branch_id) {
      resolveBranchCode(user.branch_id).then(setBranchCode);
    }
  }, [user?.branch_id]);

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: DEFAULT_FORM,
    mode: 'onChange',
  });

  const userId = user?.id;
  const userCompanyId = user?.company_id;
  const draftKey = useMemo(
    () => userId && userCompanyId ? `flc.internal-request-draft:${userCompanyId}:${userId}` : null,
    [userCompanyId, userId],
  );

  useEffect(() => {
    if (!draftKey || draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    try {
      const rawDraft = window.localStorage.getItem(draftKey);
      if (!rawDraft) return;
      const parsed = JSON.parse(rawDraft) as {
        values?: Partial<TicketFormData>;
        customFieldValues?: Record<string, string>;
        activeTemplateId?: string | null;
      };
      if (parsed.values) {
        form.reset({ ...DEFAULT_FORM, ...parsed.values });
      }
      setCustomFieldValues(parsed.customFieldValues ?? {});
      setActiveTemplateId(parsed.activeTemplateId ?? null);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, form]);

  useEffect(() => {
    if (!draftKey || !draftRestoredRef.current) return;

    const persistDraft = (values: Partial<TicketFormData>) => {
      if (skipDraftSaveRef.current) return;
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ values, customFieldValues, activeTemplateId, updatedAt: new Date().toISOString() }),
        );
      } catch {
        // Ignore storage quota/private-mode errors; the live form state still works.
      }
    };

    persistDraft(form.getValues());
    const subscription = form.watch((values) => persistDraft(values));
    return () => subscription.unsubscribe();
  }, [activeTemplateId, customFieldValues, draftKey, form]);

  // Auto-select first category once loaded
  useEffect(() => {
    const nextCategory = categories[0]?.key ?? '';
    const currentCategory = form.getValues('category');
    if (!currentCategory && nextCategory) {
      form.setValue('category', nextCategory, { shouldValidate: true });
      return;
    }
    if (currentCategory && !categories.some((c) => c.key === currentCategory)) {
      form.setValue('category', nextCategory, { shouldValidate: true });
    }
  }, [categories, form]);

  const selectedCategoryKey = form.watch('category');
  const { fields: customFields } = useRequestFormFields(user?.company_id, {
    categoryKey: selectedCategoryKey || undefined,
  });

  // Re-evaluate approval plan when category changes (category-pinned flows take priority)
  useEffect(() => {
    if (!user?.company_id || !user?.id) return;
    setApprovalPlan('loading');
    getInternalRequestApprovalPlan(user.company_id, user.id, {
      categoryKey: selectedCategoryKey || null,
    }).then(({ data, error }) => {
      setApprovalPlan(error ? 'error' : data);
    });
  }, [user?.company_id, user?.id, selectedCategoryKey]);

  const selectedSubcategoryKey = form.watch('subcategory');
  const selectedPriority = form.watch('priority');
  const descriptionValue = form.watch('description') ?? '';

  const availableSubcategories = useMemo(
    () => subcategories.filter((s) => s.category_key === selectedCategoryKey),
    [selectedCategoryKey, subcategories],
  );

  // Auto-select first subcategory when category changes
  useEffect(() => {
    const nextSubcategory = availableSubcategories[0]?.key ?? '';
    const currentSubcategory = form.getValues('subcategory');

    if (!nextSubcategory) {
      if (currentSubcategory) form.setValue('subcategory', '', { shouldValidate: true });
      return;
    }
    if (
      !currentSubcategory ||
      !availableSubcategories.some((s) => s.key === currentSubcategory)
    ) {
      form.setValue('subcategory', nextSubcategory, { shouldValidate: true });
    }
  }, [availableSubcategories, form]);

  // ── File validation ─────────────────────────────────────────────────────────

  const validateAndAddFiles = useCallback(
    (incoming: File[]) => {
      const maxFiles = attachmentSettings.max_files_per_ticket;
      const maxSizeBytes = attachmentSettings.max_file_size_mb * 1024 * 1024;

      const errors: string[] = [];
      const valid: File[] = [];

      for (const file of incoming) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          errors.push(`"${file.name}" is not a supported file type.`);
          continue;
        }
        if (file.size > maxSizeBytes) {
          errors.push(
            `"${file.name}" exceeds the ${attachmentSettings.max_file_size_mb} MB size limit.`,
          );
          continue;
        }
        if (attachedFiles.some((f) => f.name === file.name && f.size === file.size)) {
          errors.push(`"${file.name}" is already attached.`);
          continue;
        }
        valid.push(file);
      }

      const combined = [...attachedFiles, ...valid];
      if (combined.length > maxFiles) {
        errors.push(
          `You can attach at most ${maxFiles} file${maxFiles !== 1 ? 's' : ''} per request.`,
        );
        setAttachedFiles(combined.slice(0, maxFiles));
      } else {
        setAttachedFiles(combined);
      }

      setFileErrors(errors);
    },
    [attachedFiles, attachmentSettings],
  );

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileErrors([]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(Array.from(e.target.files));
      // Reset input so the same file can be re-selected after removal
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    validateAndAddFiles(Array.from(e.dataTransfer.files));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (data: TicketFormData) => {
    if (!user) return;

    const missingRequiredField = customFields.find((field) =>
      field.is_required && !customFieldValues[field.key]?.trim(),
    );
    if (missingRequiredField) {
      toast.error('Unable to submit request', {
        description: `${missingRequiredField.label} is required.`,
      });
      return;
    }

    if (!categories.some((c) => c.key === data.category && c.is_active)) {
      toast.error('Unable to submit request', {
        description: 'This category is no longer available. Please choose another one.',
      });
      return;
    }

    const matchingSubcategories = subcategories.filter(
      (s) => s.category_key === data.category && s.is_active,
    );

    if (matchingSubcategories.length > 0 && !data.subcategory) {
      form.setError('subcategory', {
        type: 'manual',
        message: 'Subcategory is required when this category has subcategories.',
      });
      toast.error('Unable to submit request', {
        description: 'Please choose a subcategory for the selected category.',
      });
      return;
    }

    if (
      data.subcategory &&
      !matchingSubcategories.some((s) => s.key === data.subcategory)
    ) {
      form.setError('subcategory', {
        type: 'manual',
        message: 'This subcategory is no longer available.',
      });
      toast.error('Unable to submit request', {
        description: 'This subcategory is no longer available. Please choose another one.',
      });
      return;
    }

    form.clearErrors('subcategory');

    setSubmitting(true);

    const { data: ticketResult, error: ticketError } = await createTicket(
      {
        subject: data.subject.trim(),
        category: data.category,
        subcategory: matchingSubcategories.length > 0 ? (data.subcategory ?? null) : null,
        priority: data.priority,
        description: data.description,
        requested_due_date: null,
        business_impact: null,
        desired_outcome: null,
        custom_fields: Object.fromEntries(
          customFields
            .map((field) => [field.key, customFieldValues[field.key]?.trim() ?? ''])
            .filter(([, value]) => Boolean(value)),
        ),
        vso_number: null,
      },
      { userId: user.id, companyId: user.company_id, submitterRole: user.role },
    );

    if (ticketError || !ticketResult) {
      toast.error('Failed to submit request', {
        description: ticketError?.message || 'An unexpected error occurred.',
      });
      setSubmitting(false);
      return;
    }

    // Upload attachments (best-effort — failures are reported but don't block)
    if (attachedFiles.length > 0) {
      const uploadResults = await Promise.all(
        attachedFiles.map((file) =>
          uploadTicketAttachment(file, ticketResult.id, user.company_id, user.id),
        ),
      );
      const failedUploads = uploadResults.filter((r) => r.error);
      if (failedUploads.length > 0) {
        toast.warning('Request submitted, but some attachments failed to upload', {
          description: `${failedUploads.length} file(s) could not be attached. Please try re-uploading them from the request detail page.`,
        });
      }
    }

    const firstCategoryKey = categories[0]?.key ?? '';
    const firstSubcategoryKey =
      subcategories.find((s) => s.category_key === firstCategoryKey)?.key ?? '';

    skipDraftSaveRef.current = true;
    setActiveTemplateId(null);
    setAttachedFiles([]);
    setFileErrors([]);
    form.reset({
      ...DEFAULT_FORM,
      category: firstCategoryKey,
      subcategory: firstSubcategoryKey,
    });
    setCustomFieldValues({});
    if (draftKey) window.localStorage.removeItem(draftKey);
    toast.success('Request submitted', {
      description: 'Your request has been recorded and will be reviewed shortly.',
    });
    navigate('/portal/tickets');
    setSubmitting(false);
  };

  // ── Derived state ───────────────────────────────────────────────────────────

  const selectedCategory = categories.find((c) => c.key === selectedCategoryKey) ?? null;
  const selectedSubcategory =
    availableSubcategories.find((s) => s.key === selectedSubcategoryKey) ?? null;
  const categorySelectionDisabled = categoriesLoading || categories.length === 0;
  const requiresSubcategory = availableSubcategories.length > 0;
  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;

  const canSubmit =
    !submitting &&
    form.formState.isValid &&
    !categorySelectionDisabled &&
    !(requiresSubcategory && !selectedSubcategoryKey) &&
    !customFields.some((f) => f.is_required && !customFieldValues[f.key]?.trim());

  // ── Handlers ────────────────────────────────────────────────────────────────

  const applyTemplate = (template: RequestTemplateRecord) => {
    setActiveTemplateId(template.id);
    form.setValue('category', template.category_key, { shouldValidate: true });
    form.setValue('subcategory', template.subcategory_key ?? '', { shouldValidate: true });
    form.setValue('subject', template.subject, { shouldValidate: true });
    form.setValue('priority', template.priority as TicketFormData['priority'], {
      shouldValidate: true,
    });
    form.setValue('description', template.body, { shouldValidate: true });
  };

  const clearTemplate = () => {
    setActiveTemplateId(null);
    const firstCategoryKey = categories[0]?.key ?? '';
    const firstSubcategoryKey =
      subcategories.find((s) => s.category_key === firstCategoryKey)?.key ?? '';
    form.reset({
      ...DEFAULT_FORM,
      category: firstCategoryKey,
      subcategory: firstSubcategoryKey,
    });
    setCustomFieldValues({});
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 animate-fade-in">
      {/* Page header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {roleContext.pageTitle}
          </h1>
          <p className="text-[11px] text-muted-foreground">{roleContext.pageSubtitle}</p>
        </div>
        {branchCode && (
          <span className="rounded-md border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
            Branch:{' '}
            <span className="font-medium text-foreground">{branchCode}</span>
          </span>
        )}
      </div>

      {/* Categories not ready banner */}
      {(categoriesError || (!categoriesLoading && categories.length === 0)) && (
        <div className="shrink-0 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">Request categories are not ready</p>
            <p className="text-muted-foreground">
              {categoriesError ||
                'An admin needs to configure at least one active request category in Request Setup before new requests can be submitted.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Main form (two-column on xl) ───────────────────────────────────── */}
      <form
        id="new-request-form"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div className="grid gap-4 pb-4 xl:grid-cols-[minmax(0,1fr)_300px]">

          {/* Left column: form sections */}
          <div className="space-y-4">

            {/* ── Section 1: Template chooser ───────────────────────────── */}
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Choose a template</p>
                <p className="text-xs text-muted-foreground">
                  Templates prefill the form fields. Pick one or start with a custom request.
                </p>
              </CardHeader>
              <CardContent className="p-4">
                <TemplateChooser
                  templates={templates}
                  categories={categories}
                  activeTemplateId={activeTemplateId}
                  onSelect={applyTemplate}
                  onClear={clearTemplate}
                  loading={templatesLoading}
                />
              </CardContent>
            </Card>

            {/* ── Section 2: Request routing ────────────────────────────── */}
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Request routing</p>
                <p className="text-xs text-muted-foreground">
                  Select the category and urgency for this request.
                </p>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">

                  {/* Category */}
                  <div className="space-y-1.5">
                    <Label htmlFor="category">
                      Category <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedCategoryKey}
                      onValueChange={(v) =>
                        form.setValue('category', v as TicketFormData['category'], {
                          shouldValidate: true,
                        })
                      }
                      disabled={categorySelectionDisabled}
                    >
                      <SelectTrigger
                        id="category"
                        className={form.formState.errors.category ? 'border-destructive' : ''}
                      >
                        <SelectValue
                          placeholder={
                            categoriesLoading ? 'Loading categories…' : 'Select a category'
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
                    {form.formState.errors.category && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.category.message}
                      </p>
                    )}
                    {selectedCategory?.description && (
                      <p className="flex items-start gap-1 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" />
                        {selectedCategory.description}
                      </p>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="space-y-1.5">
                    <Label>
                      Priority <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex overflow-hidden rounded-md border border-border bg-background">
                      {PRIORITY_OPTIONS.map((p, idx) => (
                        <button
                          type="button"
                          key={p.value}
                          title={p.hint}
                          onClick={() =>
                            form.setValue('priority', p.value, { shouldValidate: true })
                          }
                          className={cn(
                            'flex-1 whitespace-nowrap px-3 py-2 text-xs font-semibold transition-colors',
                            idx < PRIORITY_OPTIONS.length - 1 ? 'border-r border-border' : '',
                            selectedPriority === p.value
                              ? p.activeClasses
                              : 'bg-background text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {PRIORITY_OPTIONS.find((p) => p.value === selectedPriority)?.hint}
                    </p>
                  </div>

                  {/* Subcategory */}
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
                        onValueChange={(v) =>
                          form.setValue('subcategory', v, { shouldValidate: true })
                        }
                        disabled={subcategoriesLoading || availableSubcategories.length === 0}
                      >
                        <SelectTrigger
                          id="subcategory"
                          className={cn(
                            'max-w-sm',
                            form.formState.errors.subcategory ? 'border-destructive' : '',
                          )}
                        >
                          <SelectValue
                            placeholder={
                              subcategoriesLoading ? 'Loading…' : 'Select subcategory'
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
                      {form.formState.errors.subcategory && (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.subcategory.message}
                        </p>
                      )}
                      {selectedSubcategory?.description && (
                        <p className="text-xs text-muted-foreground">
                          {selectedSubcategory.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Section 3: Request details ────────────────────────────── */}
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Request details</p>
                <p className="text-xs text-muted-foreground">
                  Provide a clear title and a detailed description of your request.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {/* Subject */}
                <div className="space-y-1.5">
                  <Label htmlFor="subject">
                    Request title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="subject"
                    placeholder="e.g. Urgent invoice correction for customer delivery"
                    {...form.register('subject')}
                    className={form.formState.errors.subject ? 'border-destructive' : ''}
                  />
                  {form.formState.errors.subject && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.subject.message}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="description">
                      Description <span className="text-destructive">*</span>
                    </Label>
                    <span
                      className={cn(
                        'text-xs tabular-nums transition-colors',
                        descriptionValue.length >= 20
                          ? 'text-muted-foreground'
                          : 'text-destructive',
                      )}
                    >
                      {descriptionValue.length} / 20 min
                    </span>
                  </div>
                  <Textarea
                    id="description"
                    placeholder={roleContext.descriptionPlaceholder}
                    rows={7}
                    {...form.register('description')}
                    className={form.formState.errors.description ? 'border-destructive' : ''}
                  />
                  {form.formState.errors.description && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.description.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Section 4: Additional information (custom fields) ─────── */}
            {customFields.length > 0 && (
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
                      const value = customFieldValues[field.key] ?? '';
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
                          <Label htmlFor={`cf-${field.key}`}>
                            {field.label}
                            {field.is_required && (
                              <span className="text-destructive"> *</span>
                            )}
                          </Label>
                          {field.field_type === 'textarea' ? (
                            <Textarea
                              id={`cf-${field.key}`}
                              value={value}
                              onChange={(e) => updateValue(e.target.value)}
                              placeholder={field.placeholder}
                              rows={3}
                            />
                          ) : field.field_type === 'database_select' ? (
                            <DatabaseFieldSelect
                              companyId={user?.company_id}
                              field={field}
                              value={value}
                              onChange={updateValue}
                            />
                          ) : (
                            <Input
                              id={`cf-${field.key}`}
                              type={
                                field.field_type === 'number'
                                  ? 'number'
                                  : field.field_type === 'date'
                                    ? 'date'
                                    : 'text'
                              }
                              value={value}
                              onChange={(e) => updateValue(e.target.value)}
                              placeholder={field.placeholder}
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
            )}

            {/* ── Section 5: Attachments ────────────────────────────────── */}
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
                      PDF, Word, Excel, images, CSV, TXT — up to{' '}
                      {attachmentSettings.max_file_size_mb} MB each
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {attachedFiles.length} / {attachmentSettings.max_files_per_ticket}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {/* Drop zone */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Attach files"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30 hover:bg-muted/60',
                    attachedFiles.length >= attachmentSettings.max_files_per_ticket &&
                      'pointer-events-none opacity-50',
                  )}
                >
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Click to browse or drag &amp; drop
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Max {attachmentSettings.max_files_per_ticket} files,{' '}
                      {attachmentSettings.max_file_size_mb} MB each
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES.join(',')}
                  className="sr-only"
                  onChange={handleFileInputChange}
                />

                {/* Attached file list */}
                {attachedFiles.length > 0 && (
                  <ul className="space-y-1.5">
                    {attachedFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs text-foreground">
                          {file.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatBytes(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="ml-1 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Validation errors */}
                {fileErrors.length > 0 && (
                  <ul className="space-y-1">
                    {fileErrors.map((err) => (
                      <li
                        key={err}
                        className="flex items-start gap-1.5 text-xs text-destructive"
                      >
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Mobile submit (hidden on xl) */}
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm xl:hidden">
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
              <p className="text-center text-xs text-muted-foreground">
                Drafts are saved locally until submitted.
              </p>
            </div>
          </div>

          {/* Right column: summary panel (desktop only) */}
          <div className="hidden xl:block">
            <div className="sticky top-4">
              <RequestSummaryPanel
                activeTemplate={activeTemplate}
                categoryLabel={selectedCategory?.label ?? ''}
                subcategoryLabel={selectedSubcategory?.label ?? null}
                priority={selectedPriority}
                attachedFiles={attachedFiles}
                approvalPlan={approvalPlan}
                canSubmit={canSubmit}
                isSubmitting={submitting}
              />
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
