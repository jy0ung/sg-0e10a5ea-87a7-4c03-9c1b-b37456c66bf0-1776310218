import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { useRequestCategories } from '@/hooks/useRequestCategories';
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
  DATA_SOURCE_OPTIONS,
  FIELD_TYPE_OPTIONS,
  hasFormFieldChanges,
  type FormFieldDraft,
} from './shared';

interface Props {
  companyId: string;
  actorId: string;
  onActiveCountChange?: (count: number) => void;
}

/**
 * Form Builder tab content. Owns the per-category custom-field list, the
 * inline create form, and the per-row edit drawer. The shell only sees the
 * active-field count via onActiveCountChange.
 */
export function FormFieldEditor({ companyId, actorId, onActiveCountChange }: Props) {
  const { categories } = useRequestCategories(companyId, true);
  const { fields, loading, error, reload } = useRequestFormFields(companyId, { includeInactive: true });

  const [isAdding, setIsAdding] = useState(false);
  const [createCategoryKey, setCreateCategoryKey] = useState('');
  const [createLabel, setCreateLabel] = useState('');
  const [createType, setCreateType] = useState<RequestFormFieldType>('text');
  const [createSource, setCreateSource] = useState<RequestFieldDataSource>('branches');
  const [createPlaceholder, setCreatePlaceholder] = useState('');
  const [createHelpText, setCreateHelpText] = useState('');
  const [createRequired, setCreateRequired] = useState(false);
  const [creating, setCreating] = useState(false);

  const [busyFieldId, setBusyFieldId] = useState<string | null>(null);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FormFieldDraft>>({});

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

  const activeFieldCount = useMemo(
    () => fields.filter((field) => field.is_active).length,
    [fields],
  );
  useEffect(() => {
    onActiveCountChange?.(activeFieldCount);
  }, [activeFieldCount, onActiveCountChange]);

  const resetCreateForm = () => {
    setCreateCategoryKey('');
    setCreateLabel('');
    setCreateType('text');
    setCreateSource('branches');
    setCreatePlaceholder('');
    setCreateHelpText('');
    setCreateRequired(false);
  };

  const updateDraft = (field: RequestFormFieldRecord, patch: Partial<FormFieldDraft>) => {
    setFieldDrafts((current) => ({
      ...current,
      [field.id]: {
        ...current[field.id],
        label: field.label,
        field_type: field.field_type,
        data_source: field.data_source,
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
    setCreating(true);
    const result = await createRequestFormField(
      {
        category_key: createCategoryKey,
        label: createLabel,
        field_type: createType,
        data_source: createType === 'database_select' ? createSource : null,
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
        placeholder: draft.placeholder,
        help_text: draft.help_text,
        is_required: draft.is_required,
        is_active: draft.is_active,
      },
      { actorId, companyId },
    );
    if (result.error) {
      toast.error('Unable to save form field', { description: result.error });
    } else {
      toast.success('Form field saved');
      setExpandedFieldId(null);
      await reload();
    }
    setBusyFieldId(null);
  };

  const handleDelete = async (field: RequestFormFieldRecord) => {
    setBusyFieldId(field.id);
    const result = await deleteRequestFormField(field.id, { actorId, companyId });
    if (result.error) {
      toast.error('Unable to delete form field', { description: result.error });
    } else {
      toast.success('Form field deleted', { description: `"${field.label}" has been removed.` });
      setExpandedFieldId(null);
      await reload();
    }
    setBusyFieldId(null);
  };

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

      {isAdding && (
        <div className="space-y-4 rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">New custom field</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => { setIsAdding(false); resetCreateForm(); }}
              disabled={creating}
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="field-create-category">Category <span className="text-destructive">*</span></Label>
              <Select value={createCategoryKey} onValueChange={setCreateCategoryKey} disabled={creating}>
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
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Required before submit</p>
              <p className="text-xs text-muted-foreground">Requesters cannot submit until this field has a value.</p>
            </div>
            <Switch checked={createRequired} onCheckedChange={setCreateRequired} disabled={creating} />
          </div>

          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !createCategoryKey || !createLabel.trim()}
            className="gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add field
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading form fields...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Unable to load form fields</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void reload()}>Retry</Button>
        </div>
      ) : fields.length === 0 ? (
        !isAdding ? (
          <div className="flex items-center justify-center py-16">
            <Button type="button" onClick={() => setIsAdding(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Field
            </Button>
          </div>
        ) : null
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
                  const draft = fieldDrafts[field.id];
                  const isExpanded = expandedFieldId === field.id;
                  const isBusy = busyFieldId === field.id;
                  const isDirty = hasFormFieldChanges(field, draft);

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
                            {field.is_required && <Badge variant="outline">Required</Badge>}
                          </div>
                          {field.data_source && (
                            <p className="text-xs text-muted-foreground">
                              Source: {DATA_SOURCE_OPTIONS.find((option) => option.value === field.data_source)?.label ?? field.data_source}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" onClick={() => setExpandedFieldId(isExpanded ? null : field.id)} disabled={isBusy}>
                            {isExpanded ? 'Collapse' : 'Edit'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Delete ${field.label}`}
                            onClick={() => void handleDelete(field)}
                            disabled={isBusy}
                            className="text-destructive hover:text-destructive"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && draft && (
                        <div className="space-y-4 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor={`field-label-${field.id}`}>Label</Label>
                              <Input
                                id={`field-label-${field.id}`}
                                value={draft.label}
                                onChange={(event) => updateDraft(field, { label: event.target.value })}
                                disabled={isBusy}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`field-type-${field.id}`}>Type</Label>
                              <Select
                                value={draft.field_type}
                                onValueChange={(value) => updateDraft(field, { field_type: value as RequestFormFieldType })}
                                disabled={isBusy}
                              >
                                <SelectTrigger id={`field-type-${field.id}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {FIELD_TYPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {draft.field_type === 'database_select' && (
                              <div className="space-y-2">
                                <Label htmlFor={`field-source-${field.id}`}>Database source</Label>
                                <Select
                                  value={draft.data_source ?? 'branches'}
                                  onValueChange={(value) => updateDraft(field, { data_source: value as RequestFieldDataSource })}
                                  disabled={isBusy}
                                >
                                  <SelectTrigger id={`field-source-${field.id}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {DATA_SOURCE_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`field-placeholder-${field.id}`}>Placeholder</Label>
                              <Input
                                id={`field-placeholder-${field.id}`}
                                value={draft.placeholder}
                                onChange={(event) => updateDraft(field, { placeholder: event.target.value })}
                                disabled={isBusy}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`field-help-${field.id}`}>Help text</Label>
                              <Input
                                id={`field-help-${field.id}`}
                                value={draft.help_text}
                                onChange={(event) => updateDraft(field, { help_text: event.target.value })}
                                disabled={isBusy}
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">Required</p>
                                <p className="text-xs text-muted-foreground">Block submission when empty.</p>
                              </div>
                              <Switch checked={draft.is_required} onCheckedChange={(checked) => updateDraft(field, { is_required: checked })} disabled={isBusy} />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">Available</p>
                                <p className="text-xs text-muted-foreground">Hide without deleting historical values.</p>
                              </div>
                              <Switch checked={draft.is_active} onCheckedChange={(checked) => updateDraft(field, { is_active: checked })} disabled={isBusy} />
                            </div>
                          </div>

                          <Button type="button" onClick={() => void handleSave(field)} disabled={isBusy || !isDirty} className="gap-2">
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save changes
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
