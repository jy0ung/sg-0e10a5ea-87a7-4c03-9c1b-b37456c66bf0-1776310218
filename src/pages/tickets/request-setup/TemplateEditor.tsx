import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestTemplates } from '@/hooks/useRequestTemplates';
import {
  createRequestTemplate,
  deleteRequestTemplate,
  moveRequestTemplate,
  updateRequestTemplate,
  type RequestTemplateRecord,
  type TemplatePriority,
} from '@/services/requestTemplateService';

import {
  NONE_SELECT_VALUE,
  PRIORITY_OPTIONS,
  hasTemplateChanges,
  optionalSelectValue,
  type TemplateDraft,
} from './shared';

interface Props {
  companyId: string;
  actorId: string;
  onActiveCountChange?: (count: number) => void;
}

/**
 * Request Templates tab content. Owns the template list, create form, and
 * per-row inline editor. Categories + subcategories are loaded locally for
 * the picker dropdowns (React Query dedupes the request with the shell).
 */
export function TemplateEditor({ companyId, actorId, onActiveCountChange }: Props) {
  const { categories } = useRequestCategories(companyId, true);
  const { subcategories } = useRequestSubcategories(companyId, { includeInactive: true });
  const { templates, loading, error, reload } = useRequestTemplates(companyId, { includeInactive: true });

  const [isAdding, setIsAdding] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createCategoryKey, setCreateCategoryKey] = useState('');
  const [createSubcategoryKey, setCreateSubcategoryKey] = useState('');
  const [createPriority, setCreatePriority] = useState<TemplatePriority>('medium');
  const [createSubject, setCreateSubject] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [creating, setCreating] = useState(false);

  const [templateDrafts, setTemplateDrafts] = useState<Record<string, TemplateDraft>>({});
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    setTemplateDrafts(
      Object.fromEntries(
        templates.map((t) => [
          t.id,
          {
            name: t.name,
            description: t.description,
            category_key: t.category_key,
            subcategory_key: t.subcategory_key ?? '',
            priority: t.priority,
            subject: t.subject,
            body: t.body,
            is_active: t.is_active,
          },
        ]),
      ),
    );
  }, [templates]);

  const activeTemplateCount = useMemo(
    () => templates.filter((t) => t.is_active).length,
    [templates],
  );
  useEffect(() => {
    onActiveCountChange?.(activeTemplateCount);
  }, [activeTemplateCount, onActiveCountChange]);

  const activeSubcategoriesForKey = useCallback(
    (key: string) => subcategories.filter((s) => s.category_key === key && s.is_active),
    [subcategories],
  );

  const resetCreateForm = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateCategoryKey('');
    setCreateSubcategoryKey('');
    setCreatePriority('medium');
    setCreateSubject('');
    setCreateBody('');
  };

  const updateDraft = (template: RequestTemplateRecord, patch: Partial<TemplateDraft>) => {
    setTemplateDrafts((current) => ({
      ...current,
      [template.id]: {
        ...(current[template.id] ?? {
          name: template.name,
          description: template.description,
          category_key: template.category_key,
          subcategory_key: template.subcategory_key ?? '',
          priority: template.priority,
          subject: template.subject,
          body: template.body,
          is_active: template.is_active,
        }),
        ...patch,
      },
    }));
  };

  const handleCreate = async () => {
    setCreating(true);
    const result = await createRequestTemplate(
      {
        name: createName,
        description: createDescription,
        category_key: createCategoryKey,
        subcategory_key: createSubcategoryKey || null,
        priority: createPriority,
        subject: createSubject,
        body: createBody,
      },
      { actorId, companyId },
    );
    if (result.error) {
      toast.error('Unable to create template', { description: result.error });
    } else {
      toast.success('Template created', {
        description: 'Requesters can now pick this template when creating a new request.',
      });
      setIsAdding(false);
      resetCreateForm();
      await reload();
    }
    setCreating(false);
  };

  const handleSave = async (template: RequestTemplateRecord) => {
    const draft = templateDrafts[template.id];
    if (!draft || !hasTemplateChanges(template, draft)) return;
    setBusyTemplateId(template.id);
    const result = await updateRequestTemplate(
      template.id,
      {
        name: draft.name,
        description: draft.description,
        category_key: draft.category_key,
        subcategory_key: draft.subcategory_key || null,
        priority: draft.priority,
        subject: draft.subject,
        body: draft.body,
        is_active: draft.is_active,
      },
      { actorId, companyId },
    );
    if (result.error) toast.error('Unable to save template', { description: result.error });
    else { toast.success('Template saved'); await reload(); }
    setBusyTemplateId(null);
  };

  const handleMove = async (templateId: string, direction: 'up' | 'down') => {
    setBusyTemplateId(templateId);
    const result = await moveRequestTemplate(templateId, direction, { actorId, companyId });
    if (result.error) toast.error('Unable to reorder templates', { description: result.error });
    else await reload();
    setBusyTemplateId(null);
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    setBusyTemplateId(templateId);
    const result = await deleteRequestTemplate(templateId, { actorId, companyId });
    if (result.error) {
      toast.error('Unable to delete template', { description: result.error });
    } else {
      toast.success('Template deleted', { description: `"${templateName}" has been removed.` });
      setExpandedTemplateId(null);
      await reload();
    }
    setBusyTemplateId(null);
  };

  return (
    <div className="space-y-4">
      {isAdding && (
        <div className="space-y-4 rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">New template</p>
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-create-name">Template name <span className="text-destructive">*</span></Label>
              <Input
                id="template-create-name"
                placeholder="e.g. VIN Transfer Request"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-create-description">Description</Label>
              <Input
                id="template-create-description"
                placeholder="When should employees use this template?"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                disabled={creating}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="template-create-category">Category <span className="text-destructive">*</span></Label>
              <Select
                value={createCategoryKey}
                onValueChange={(v) => { setCreateCategoryKey(v); setCreateSubcategoryKey(''); }}
                disabled={creating || categories.length === 0}
              >
                <SelectTrigger id="template-create-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-create-subcategory">Subcategory</Label>
              <Select
                value={createSubcategoryKey || NONE_SELECT_VALUE}
                onValueChange={(value) => setCreateSubcategoryKey(optionalSelectValue(value))}
                disabled={creating || !createCategoryKey || activeSubcategoriesForKey(createCategoryKey).length === 0}
              >
                <SelectTrigger id="template-create-subcategory">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
                  {activeSubcategoriesForKey(createCategoryKey).map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-create-priority">Default priority <span className="text-destructive">*</span></Label>
              <Select
                value={createPriority}
                onValueChange={(v) => setCreatePriority(v as TemplatePriority)}
                disabled={creating}
              >
                <SelectTrigger id="template-create-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-create-subject">Subject <span className="text-destructive">*</span></Label>
            <Input
              id="template-create-subject"
              placeholder="Pre-filled subject line for this request"
              value={createSubject}
              onChange={(event) => setCreateSubject(event.target.value)}
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-create-body">Body <span className="text-destructive">*</span></Label>
            <Textarea
              id="template-create-body"
              placeholder="Pre-filled description requesters can edit before submitting."
              value={createBody}
              onChange={(event) => setCreateBody(event.target.value)}
              rows={5}
              disabled={creating}
            />
          </div>

          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={
              creating
              || createName.trim().length === 0
              || !createCategoryKey
              || createSubject.trim().length === 0
              || createBody.trim().length === 0
            }
            className="gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add template
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading templates...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Unable to load templates</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void reload()}>Retry</Button>
        </div>
      ) : templates.length === 0 ? (
        !isAdding ? (
          <div className="flex items-center justify-center py-16">
            <Button type="button" onClick={() => setIsAdding(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Template
            </Button>
          </div>
        ) : null
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline">
              {templates.length} {templates.length === 1 ? 'template' : 'templates'}
            </Badge>
            {!isAdding && (
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAdding(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Template
              </Button>
            )}
          </div>

          {templates.map((template, tIdx) => {
            const draft = templateDrafts[template.id];
            const isBusy = busyTemplateId === template.id;
            const isDirty = hasTemplateChanges(template, draft);
            const isExpanded = expandedTemplateId === template.id;
            const draftCategoryKey = draft?.category_key ?? template.category_key;
            const draftSubcategories = activeSubcategoriesForKey(draftCategoryKey);

            return (
              <div key={template.id} className="space-y-4 rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{template.name}</p>
                      <Badge variant={template.is_active ? 'secondary' : 'outline'}>
                        {template.is_active ? 'Active' : 'Archived'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{template.priority}</Badge>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Category: <span className="font-medium">{categories.find((c) => c.key === template.category_key)?.label ?? template.category_key}</span>
                      {template.subcategory_key && (
                        <> · Subcategory: <span className="font-medium">{subcategories.find((s) => s.key === template.subcategory_key)?.label ?? template.subcategory_key}</span></>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Move ${template.name} up`}
                      onClick={() => void handleMove(template.id, 'up')}
                      disabled={isBusy || tIdx === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Move ${template.name} down`}
                      onClick={() => void handleMove(template.id, 'down')}
                      disabled={isBusy || tIdx === templates.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                      disabled={isBusy}
                    >
                      {isExpanded ? 'Collapse' : 'Edit'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => void handleDelete(template.id, template.name)}
                      disabled={isBusy}
                      className="text-destructive hover:text-destructive"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && draft && (
                  <div className="space-y-4 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`template-name-${template.id}`}>Template name</Label>
                        <Input
                          id={`template-name-${template.id}`}
                          value={draft.name}
                          onChange={(event) => updateDraft(template, { name: event.target.value })}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`template-desc-${template.id}`}>Description</Label>
                        <Input
                          id={`template-desc-${template.id}`}
                          value={draft.description}
                          onChange={(event) => updateDraft(template, { description: event.target.value })}
                          disabled={isBusy}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor={`template-cat-${template.id}`}>Category</Label>
                        <Select
                          value={draft.category_key}
                          onValueChange={(v) => updateDraft(template, { category_key: v, subcategory_key: '' })}
                          disabled={isBusy || categories.length === 0}
                        >
                          <SelectTrigger id={`template-cat-${template.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`template-subcat-${template.id}`}>Subcategory</Label>
                        <Select
                          value={draft.subcategory_key || NONE_SELECT_VALUE}
                          onValueChange={(value) => updateDraft(template, { subcategory_key: optionalSelectValue(value) })}
                          disabled={isBusy || draftSubcategories.length === 0}
                        >
                          <SelectTrigger id={`template-subcat-${template.id}`}>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
                            {draftSubcategories.map((s) => (
                              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`template-priority-${template.id}`}>Priority</Label>
                        <Select
                          value={draft.priority}
                          onValueChange={(v) => updateDraft(template, { priority: v as TemplatePriority })}
                          disabled={isBusy}
                        >
                          <SelectTrigger id={`template-priority-${template.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`template-subject-${template.id}`}>Subject</Label>
                      <Input
                        id={`template-subject-${template.id}`}
                        value={draft.subject}
                        onChange={(event) => updateDraft(template, { subject: event.target.value })}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`template-body-${template.id}`}>Body</Label>
                      <Textarea
                        id={`template-body-${template.id}`}
                        value={draft.body}
                        onChange={(event) => updateDraft(template, { body: event.target.value })}
                        rows={5}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Available to requesters</p>
                        <p className="text-xs text-muted-foreground">
                          Archive to hide this template without deleting it.
                        </p>
                      </div>
                      <Switch
                        checked={draft.is_active}
                        onCheckedChange={(checked) => updateDraft(template, { is_active: checked })}
                        disabled={isBusy}
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => void handleSave(template)}
                      disabled={isBusy || !isDirty}
                      className="gap-2"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save changes
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
