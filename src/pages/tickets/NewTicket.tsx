import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Paperclip, Save, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestTemplates } from '@/hooks/useRequestTemplates';
import { useAttachmentSettings } from '@/hooks/useAttachmentSettings';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import { createTicket } from '@/services/ticketService';
import { uploadTicketAttachment } from '@/services/ticketAttachmentService';
import { resolveBranchCode } from '@/services/branchService';
import { getInternalRequestApprovalPlan } from '@/services/requestApprovalService';
import type { RequestTemplateRecord } from '@/services/requestTemplateService';
import type { AppRole } from '@/types';
import {
  ACCEPTED_TYPES,
  DEFAULT_FORM,
  DEFAULT_ROLE_CONTEXT,
  ROLE_CONTEXT,
  ticketSchema,
  CustomFieldsSection,
  RequestDetailsSection,
  RequestRoutingSection,
  RequestSummaryPanel,
  TemplateDropdown,
  type ApprovalPlanState,
  type TicketFormData,
} from './new-ticket/NewTicketSections';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
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
        setDraftSavedAt(new Date());
      } catch {
        // Ignore storage quota/private-mode errors; the live form state still works.
      }
    };

    persistDraft(form.getValues());
    const subscription = form.watch((values) => persistDraft(values));
    return () => subscription.unsubscribe();
  }, [activeTemplateId, customFieldValues, draftKey, form]);

  useEffect(() => {
    const nextCategory = categories[0]?.key ?? '';
    const currentCategory = form.getValues('category');
    if (!currentCategory && nextCategory) {
      form.setValue('category', nextCategory, { shouldValidate: true });
      return;
    }
    if (currentCategory && !categories.some((category) => category.key === currentCategory)) {
      form.setValue('category', nextCategory, { shouldValidate: true });
    }
  }, [categories, form]);

  const selectedCategoryKey = form.watch('category');
  const { fields: customFields } = useRequestFormFields(user?.company_id, {
    categoryKey: selectedCategoryKey || undefined,
  });

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
  const subjectValue = form.watch('subject') ?? '';

  const availableSubcategories = useMemo(
    () => subcategories.filter((subcategory) => subcategory.category_key === selectedCategoryKey),
    [selectedCategoryKey, subcategories],
  );

  useEffect(() => {
    const nextSubcategory = availableSubcategories[0]?.key ?? '';
    const currentSubcategory = form.getValues('subcategory');

    if (!nextSubcategory) {
      if (currentSubcategory) form.setValue('subcategory', '', { shouldValidate: true });
      return;
    }
    if (
      !currentSubcategory ||
      !availableSubcategories.some((subcategory) => subcategory.key === currentSubcategory)
    ) {
      form.setValue('subcategory', nextSubcategory, { shouldValidate: true });
    }
  }, [availableSubcategories, form]);

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
        if (attachedFiles.some((attachedFile) => attachedFile.name === file.name && attachedFile.size === file.size)) {
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
    setAttachedFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
    setFileErrors([]);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      validateAndAddFiles(Array.from(event.target.files));
      event.target.value = '';
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    validateAndAddFiles(Array.from(event.dataTransfer.files));
  };

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

    if (!categories.some((category) => category.key === data.category && category.is_active)) {
      toast.error('Unable to submit request', {
        description: 'This category is no longer available. Please choose another one.',
      });
      return;
    }

    const matchingSubcategories = subcategories.filter(
      (subcategory) => subcategory.category_key === data.category && subcategory.is_active,
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
      !matchingSubcategories.some((subcategory) => subcategory.key === data.subcategory)
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

    if (attachedFiles.length > 0) {
      const uploadResults = await Promise.all(
        attachedFiles.map((file) =>
          uploadTicketAttachment(file, ticketResult.id, user.company_id, user.id),
        ),
      );
      const failedUploads = uploadResults.filter((result) => result.error);
      if (failedUploads.length > 0) {
        toast.warning('Request submitted, but some attachments failed to upload', {
          description: `${failedUploads.length} file(s) could not be attached. Please try re-uploading them from the request detail page.`,
        });
      }
    }

    const firstCategoryKey = categories[0]?.key ?? '';
    const firstSubcategoryKey =
      subcategories.find((subcategory) => subcategory.category_key === firstCategoryKey)?.key ?? '';

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

  const selectedCategory = categories.find((category) => category.key === selectedCategoryKey) ?? null;
  const selectedSubcategory =
    availableSubcategories.find((subcategory) => subcategory.key === selectedSubcategoryKey) ?? null;
  const categorySelectionDisabled = categoriesLoading || categories.length === 0;
  const requiresSubcategory = availableSubcategories.length > 0;
  const activeTemplate = templates.find((template) => template.id === activeTemplateId) ?? null;

  const canSubmit =
    !submitting &&
    form.formState.isValid &&
    !categorySelectionDisabled &&
    !(requiresSubcategory && !selectedSubcategoryKey) &&
    !customFields.some((field) => field.is_required && !customFieldValues[field.key]?.trim());

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
      subcategories.find((subcategory) => subcategory.category_key === firstCategoryKey)?.key ?? '';
    form.reset({
      ...DEFAULT_FORM,
      category: firstCategoryKey,
      subcategory: firstSubcategoryKey,
    });
    setCustomFieldValues({});
  };

  const draftSavedLabel = draftSavedAt
    ? `Draft saved ${draftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const fieldValidationStatus = useMemo(() => {
    const status: Record<string, 'valid' | 'invalid' | 'untouched'> = {};
    const touched = form.formState.touchedFields;
    const errors = form.formState.errors;

    if (touched.subject) {
      status.subject = errors.subject ? 'invalid' : 'valid';
    } else {
      status.subject = 'untouched';
    }

    if (touched.description) {
      status.description = errors.description ? 'invalid' : 'valid';
    } else {
      status.description = 'untouched';
    }

    return status;
  }, [form.formState.touchedFields, form.formState.errors]);

  const isLimitReached = attachedFiles.length >= attachmentSettings.max_files_per_ticket;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {roleContext.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{roleContext.pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {branchCode && (
            <span className="rounded-md border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
              Branch:{' '}
              <span className="font-medium text-foreground">{branchCode}</span>
            </span>
          )}
          {draftSavedLabel && (
            <span className="flex items-center gap-1 rounded-md border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
              <Save className="h-3 w-3" />
              {draftSavedLabel}
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {(categoriesError || (!categoriesLoading && categories.length === 0)) && (
        <div className="shrink-0 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
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

      <form
        id="new-request-form"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div className="grid gap-5 pb-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main form content */}
          <div className="space-y-4">
            {/* Template dropdown */}
            {templates.length > 0 && (
              <TemplateDropdown
                templates={templates}
                categories={categories}
                activeTemplateId={activeTemplateId}
                onSelect={applyTemplate}
                onClear={clearTemplate}
                loading={templatesLoading}
              />
            )}

            <RequestRoutingSection
              form={form}
              categories={categories}
              categoriesLoading={categoriesLoading}
              selectedCategoryKey={selectedCategoryKey}
              selectedCategory={selectedCategory}
              availableSubcategories={availableSubcategories}
              subcategoriesLoading={subcategoriesLoading}
              selectedSubcategoryKey={selectedSubcategoryKey}
              selectedSubcategory={selectedSubcategory}
              selectedPriority={selectedPriority}
              categorySelectionDisabled={categorySelectionDisabled}
              requiresSubcategory={requiresSubcategory}
            />

            <RequestDetailsSection
              form={form}
              roleContext={roleContext}
              descriptionValue={descriptionValue}
              subjectValue={subjectValue}
              subjectStatus={fieldValidationStatus.subject}
              descriptionStatus={fieldValidationStatus.description}
            />

            <CustomFieldsSection
              customFields={customFields}
              selectedCategory={selectedCategory}
              customFieldValues={customFieldValues}
              companyId={user?.company_id}
              setCustomFieldValues={setCustomFieldValues}
            />

            {/* Mobile-only attachments (shown below form on small screens) */}
            <div className="xl:hidden">
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  aria-label="Upload attachments"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="sr-only"
                  onChange={handleFileInputChange}
                />
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Attach files"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
                    dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  } ${isLimitReached ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm text-muted-foreground">
                    {attachedFiles.length > 0
                      ? `Add more files (${attachedFiles.length}/${attachmentSettings.max_files_per_ticket})`
                      : 'Attach files'}
                  </span>
                </div>
                {attachedFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachedFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5"
                      >
                        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs text-foreground">{file.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {fileErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fileErrors.map((error, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Mobile submit button */}
              <button
                type="submit"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                disabled={!canSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Request'
                )}
              </button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Drafts are saved locally until submitted.
              </p>
            </div>
          </div>

          {/* Sticky sidebar */}
          <div className="hidden xl:block">
            <div className="sticky top-4 space-y-4">
              <RequestSummaryPanel
                activeTemplate={activeTemplate}
                categoryLabel={selectedCategory?.label ?? ''}
                subcategoryLabel={selectedSubcategory?.label ?? null}
                priority={selectedPriority}
                attachedFiles={attachedFiles}
                approvalPlan={approvalPlan}
              />

              {/* Minimal attachment widget */}
              <div className="rounded-lg border bg-card p-3 shadow-sm">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Attachments
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  aria-label="Upload attachments"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="sr-only"
                  onChange={handleFileInputChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLimitReached}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">
                    {attachedFiles.length > 0
                      ? `Add more (${attachedFiles.length}/${attachmentSettings.max_files_per_ticket})`
                      : 'Attach files'}
                  </span>
                </button>
                {attachedFiles.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {attachedFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/40"
                      >
                        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs text-foreground">{file.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {fileErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fileErrors.map((error, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-destructive">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                disabled={!canSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Request'
                )}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Drafts are saved locally until submitted.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
