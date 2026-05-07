import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  FileText,
  Info,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestTemplates } from '@/hooks/useRequestTemplates';
import { useAttachmentSettings } from '@/hooks/useAttachmentSettings';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { ROLE_LABELS } from '@/config/rolePermissions';
import { createTicket } from '@/services/ticketService';
import { uploadTicketAttachment } from '@/services/ticketAttachmentService';
import { resolveBranchCode } from '@/services/branchService';
import {
  listRequestFieldOptions,
  type DatabaseFieldOption,
  type RequestFieldDataSource,
  type RequestFormFieldRecord,
} from '@/services/requestFormFieldService';
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

const DEFAULT_TICKET_FORM_VALUES: TicketFormData = {
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

// ── Role-aware context ────────────────────────────────────────────────────────

interface RoleContext {
  pageTitle: string;
  pageSubtitle: string;
  descriptionPlaceholder: string;
}

const ROLE_CONTEXT: Partial<Record<AppRole, RoleContext>> = {
  sales: {
    pageTitle: 'Sales Support Request',
    pageSubtitle:
      'Raise a request to the support team for sales, documentation, or customer coordination.',
    descriptionPlaceholder:
      'Describe your request in detail. Include customer name, vehicle model, booking or sales order number, and any other relevant information.',
  },
  accounts: {
    pageTitle: 'Accounts Support Request',
    pageSubtitle:
      'Raise a request to the support team for invoicing, payments, or finance coordination.',
    descriptionPlaceholder:
      'Describe your request in detail. Include the invoice number, payment reference, transaction amount, and any other relevant information.',
  },
};

const DEFAULT_ROLE_CONTEXT: RoleContext = {
  pageTitle: 'New Internal Request',
  pageSubtitle:
    'Submit an internal request to the support team for review and resolution.',
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
          className="h-10 w-full justify-between font-normal"
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, loading: categoriesLoading, error: categoriesError } =
    useRequestCategories(user?.company_id);
  const { subcategories, loading: subcategoriesLoading } =
    useRequestSubcategories(user?.company_id);
  const { templates } = useRequestTemplates(user?.company_id);
  const { settings: attachmentSettings } = useAttachmentSettings(user?.company_id);

  const [submitting, setSubmitting] = useState(false);
  const [branchCode, setBranchCode] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
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
    defaultValues: DEFAULT_TICKET_FORM_VALUES,
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
        form.reset({ ...DEFAULT_TICKET_FORM_VALUES, ...parsed.values });
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
      ...DEFAULT_TICKET_FORM_VALUES,
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

  const selectedCategory =
    categories.find((c) => c.key === selectedCategoryKey) ?? null;
  const selectedSubcategory =
    availableSubcategories.find((s) => s.key === selectedSubcategoryKey) ?? null;
  const categorySelectionDisabled = categoriesLoading || categories.length === 0;
  const requiresSubcategory = availableSubcategories.length > 0;
  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;
  const categoryTemplates = useMemo(
    () => templates.filter((t) => t.category_key === selectedCategoryKey && t.is_active),
    [templates, selectedCategoryKey],
  );

  const applyTemplate = (template: (typeof templates)[number]) => {
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
      ...DEFAULT_TICKET_FORM_VALUES,
      category: firstCategoryKey,
      subcategory: firstSubcategoryKey,
    });
    setCustomFieldValues({});
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl space-y-3">

      {/* Identity strip */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/70 px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary select-none">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {ROLE_LABELS[user?.role as AppRole] ?? user?.role ?? 'Staff'}
        </Badge>
      </div>

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">{roleContext.pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{roleContext.pageSubtitle}</p>
      </div>

      {/* Template picker */}
      {categoryTemplates.length > 0 && selectedCategoryKey && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Start from a template</span>
            </div>
            {activeTemplate && (
              <button
                type="button"
                onClick={clearTemplate}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTemplateId === t.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/50 text-foreground hover:bg-muted',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
          {activeTemplate?.description && (
            <p className="text-xs text-muted-foreground">{activeTemplate.description}</p>
          )}
        </div>
      )}

      {/* Categories not ready banner */}
      {(categoriesError || (!categoriesLoading && categories.length === 0)) && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Request categories are not ready</p>
            <p className="text-muted-foreground">
              {categoriesError ||
                'An admin needs to configure at least one active request category in Request Setup before new requests can be submitted.'}
            </p>
          </div>
        </div>
      )}

      {/* Main form card */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">

            <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
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
                  <p className="text-destructive text-xs">
                    {form.formState.errors.subject.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input
                  value={branchCode ?? 'Unassigned'}
                  readOnly
                  className="bg-muted/50 cursor-default select-none"
                />
              </div>
            </div>

            {/* Classification: category + priority */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">

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
                          categoriesLoading ? 'Loading categories…' : 'Select category'
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
                    <p className="text-destructive text-xs">
                      {form.formState.errors.category.message}
                    </p>
                  )}
                </div>

                {/* Priority — visual button group */}
                <div className="space-y-1.5">
                  <Label>
                    Priority <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex overflow-hidden rounded-lg border border-border">
                    {PRIORITY_OPTIONS.map((p, idx) => (
                      <button
                        type="button"
                        key={p.value}
                        title={p.hint}
                        onClick={() =>
                          form.setValue('priority', p.value, { shouldValidate: true })
                        }
                        className={cn(
                          'flex-1 px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap',
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
              </div>

              {/* Category description callout */}
              {selectedCategory?.description && !categoriesLoading && (
                <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{selectedCategory.description}</p>
                </div>
              )}
            </div>

            {/* Subcategory */}
            {(availableSubcategories.length > 0 ||
              (subcategoriesLoading && selectedCategoryKey)) && (
              <div className="space-y-1.5">
                <Label htmlFor="subcategory">
                  Subcategory
                  {requiresSubcategory && <span className="text-destructive"> *</span>}
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
                    className={form.formState.errors.subcategory ? 'border-destructive' : ''}
                  >
                    <SelectValue
                      placeholder={subcategoriesLoading ? 'Loading…' : 'Select subcategory'}
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
                  <p className="text-destructive text-xs">
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

            {customFields.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {customFields.map((field) => {
                  const value = customFieldValues[field.key] ?? '';
                  const updateValue = (nextValue: string) => {
                    setCustomFieldValues((current) => ({ ...current, [field.key]: nextValue }));
                  };

                  return (
                    <div
                      key={field.id}
                      className={cn('space-y-1.5', field.field_type === 'textarea' && 'md:col-span-2')}
                    >
                      <Label htmlFor={`custom-field-${field.key}`}>
                        {field.label}
                        {field.is_required && <span className="text-destructive"> *</span>}
                      </Label>
                      {field.field_type === 'textarea' ? (
                        <Textarea
                          id={`custom-field-${field.key}`}
                          value={value}
                          onChange={(event) => updateValue(event.target.value)}
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
                          id={`custom-field-${field.key}`}
                          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                          value={value}
                          onChange={(event) => updateValue(event.target.value)}
                          placeholder={field.placeholder}
                        />
                      )}
                      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
                    </div>
                  );
                })}
              </div>
            )}

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
                rows={8}
                {...form.register('description')}
                className={form.formState.errors.description ? 'border-destructive' : ''}
              />
              {form.formState.errors.description && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.description.message}
                </p>
              )}

            </div>

            {/* Attachments */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Attachments
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {attachedFiles.length} / {attachmentSettings.max_files_per_ticket} files · max{' '}
                  {attachmentSettings.max_file_size_mb} MB each
                </span>
              </div>

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
                  'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors',
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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    PDF, Word, Excel, images, CSV, TXT — up to{' '}
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
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs text-foreground">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="ml-1 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
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
                    <li key={err} className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={
                submitting ||
                !form.formState.isValid ||
                categorySelectionDisabled ||
                (requiresSubcategory && !selectedSubcategoryKey) ||
                customFields.some((field) => field.is_required && !customFieldValues[field.key]?.trim())
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
