import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, ListPlus, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import {
  createRequestFormField,
  deleteRequestFormField,
  updateRequestFormField,
  type RequestFieldDataSource,
  type RequestFormFieldRecord,
  type RequestFormFieldType,
} from '@flc/internal-requests';

import {
  CONFLICT_RELOAD_MESSAGE,
  DATA_SOURCE_OPTIONS,
  FIELD_TYPE_OPTIONS,
  hasFormFieldChanges,
  isConflict,
  type FormFieldDraft,
} from './shared';

interface Props {
  companyId: string;
  actorId: string;
  onActiveCountChange?: (count: number) => void;
}

// Radix Select cannot use an empty string value, so represent the
// "applies to every subcategory" choice with an explicit sentinel.
const ALL_SUBCATEGORIES = '__all__';

/**
 * Form Builder tab content. Owns the per-category custom-field list, the
 * create dialog, and the per-row edit dialog. The shell only sees the
 * active-field count via onActiveCountChange.
 */
export function FormFieldEditor({ companyId, actorId, onActiveCountChange }: Props) {
  const { categories } = useRequestCategories(companyId, true);
  const { subcategories } = useRequestSubcategories(companyId, { includeInactive: true });
  const { fields, loading, error, reload } = useRequestFormFields(companyId, { includeInactive: true });

  const [isAdding, setIsAdding] = useState(false);
  const [createCategoryKey, setCreateCategoryKey] = useState('');
  const [createSubcategoryKey, setCreateSubcategoryKey] = useState(ALL_SUBCATEGORIES);
  const [createLabel, setCreateLabel] = useState('');
  const [createType, setCreateType] = useState<RequestFormFieldType>('text');
  const [createSource, setCreateSource] = useState<RequestFieldDataSource>('branches');
  const [createPlaceholder, setCreatePlaceholder] = useState('');
  const [createHelpText, setCreateHelpText] = useState('');
  const [createDefaultValue, setCreateDefaultValue] = useState('');
  const [createOptionsText, setCreateOptionsText] = useState('');
  const [createValidationRules, setCreateValidationRules] = useState('');
  const [createConditionalLogic, setCreateConditionalLogic] = useState('');
  const [createRequired, setCreateRequired] = useState(false);
  const [creating, setCreating] = useState(false);

  const [busyFieldId, setBusyFieldId] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FormFieldDraft>>({});
  // Field awaiting delete confirmation, and the field whose last save hit an
  // optimistic-lock conflict (drives the inline "reload" banner in the dialog).
  const [deletingField, setDeletingField] = useState<RequestFormFieldRecord | null>(null);
  const [conflictFieldId, setConflictFieldId] = useState<string | null>(null);

  // Reseed drafts whenever the server list changes so saving picks up server
  // canonical values for unedited fields.
  useEffect(() => {
    setFieldDrafts(
      Object.fromEntries(
        fields.map((field) => [
          field.id,
          {
            label: field.label,
            field_type: field.field_type,
            data_source: field.data_source,
            options: field.options,
            default_value: field.default_value,
            validation_rules: field.validation_rules,
            conditional_logic: field.conditional_logic,
            placeholder: field.placeholder,
            help_text: field.help_text,
            is_required: field.is_required,
            is_active: field.is_active,
          },
        ]),
      ),
    );
  }, [fields]);

  const fieldsByCategory = useMemo(
    () => fields.reduce<Record<string, RequestFormFieldRecord[]>>((grouped, field) => {
      grouped[field.category_key] ??= [];
      grouped[field.category_key].push(field);
      return grouped;
    }, {}),
    [fields],
  );

  const subcategoryLabels = useMemo(
    () => new Map(subcategories.map((subcategory) => [`${subcategory.category_key}:${subcategory.key}`, subcategory.label])),
    [subcategories],
  );

  const availableCreateSubcategories = useMemo(
    () => subcategories.filter((subcategory) => subcategory.category_key === createCategoryKey && subcategory.is_active),
    [createCategoryKey, subcategories],
  );

  const activeFieldCount = useMemo(
    () => fields.filter((field) => field.is_active).length,
    [fields],
  );
  useEffect(() => {
    onActiveCountChange?.(activeFieldCount);
  }, [activeFieldCount, onActiveCountChange]);

  const resetCreateForm = () => {
    setCreateCategoryKey('');
    setCreateSubcategoryKey(ALL_SUBCATEGORIES);
    setCreateLabel('');
    setCreateType('text');
    setCreateSource('branches');
    setCreatePlaceholder('');
    setCreateHelpText('');
    setCreateDefaultValue('');
    setCreateOptionsText('');
    setCreateValidationRules('');
    setCreateConditionalLogic('');
    setCreateRequired(false);
  };

  const parseOptions = (value: string) =>
    value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, explicitValue] = line.split('|').map((part) => part.trim());
        return { label, value: explicitValue || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') };
      });

  const parseJsonObject = (value: string, label: string) => {
    if (!value.trim()) return {};
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object expected');
      return parsed as Record<string, unknown>;
    } catch {
      toast.error(`${label} must be valid JSON object syntax.`);
      return null;
    }
  };

  const updateDraft = (field: RequestFormFieldRecord, patch: Partial<FormFieldDraft>) => {
    setFieldDrafts((current) => ({
      ...current,
      [field.id]: {
        ...current[field.id],
        label: field.label,
        field_type: field.field_type,
        data_source: field.data_source,
        options: field.options,
        default_value: field.default_value,
        validation_rules: field.validation_rules,
        conditional_logic: field.conditional_logic,
        placeholder: field.placeholder,
        help_text: field.help_text,
        is_required: field.is_required,
        is_active: field.is_active,
        ...patch,
      },
    }));
  };

  const handleCreate = async () => {
    if (!createCategoryKey || !createLabel.trim()) return;
    const validationRules = parseJsonObject(createValidationRules, 'Validation rules');
    const conditionalLogic = parseJsonObject(createConditionalLogic, 'Conditional logic');
    if (!validationRules || !conditionalLogic) return;
    setCreating(true);
    const result = await createRequestFormField(
      {
        category_key: createCategoryKey,
        subcategory_key: createSubcategoryKey === ALL_SUBCATEGORIES ? null : createSubcategoryKey,
        label: createLabel,
        field_type: createType,
        data_source: createType === 'database_select' ? createSource : null,
        options: parseOptions(createOptionsText),
        default_value: createDefaultValue,
        validation_rules: validationRules,
        conditional_logic: conditionalLogic,
        placeholder: createPlaceholder,
        help_text: createHelpText,
        is_required: createRequired,
      },
      { actorId, companyId },
    );
    if (result.error) {
      toast.error('Unable to create form field', { description: result.error });
    } else {
      toast.success('Form field created');
      setIsAdding(false);
      resetCreateForm();
      await reload();
    }
    setCreating(false);
  };

  const handleSave = async (field: RequestFormFieldRecord) => {
    const draft = fieldDrafts[field.id];
    if (!draft || !hasFormFieldChanges(field, draft)) return;
    setBusyFieldId(field.id);
    const result = await updateRequestFormField(
      field.id,
      {
        label: draft.label,
        field_type: draft.field_type,
        data_source: draft.field_type === 'database_select' ? draft.data_source ?? 'branches' : null,
        options: draft.options,
        default_value: draft.default_value,
        validation_rules: draft.validation_rules,
        conditional_logic: draft.conditional_logic,
        placeholder: draft.placeholder,
        help_text: draft.help_text,
        is_required: draft.is_required,
        is_active: draft.is_active,
        expectedUpdatedAt: field.updated_at,
      },
      { actorId, companyId },
    );
    if (isConflict(result)) {
      setConflictFieldId(field.id);
    } else if (result.error) {
      toast.error('Unable to save form field', { description: result.error });
    } else {
      toast.success('Form field saved');
      setConflictFieldId(null);
      setEditingFieldId(null);
      await reload();
    }
    setBusyFieldId(null);
  };

  const handleDelete = async (field: RequestFormFieldRecord) => {
    setBusyFieldId(field.id);
    const result = await deleteRequestFormField(field.id, { actorId, companyId }, field.updated_at);
    if (isConflict(result)) {
      toast.error('Field changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reload();
    } else if (result.error) {
      toast.error('Unable to delete form field', { description: result.error });
    } else {
      toast.success('Form field deleted', { description: `"${field.label}" has been removed.` });
      setEditingFieldId(null);
      await reload();
    }
    setDeletingField(null);
    setBusyFieldId(null);
  };

  const moveField = async (fieldId: string, direction: 'up' | 'down') => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    const categoryFields = fieldsByCategory[field.category_key] ?? [];
    const index = categoryFields.findIndex((f) => f.id === fieldId);
    if (index < 0) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= categoryFields.length) return;
    const other = categoryFields[swapIndex];

    const fieldSort = field.sort_order;
    const otherSort = other.sort_order;

    setBusyFieldId(fieldId);
    const [r1, r2] = await Promise.all([
      updateRequestFormField(field.id, { sort_order: otherSort, expectedUpdatedAt: field.updated_at }, { actorId, companyId }),
      updateRequestFormField(other.id, { sort_order: fieldSort, expectedUpdatedAt: other.updated_at }, { actorId, companyId }),
    ]);
    if (r1.error || r2.error) {
      toast.error('Unable to reorder field', { description: (r1.error ?? r2.error) as string });
    } else {
      toast.success('Field reordered');
      await reload();
    }
    setBusyFieldId(null);
  };


  const editingField = fields.find((field) => field.id === editingFieldId) ?? null;
  const editingDraft = editingField ? fieldDrafts[editingField.id] : null;
  const editingBusy = editingField ? busyFieldId === editingField.id : false;
  const editingDirty = editingField && editingDraft
    ? hasFormFieldChanges(editingField, editingDraft)
    : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Custom Request Fields</p>
          <p className="text-sm text-muted-foreground">
            Add per-category fields requesters must complete before submission.
          </p>
        </div>
        {!isAdding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsAdding(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
        )}
      </div>

      <Sheet open={isAdding} onOpenChange={(open) => {
        setIsAdding(open);
        if (!open) resetCreateForm();
      }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>New custom field</SheetTitle>
            <SheetDescription>Add a per-category field requesters complete before submitting.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="field-create-category">Category <span className="text-destructive">*</span></Label>
              <Select
                value={createCategoryKey}
                onValueChange={(value) => {
                  setCreateCategoryKey(value);
                  setCreateSubcategoryKey(ALL_SUBCATEGORIES);
                }}
                disabled={creating}
              >
                <SelectTrigger id="field-create-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.filter((category) => category.is_active).map((category) => (
                    <SelectItem key={category.key} value={category.key}>{category.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-create-label">Label <span className="text-destructive">*</span></Label>
              <Input
                id="field-create-label"
                placeholder="e.g. Vehicle"
                value={createLabel}
                onChange={(event) => setCreateLabel(event.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-create-type">Type</Label>
              <Select value={createType} onValueChange={(value) => setCreateType(value as RequestFormFieldType)} disabled={creating}>
                <SelectTrigger id="field-create-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {createType === 'database_select' && (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="field-create-source">Database source</Label>
              <Select value={createSource} onValueChange={(value) => setCreateSource(value as RequestFieldDataSource)} disabled={creating}>
                <SelectTrigger id="field-create-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATA_SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(['select', 'multiselect', 'radio'].includes(createType)) && (
            <div className="space-y-2">
              <Label htmlFor="field-create-options">Options</Label>
              <Textarea
                id="field-create-options"
                value={createOptionsText}
                onChange={(event) => setCreateOptionsText(event.target.value)}
                placeholder={'One option per line. Use Label | value when needed.'}
                rows={4}
                disabled={creating}
              />
            </div>
          )}

          <div className="max-w-xs space-y-2">
            <Label htmlFor="field-create-subcategory">Subcategory</Label>
            <Select
              value={createSubcategoryKey}
              onValueChange={setCreateSubcategoryKey}
              disabled={creating || !createCategoryKey}
            >
              <SelectTrigger id="field-create-subcategory"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SUBCATEGORIES}>All subcategories</SelectItem>
                {availableCreateSubcategories.map((subcategory) => (
                  <SelectItem key={subcategory.key} value={subcategory.key}>{subcategory.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Limit this field to one subcategory, or leave as “All subcategories” to show it for every subcategory of the category.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="field-create-placeholder">Placeholder</Label>
              <Input
                id="field-create-placeholder"
                value={createPlaceholder}
                onChange={(event) => setCreatePlaceholder(event.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-create-help">Help text</Label>
              <Input
                id="field-create-help"
                value={createHelpText}
                onChange={(event) => setCreateHelpText(event.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-create-default">Default value</Label>
              <Input
                id="field-create-default"
                value={createDefaultValue}
                onChange={(event) => setCreateDefaultValue(event.target.value)}
                disabled={creating}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="field-create-validation">Validation rules</Label>
              <Textarea
                id="field-create-validation"
                value={createValidationRules}
                onChange={(event) => setCreateValidationRules(event.target.value)}
                placeholder='{"minLength": 3}'
                rows={3}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-create-conditional">Conditional logic</Label>
              <Textarea
                id="field-create-conditional"
                value={createConditionalLogic}
                onChange={(event) => setCreateConditionalLogic(event.target.value)}
                placeholder='{"showWhen": {"field": "urgency", "equals": "high"}}'
                rows={3}
                disabled={creating}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Required before submit</p>
              <p className="text-xs text-muted-foreground">Requesters cannot submit until this field has a value.</p>
            </div>
            <Switch checked={createRequired} onCheckedChange={setCreateRequired} disabled={creating} />
          </div>

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsAdding(false); resetCreateForm(); }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !createCategoryKey || !createLabel.trim()}
              className="gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add field
            </Button>
          </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading form fields...</span>
        </div>
      ) : error ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load form fields"
          description={error}
          action={{ label: 'Retry', onClick: () => void reload() }}
        />
      ) : fields.length === 0 ? (
        <HrmsEmptyState
          icon={ListPlus}
          title="No custom fields yet"
          description="Add per-category fields requesters must complete before submitting a request."
          action={{ label: 'Add field', onClick: () => setIsAdding(true) }}
        />
      ) : (
        <div className="space-y-5">
          {categories.map((category) => {
            const categoryFields = fieldsByCategory[category.key] ?? [];
            if (categoryFields.length === 0) return null;

            return (
              <div key={category.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{category.label}</p>
                  <Badge variant="outline">{categoryFields.length}</Badge>
                </div>
                {categoryFields.map((field) => {
                  const isBusy = busyFieldId === field.id;

                  return (
                    <div key={field.id} className="space-y-4 rounded-xl border border-border bg-background p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">{field.label}</p>
                            <Badge variant={field.is_active ? 'secondary' : 'outline'}>
                              {field.is_active ? 'Active' : 'Archived'}
                            </Badge>
                            <Badge variant="outline">
                              {FIELD_TYPE_OPTIONS.find((option) => option.value === field.field_type)?.label ?? field.field_type}
                            </Badge>
                            <Badge variant="outline">
                              {field.subcategory_key
                                ? (subcategoryLabels.get(`${field.category_key}:${field.subcategory_key}`) ?? field.subcategory_key)
                                : 'All subcategories'}
                            </Badge>
                            {field.is_required && <Badge variant="outline">Required</Badge>}
                          </div>
              {field.data_source && (
                            <p className="text-xs text-muted-foreground">
                              Source: {DATA_SOURCE_OPTIONS.find((option) => option.value === field.data_source)?.label ?? field.data_source}
                            </p>
                          )}
                          {field.options.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Options: {field.options.map((option) => option.label).join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Move ${field.label} up`}
                            onClick={() => void moveField(field.id, 'up')}
                            disabled={isBusy || categoryFields.indexOf(field) === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Move ${field.label} down`}
                            onClick={() => void moveField(field.id, 'down')}
                            disabled={isBusy || categoryFields.indexOf(field) === categoryFields.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setEditingFieldId(field.id)} disabled={isBusy}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${field.label}`}
                            onClick={() => setDeletingField(field)}
                            disabled={isBusy}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!editingField} onOpenChange={(open) => { if (!open) { setEditingFieldId(null); setConflictFieldId(null); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Edit custom field</SheetTitle>
            <SheetDescription>{editingField ? editingField.label : ''}</SheetDescription>
          </SheetHeader>
          {editingField && editingDraft && (
            <div className="mt-4 space-y-4">
              {conflictFieldId === editingField.id && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>{CONFLICT_RELOAD_MESSAGE}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setConflictFieldId(null); setEditingFieldId(null); void reload(); }}
                    >
                      Reload
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`field-label-${editingField.id}`}>Label</Label>
                  <Input
                    id={`field-label-${editingField.id}`}
                    value={editingDraft.label}
                    onChange={(event) => updateDraft(editingField, { label: event.target.value })}
                    disabled={editingBusy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`field-type-${editingField.id}`}>Type</Label>
                  <Select
                    value={editingDraft.field_type}
                    onValueChange={(value) => updateDraft(editingField, { field_type: value as RequestFormFieldType })}
                    disabled={editingBusy}
                  >
                    <SelectTrigger id={`field-type-${editingField.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editingDraft.field_type === 'database_select' && (
                  <div className="space-y-2">
                    <Label htmlFor={`field-source-${editingField.id}`}>Database source</Label>
                    <Select
                      value={editingDraft.data_source ?? 'branches'}
                      onValueChange={(value) => updateDraft(editingField, { data_source: value as RequestFieldDataSource })}
                      disabled={editingBusy}
                    >
                      <SelectTrigger id={`field-source-${editingField.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DATA_SOURCE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {(['select', 'multiselect', 'radio'].includes(editingDraft.field_type)) && (
                <div className="space-y-2">
                  <Label htmlFor={`field-options-${editingField.id}`}>Options</Label>
                  <Textarea
                    id={`field-options-${editingField.id}`}
                    value={editingDraft.options.map((option) => `${option.label}${option.value !== option.label ? ` | ${option.value}` : ''}`).join('\n')}
                    onChange={(event) => updateDraft(editingField, { options: parseOptions(event.target.value) })}
                    placeholder={'One option per line. Use Label | value when needed.'}
                    rows={4}
                    disabled={editingBusy}
                  />
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`field-placeholder-${editingField.id}`}>Placeholder</Label>
                  <Input
                    id={`field-placeholder-${editingField.id}`}
                    value={editingDraft.placeholder}
                    onChange={(event) => updateDraft(editingField, { placeholder: event.target.value })}
                    disabled={editingBusy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`field-help-${editingField.id}`}>Help text</Label>
                  <Input
                    id={`field-help-${editingField.id}`}
                    value={editingDraft.help_text}
                    onChange={(event) => updateDraft(editingField, { help_text: event.target.value })}
                    disabled={editingBusy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`field-default-${editingField.id}`}>Default value</Label>
                  <Input
                    id={`field-default-${editingField.id}`}
                    value={editingDraft.default_value}
                    onChange={(event) => updateDraft(editingField, { default_value: event.target.value })}
                    disabled={editingBusy}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`field-validation-${editingField.id}`}>Validation rules</Label>
                  <Textarea
                    id={`field-validation-${editingField.id}`}
                    value={JSON.stringify(editingDraft.validation_rules, null, 2)}
                    onChange={(event) => {
                      const parsed = parseJsonObject(event.target.value, 'Validation rules');
                      if (parsed) updateDraft(editingField, { validation_rules: parsed });
                    }}
                    rows={4}
                    disabled={editingBusy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`field-conditional-${editingField.id}`}>Conditional logic</Label>
                  <Textarea
                    id={`field-conditional-${editingField.id}`}
                    value={JSON.stringify(editingDraft.conditional_logic, null, 2)}
                    onChange={(event) => {
                      const parsed = parseJsonObject(event.target.value, 'Conditional logic');
                      if (parsed) updateDraft(editingField, { conditional_logic: parsed });
                    }}
                    rows={4}
                    disabled={editingBusy}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Required</p>
                    <p className="text-xs text-muted-foreground">Block submission when empty.</p>
                  </div>
                  <Switch checked={editingDraft.is_required} onCheckedChange={(checked) => updateDraft(editingField, { is_required: checked })} disabled={editingBusy} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Available</p>
                    <p className="text-xs text-muted-foreground">Hide without deleting historical values.</p>
                  </div>
                  <Switch checked={editingDraft.is_active} onCheckedChange={(checked) => updateDraft(editingField, { is_active: checked })} disabled={editingBusy} />
                </div>
              </div>
            </div>
          )}
          <SheetFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingFieldId(null)} disabled={editingBusy}>Cancel</Button>
            <Button
              type="button"
              onClick={() => { if (editingField) void handleSave(editingField); }}
              disabled={!editingField || editingBusy || !editingDirty}
              className="gap-2"
            >
              {editingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deletingField !== null}
        onOpenChange={(open) => { if (!open) setDeletingField(null); }}
        title="Delete custom field"
        description={
          deletingField
            ? `"${deletingField.label}" will be permanently removed from the request form. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete field"
        confirmVariant="destructive"
        loading={deletingField ? busyFieldId === deletingField.id : false}
        onConfirm={() => { if (deletingField) void handleDelete(deletingField); }}
      />
    </div>
  );
}
