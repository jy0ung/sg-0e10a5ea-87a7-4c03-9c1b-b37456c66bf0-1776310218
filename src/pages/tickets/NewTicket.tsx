import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertCircle, ListTodo } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useAttachmentSettings } from '@/hooks/useAttachmentSettings';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import {
  createTicket,
  findDuplicateTickets,
  type DuplicateTicketCandidate,
} from '@/services/ticketService';
import { getRequestModuleSettings } from '@/services/requestModuleSettingsService';
import { canManagePortalQueue } from '@/lib/portalAccess';
import { uploadTicketAttachment } from '@flc/platform-services';
import { getInternalRequestApprovalPlan } from '@flc/internal-requests';
import type { AppRole } from '@/types';
import {
  ACCEPTED_TYPES,
  DEFAULT_FORM,
  DEFAULT_ROLE_CONTEXT,
  ROLE_CONTEXT,
  ticketSchema,
  AttachmentsSection,
  RequestDescriptionCard,
  RequestHeaderCard,
  RequestSummaryCard,
  StickySubmitPanel,
  type ApprovalPlanState,
  type DescriptionSource,
  type TicketFormData,
} from './new-ticket/NewTicketSections';

const DRAFT_SAVE_DELAY_MS = 400;

export default function NewTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, loading: categoriesLoading, error: categoriesError } =
    useRequestCategories(user?.company_id);
  const { subcategories, loading: subcategoriesLoading } = useRequestSubcategories(user?.company_id);
  const { settings: attachmentSettings } = useAttachmentSettings(user?.company_id);

  const [submitting, setSubmitting] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [approvalConfirmData, setApprovalConfirmData] = useState<{ data: TicketFormData; duplicateOfTicketId?: string | null } | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<{ data: TicketFormData; candidates: DuplicateTicketCandidate[] } | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [descriptionSource, setDescriptionSource] = useState<DescriptionSource>('category');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRestoredRef = useRef(false);
  const skipDraftSaveRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  // Tracks the last description text we auto-filled from a category/subcategory,
  // so we only overwrite the body while it still holds that suggested text.
  const autoFilledDescriptionRef = useRef('');

  const roleContext = ROLE_CONTEXT[user?.role as AppRole] ?? DEFAULT_ROLE_CONTEXT;
  const canManageQueue = canManagePortalQueue(user);

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
      };
      if (parsed.values) {
        form.reset({ ...DEFAULT_FORM, ...parsed.values });
      }
      setCustomFieldValues(parsed.customFieldValues ?? {});
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, form]);

  useEffect(() => {
    if (!draftKey || !draftRestoredRef.current) return;

    const persistDraft = (values: Partial<TicketFormData>) => {
      if (skipDraftSaveRef.current) return;
      if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = window.setTimeout(() => {
        try {
          const savedAt = new Date();
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({ values, customFieldValues, updatedAt: savedAt.toISOString() }),
          );
          setDraftSavedAt(savedAt);
        } catch {
          // Ignore storage quota/private-mode errors; the live form state still works.
        } finally {
          draftSaveTimerRef.current = null;
        }
      }, DRAFT_SAVE_DELAY_MS);
    };

    persistDraft(form.getValues());
    const subscription = form.watch((values) => persistDraft(values));
    return () => {
      subscription.unsubscribe();
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [customFieldValues, draftKey, form]);

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
  const selectedSubcategoryKeyForFields = form.watch('subcategory');
  const { fields: customFields } = useRequestFormFields(selectedCategoryKey ? user?.company_id : undefined, {
    categoryKey: selectedCategoryKey || undefined,
    subcategoryKey: selectedSubcategoryKeyForFields || undefined,
  });

  useEffect(() => {
    if (customFields.length === 0) return;
    setCustomFieldValues((current) => {
      let changed = false;
      const next = { ...current };
      for (const field of customFields) {
        if (next[field.key] === undefined && field.default_value) {
          next[field.key] = field.default_value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [customFields]);

  const { data: requestModuleSettings } = useQuery({
    queryKey: ['request-module-settings', user?.company_id],
    queryFn: () => getRequestModuleSettings(user!.company_id),
    enabled: !!user?.company_id,
    staleTime: STALE.reference,
  });

  const { data: approvalPlan = 'loading' } = useQuery<ApprovalPlanState>({
    queryKey: ['approval-plan', user?.company_id, user?.id, selectedCategoryKey, selectedSubcategoryKeyForFields],
    queryFn: async (): Promise<ApprovalPlanState> => {
      const { data, error } = await getInternalRequestApprovalPlan(
        user!.company_id,
        user!.id,
        {
          categoryKey: selectedCategoryKey || null,
          subcategoryKey: selectedSubcategoryKeyForFields || null,
        },
      );
      if (error) return 'error';
      return data;
    },
    enabled: !!user?.company_id && !!user?.id && !!selectedCategoryKey,
    staleTime: STALE.reference,
    placeholderData: 'loading' as ApprovalPlanState,
  });

  const descriptionValue = form.watch('description') ?? '';
  const subjectValue = form.watch('subject') ?? '';
  const selectedSubcategoryKey = form.watch('subcategory');

  const availableSubcategories = useMemo(
    () => subcategories.filter((subcategory) => subcategory.category_key === selectedCategoryKey),
    [selectedCategoryKey, subcategories],
  );

  const selectedSubcategory = useMemo(
    () => availableSubcategories.find((subcategory) => subcategory.key === selectedSubcategoryKey) ?? null,
    [availableSubcategories, selectedSubcategoryKey],
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.key === selectedCategoryKey) ?? null,
    [categories, selectedCategoryKey],
  );

  useEffect(() => {
    const currentSubcategory = form.getValues('subcategory');

    if (availableSubcategories.length === 0) {
      if (currentSubcategory) form.setValue('subcategory', '', { shouldValidate: true });
      return;
    }
    if (currentSubcategory && !availableSubcategories.some((subcategory) => subcategory.key === currentSubcategory)) {
      form.setValue('subcategory', '', { shouldValidate: true });
    }
  }, [availableSubcategories, form]);

  // ── Description auto-fill from category / subcategory description ──────────
  // Default source is the subcategory's description, falling back to the
  // category's. We only overwrite the body while it still holds the last
  // suggested text — manual edits (or a restored draft) are preserved.
  const selectedCategoryDescription = selectedCategory?.description ?? '';
  const selectedSubcategoryDescription = selectedSubcategory?.description ?? '';

  useEffect(() => {
    if (descriptionSource === 'custom') return;
    const suggested = selectedSubcategoryKey
      ? selectedSubcategoryDescription
      : selectedCategoryDescription;
    const current = form.getValues('description') ?? '';
    // Respect text the user typed or a restored draft.
    if (current !== '' && current !== autoFilledDescriptionRef.current) return;
    autoFilledDescriptionRef.current = suggested;
    if (suggested !== current) {
      form.setValue('description', suggested, { shouldValidate: true });
    }
  }, [descriptionSource, selectedCategoryDescription, selectedSubcategoryDescription, selectedSubcategoryKey, form]);

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

  const submitTicket = async (data: TicketFormData, duplicateOfTicketId?: string | null) => {
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
        requested_due_date: data.requested_due_date ?? null,
        business_impact: data.business_impact ?? null,
        desired_outcome: data.desired_outcome ?? null,
        custom_fields: Object.fromEntries(
          customFields
            .map((field) => [field.key, customFieldValues[field.key]?.trim() ?? ''])
            .filter(([, value]) => Boolean(value)),
        ),
        vso_number: null,
        duplicate_of_ticket_id: duplicateOfTicketId ?? null,
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

    skipDraftSaveRef.current = true;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    setAttachedFiles([]);
    setFileErrors([]);
    form.reset({
      ...DEFAULT_FORM,
      category: firstCategoryKey,
      subcategory: '',
    });
    setCustomFieldValues({});
    autoFilledDescriptionRef.current = '';
    setDescriptionSource('category');
    if (draftKey) window.localStorage.removeItem(draftKey);
    toast.success('Request submitted', {
      description: 'Your request has been recorded and will be reviewed shortly.',
    });
    navigate('/portal/tickets');
    setSubmitting(false);
  };

  const continueAfterDuplicateReview = async (data: TicketFormData, duplicateOfTicketId?: string | null) => {
    setDuplicateReview(null);
    if (approvalPlan && approvalPlan !== 'loading' && approvalPlan !== 'error') {
      setApprovalConfirmData({ data, duplicateOfTicketId });
      return;
    }
    await submitTicket(data, duplicateOfTicketId);
  };

  const handleValidatedSubmit = async (data: TicketFormData) => {
    if (!user) return;
    setCheckingDuplicates(true);
    const { data: duplicateCandidates, error: duplicateError } = await findDuplicateTickets(
      {
        subject: data.subject.trim(),
        category: data.category,
        subcategory: data.subcategory ?? null,
        priority: data.priority,
        description: data.description,
        custom_fields: Object.fromEntries(
          customFields
            .map((field) => [field.key, customFieldValues[field.key]?.trim() ?? ''])
            .filter(([, value]) => Boolean(value)),
        ),
      },
      { userId: user.id, companyId: user.company_id },
    );
    setCheckingDuplicates(false);
    if (duplicateError) {
      toast.warning('Duplicate check unavailable', {
        description: 'You can still submit the request.',
      });
    } else if (duplicateCandidates && duplicateCandidates.length > 0) {
      setDuplicateReview({ data, candidates: duplicateCandidates });
      return;
    }

    if (approvalPlan && approvalPlan !== 'loading' && approvalPlan !== 'error') {
      setApprovalConfirmData({ data });
      return;
    }

    await submitTicket(data);
  };

  const categorySelectionDisabled = categoriesLoading || categories.length === 0;
  const requiresSubcategory = availableSubcategories.length > 0;
  const missingRequiredCustomFields = customFields.filter(
    (field) => field.is_required && !customFieldValues[field.key]?.trim(),
  );
  const approvalRouteBlocked = approvalPlan === 'loading' || approvalPlan === 'error';
  const approvalStepName = approvalPlan && approvalPlan !== 'loading' && approvalPlan !== 'error'
    ? approvalPlan.firstStepName || approvalPlan.approverRole?.replace(/_/g, ' ') || 'approval'
    : null;

  const canSubmit =
    !submitting &&
    !checkingDuplicates &&
    form.formState.isValid &&
    !categorySelectionDisabled &&
    !(requiresSubcategory && !selectedSubcategoryKey) &&
    missingRequiredCustomFields.length === 0 &&
    !approvalRouteBlocked;

  const handleCategoryChange = (categoryKey: string) => {
    form.setValue('category', categoryKey as TicketFormData['category'], {
      shouldValidate: true,
    });
    form.setValue('subcategory', '', { shouldValidate: true });
    if (descriptionSource !== 'custom') setDescriptionSource('category');
  };

  const handleSubcategoryChange = (subcategoryKey: string) => {
    form.setValue('subcategory', subcategoryKey, { shouldValidate: true });
    if (descriptionSource !== 'custom') setDescriptionSource('subcategory');
  };

  const handleDescriptionSourceChange = (source: DescriptionSource) => {
    if (source !== 'custom') {
      autoFilledDescriptionRef.current = form.getValues('description') ?? '';
    }
    setDescriptionSource(source);
  };

  const draftSavedLabel = draftSavedAt
    ? `Draft saved ${draftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;
  const submitBlocker = missingRequiredCustomFields.length > 0
    ? `${missingRequiredCustomFields.length} required field${missingRequiredCustomFields.length === 1 ? '' : 's'} remaining: ${missingRequiredCustomFields
      .map((field) => field.label)
      .join(', ')}`
    : approvalPlan === 'loading'
      ? 'Approval route is still being checked.'
      : approvalPlan === 'error'
        ? 'Approval route could not be verified. Contact an admin.'
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

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="shrink-0 [&>div]:mb-0">
        <PageHeader
          title={roleContext.pageTitle}
          description={roleContext.pageSubtitle}
          breadcrumbs={[
            { label: 'Internal Requests', path: '/portal' },
            { label: 'New request' },
          ]}
          actions={canManageQueue ? (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/portal/queue">
                <ListTodo className="h-4 w-4" />
                Open queue
              </Link>
            </Button>
          ) : undefined}
        />
      </div>

      {/* ── Error state ──────────────────────────────────────── */}
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

      {/* ── Two-column form ──────────────────────────────────── */}
      <form
        id="new-request-form"
        onSubmit={form.handleSubmit(handleValidatedSubmit)}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div className="grid gap-5 pb-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">

          {/* ── Left: main form ──────────────────────────────── */}
          <div className="space-y-5">
            <RequestHeaderCard
              form={form}
              categories={categories}
              categoriesLoading={categoriesLoading}
              categorySelectionDisabled={categorySelectionDisabled}
              selectedCategoryKey={selectedCategoryKey}
              availableSubcategories={availableSubcategories}
              subcategoriesLoading={subcategoriesLoading}
              selectedSubcategoryKey={selectedSubcategoryKey ?? ''}
              selectedSubcategory={selectedSubcategory}
              requiresSubcategory={requiresSubcategory}
              onCategoryChange={handleCategoryChange}
              onSubcategoryChange={handleSubcategoryChange}
              subjectValue={subjectValue}
              subjectStatus={fieldValidationStatus.subject}
              subjectPlaceholder={requestModuleSettings?.request_title_placeholder ?? 'Customer Name'}
              customFields={customFields}
              customFieldValues={customFieldValues}
              setCustomFieldValues={setCustomFieldValues}
              companyId={user?.company_id}
            />

            <RequestDescriptionCard
              form={form}
              roleContext={roleContext}
              descriptionValue={descriptionValue}
              descriptionStatus={fieldValidationStatus.description}
              descriptionSource={descriptionSource}
              onDescriptionSourceChange={handleDescriptionSourceChange}
              onDescriptionEdited={() => setDescriptionSource('custom')}
            />
          </div>

          {/* ── Right: operational sidebar ───────────────────── */}
          <div className="lg:self-start">
            <div className="sticky top-4 flex flex-col gap-4">

              {/* 1. Request Summary */}
              <RequestSummaryCard
                title={subjectValue}
                requestorName={user?.name || user?.email || 'Current user'}
              />

              {/* 2. Attachments */}
              <AttachmentsSection
                attachmentSettings={attachmentSettings}
                attachedFiles={attachedFiles}
                fileErrors={fileErrors}
                dragOver={dragOver}
                fileInputRef={fileInputRef}
                compact
                uploading={submitting}
                setDragOver={setDragOver}
                onDrop={handleDrop}
                onFileInputChange={handleFileInputChange}
                onRemoveFile={removeFile}
              />

              {/* 3. Submit */}
              <StickySubmitPanel
                canSubmit={canSubmit}
                submitting={submitting}
                draftSavedLabel={draftSavedLabel}
                submitBlocker={submitBlocker}
              />
            </div>
          </div>

        </div>
      </form>

      <AlertDialog
        open={Boolean(approvalConfirmData)}
        onOpenChange={(open) => {
          if (!open) setApprovalConfirmData(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit for approval?</AlertDialogTitle>
            <AlertDialogDescription>
              This request will be routed to {approvalStepName ?? 'the configured approver'} before the support team can resolve it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={() => {
                if (!approvalConfirmData) return;
                const { data, duplicateOfTicketId } = approvalConfirmData;
                setApprovalConfirmData(null);
                void submitTicket(data, duplicateOfTicketId);
              }}
            >
              Submit for approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(duplicateReview)} onOpenChange={(open) => { if (!open) setDuplicateReview(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Similar requests already exist</AlertDialogTitle>
            <AlertDialogDescription>
              Similar requests already exist. Please review before submitting a new request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            {duplicateReview?.candidates.map((candidate) => (
              <div key={candidate.id} className="rounded-md border border-border px-3 py-2">
                <p className="text-sm font-medium text-foreground">{candidate.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {candidate.status.replace(/_/g, ' ')} · Updated {new Date(candidate.updated_at).toLocaleDateString()} · Match {candidate.score}%
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate('/portal/tickets')}>
                    Open existing
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (!duplicateReview) return;
                      void continueAfterDuplicateReview(duplicateReview.data, candidate.id);
                    }}
                  >
                    Link and submit
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={() => {
                if (!duplicateReview) return;
                void continueAfterDuplicateReview(duplicateReview.data, null);
              }}
            >
              Continue without linking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
