import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  FileText,
  Info,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ROLE_LABELS } from '@/config/rolePermissions';
import { createTicket } from '@/services/ticketService';
import { uploadTicketAttachment } from '@/services/ticketAttachmentService';
import type { AppRole } from '@/types';

// ── Schema ────────────────────────────────────────────────────────────────────

const ticketSchema = z.object({
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  vso_number: z.string().optional(),
});

type TicketFormData = z.infer<typeof ticketSchema>;

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
  tips: string[];
  requiresVso: boolean;
}

const ROLE_CONTEXT: Partial<Record<AppRole, RoleContext>> = {
  sales: {
    pageTitle: 'Sales Support Request',
    pageSubtitle:
      'Raise a request to the support team for sales, documentation, or customer coordination.',
    descriptionPlaceholder:
      'Describe your request in detail. Include customer name, vehicle model, booking or sales order number, and any other relevant information.',
    tips: [
      'Customer name and contact number',
      'Vehicle model and VIN or plate number (if applicable)',
      'Booking number or Sales Order reference',
      'Expected timeline or reason for urgency',
    ],
    requiresVso: true,
  },
  accounts: {
    pageTitle: 'Accounts Support Request',
    pageSubtitle:
      'Raise a request to the support team for invoicing, payments, or finance coordination.',
    descriptionPlaceholder:
      'Describe your request in detail. Include the invoice number, payment reference, transaction amount, and any other relevant information.',
    tips: [
      'Invoice or receipt number',
      'Payment reference or transaction ID',
      'Amount and date of transaction',
      'Name of the customer or vendor involved',
    ],
    requiresVso: false,
  },
};

const DEFAULT_ROLE_CONTEXT: RoleContext = {
  pageTitle: 'New Internal Request',
  pageSubtitle:
    'Submit an internal request to the support team for review and resolution.',
  descriptionPlaceholder:
    'Describe your request clearly. Provide as much context as possible so the assigned team can respond quickly.',
  tips: [
    'A clear description of the issue or request',
    'Any relevant reference numbers',
    'The expected outcome or action needed',
    'Any relevant deadlines or urgency reason',
  ],
  requiresVso: false,
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
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roleContext = ROLE_CONTEXT[user?.role as AppRole] ?? DEFAULT_ROLE_CONTEXT;

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: '',
      category: '',
      subcategory: '',
      priority: 'medium',
      description: '',
      vso_number: '',
    },
    mode: 'onChange',
  });

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

    // VSO required for sales role
    if (roleContext.requiresVso && !data.vso_number?.trim()) {
      form.setError('vso_number', {
        type: 'manual',
        message: 'VSO number is required for Sales requests.',
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
        subject: data.subject,
        category: data.category,
        subcategory: matchingSubcategories.length > 0 ? (data.subcategory ?? null) : null,
        priority: data.priority,
        description: data.description,
        vso_number: data.vso_number?.trim() || null,
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

    toast.success('Request submitted', {
      description: 'Your request has been recorded and will be reviewed shortly.',
    });
    navigate('/tickets');
    setActiveTemplateId(null);
    setAttachedFiles([]);
    setFileErrors([]);
    form.reset({
      subject: '',
      category: firstCategoryKey,
      subcategory: firstSubcategoryKey,
      priority: 'medium',
      description: '',
      vso_number: '',
    });
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

  const applyTemplate = (template: (typeof templates)[number]) => {
    setActiveTemplateId(template.id);
    form.setValue('subject', template.subject, { shouldValidate: true });
    form.setValue('category', template.category_key, { shouldValidate: true });
    form.setValue('subcategory', template.subcategory_key ?? '', { shouldValidate: true });
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
      subject: '',
      category: firstCategoryKey,
      subcategory: firstSubcategoryKey,
      priority: 'medium',
      description: '',
      vso_number: '',
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Identity strip */}
      <div className="flex items-center justify-between gap-3">
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
        <h1 className="text-2xl font-bold text-foreground">{roleContext.pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{roleContext.pageSubtitle}</p>
      </div>

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
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
            {templates.map((t) => (
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
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
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
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">

            {/* Classification: category + priority */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">

                {/* Category */}
                <div className="space-y-2">
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
                <div className="space-y-2">
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
                          'flex-1 px-5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap',
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
                <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{selectedCategory.description}</p>
                </div>
              )}
            </div>

            {/* Subcategory */}
            {(availableSubcategories.length > 0 ||
              (subcategoriesLoading && selectedCategoryKey)) && (
              <div className="space-y-2">
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

            {/* VSO number */}
            <div className="space-y-2">
              <Label htmlFor="vso_number">
                VSO Number
                {roleContext.requiresVso && <span className="text-destructive"> *</span>}
                {!roleContext.requiresVso && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (optional)
                  </span>
                )}
              </Label>
              <Input
                id="vso_number"
                placeholder="e.g. VSO-2026-00123"
                {...form.register('vso_number')}
                className={form.formState.errors.vso_number ? 'border-destructive' : ''}
              />
              {form.formState.errors.vso_number && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.vso_number.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Vehicle Sales Order number from the DMS or sales order form.
              </p>
            </div>

            {/* Request title */}
            <div className="space-y-2">
              <Label htmlFor="subject">
                Request title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject"
                placeholder="Brief, clear summary of what you need"
                {...form.register('subject')}
                className={form.formState.errors.subject ? 'border-destructive' : ''}
              />
              {form.formState.errors.subject && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.subject.message}
                </p>
              )}
            </div>

            {/* Description + contextual tips */}
            <div className="space-y-2">
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
                rows={6}
                {...form.register('description')}
                className={form.formState.errors.description ? 'border-destructive' : ''}
              />
              {form.formState.errors.description && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.description.message}
                </p>
              )}

              {/* Role-specific guidance */}
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-medium text-foreground">Helpful to include:</p>
                <ul className="space-y-1">
                  {roleContext.tips.map((tip) => (
                    <li
                      key={tip}
                      className="flex items-baseline gap-2 text-xs text-muted-foreground"
                    >
                      <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2">
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
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
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
                (roleContext.requiresVso && !form.watch('vso_number')?.trim())
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
