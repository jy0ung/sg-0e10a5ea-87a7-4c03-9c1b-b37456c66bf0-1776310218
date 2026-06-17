import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { SortableList } from '@/components/ui/SortableList';

import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestTemplates } from '@/hooks/useRequestTemplates';
import {
  createRequestTemplate,
  deleteRequestTemplate,
  reorderRequestTemplates,
  updateRequestTemplate,
  type RequestTemplateRecord,
  type TemplatePriority,
} from '@flc/internal-requests';

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

  // Local mirror for optimistic drag-and-drop reorder; re-synced from server.
  const [orderedTemplates, setOrderedTemplates] = useState<RequestTemplateRecord[]>(templates);
  const [reordering, setReordering] = useState(false);
  useEffect(() => { setOrderedTemplates(templates); }, [templates]);

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

  const handleReorder = async (orderedIds: string[]) => {
    const byId = new Map(orderedTemplates.map((t) => [t.id, t]));
    const next = orderedIds.map((id) => byId.get(id)).filter((t): t is RequestTemplateRecord => Boolean(t));
    setOrderedTemplates(next);
    setReordering(true);
    const result = await reorderRequestTemplates(orderedIds, { actorId, companyId });
    if (result.error) toast.error('Unable to reorder templates', { description: result.error });
    await reload();
    setReordering(false);
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

  const editingTemplate = templates.find((t) => t.id === expandedTemplateId) ?? null;
  const editingDraft = editingTemplate ? templateDrafts[editingTemplate.id] : undefined;
  const editingDirty = editingTemplate ? hasTemplateChanges(editingTemplate, editingDraft) : false;
  const editingSubcategories = editingDraft
    ? activeSubcategoriesForKey(editingDraft.category_key)
    : [];

  return (
    <div className="space-y-4">
      <Sheet
        open={isAdding}
        onOpenChange={(open) => { setIsAdding(open); if (!open) resetCreateForm(); }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>New template</SheetTitle>
            <SheetDescription>Pre-fill a request so employees start from a ready draft.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
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

          <SheetFooter className="mt-4 gap-2">
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
          </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading templates...</span>
        </div>
      ) : error ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load templates"
          description={error}
          action={{ label: 'Retry', onClick: () => void reload() }}
        />
      ) : templates.length === 0 ? (
        <HrmsEmptyState
          icon={FileText}
          title="No templates yet"
          description="Add a template so requesters can start from a ready-made draft."
          action={{ label: 'Add template', onClick: () => setIsAdding(true) }}
        />
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

          <SortableList
            items={orderedTemplates}
            getId={(template) => template.id}
            onReorder={(ids) => void handleReorder(ids)}
            disabled={reordering}
            className="space-y-4"
          >
            {(template, { handle }) => {
              const isBusy = busyTemplateId === template.id;

              return (
                <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="pt-0.5">{handle}</div>
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
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedTemplateId(template.id)}
                        disabled={isBusy}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${template.name}`}
                        onClick={() => void handleDelete(template.id, template.name)}
                        disabled={isBusy}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }}
          </SortableList>
        </div>
      )}

      {/* Edit template drawer */}
      <Sheet
        open={!!editingTemplate}
        onOpenChange={(open) => { if (!open) setExpandedTemplateId(null); }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Edit template</SheetTitle>
            <SheetDescription>{editingTemplate?.name ?? ''}</SheetDescription>
          </SheetHeader>
          {editingTemplate && editingDraft && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`template-name-${editingTemplate.id}`}>Template name</Label>
                  <Input
                    id={`template-name-${editingTemplate.id}`}
                    value={editingDraft.name}
                    onChange={(event) => updateDraft(editingTemplate, { name: event.target.value })}
                    disabled={busyTemplateId === editingTemplate.id}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`template-desc-${editingTemplate.id}`}>Description</Label>
                  <Input
                    id={`template-desc-${editingTemplate.id}`}
                    value={editingDraft.description}
                    onChange={(event) => updateDraft(editingTemplate, { description: event.target.value })}
                    disabled={busyTemplateId === editingTemplate.id}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`template-cat-${editingTemplate.id}`}>Category</Label>
                  <Select
                    value={editingDraft.category_key}
                    onValueChange={(v) => updateDraft(editingTemplate, { category_key: v, subcategory_key: '' })}
                    disabled={busyTemplateId === editingTemplate.id || categories.length === 0}
                  >
                    <SelectTrigger id={`template-cat-${editingTemplate.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`template-subcat-${editingTemplate.id}`}>Subcategory</Label>
                  <Select
                    value={editingDraft.subcategory_key || NONE_SELECT_VALUE}
                    onValueChange={(value) => updateDraft(editingTemplate, { subcategory_key: optionalSelectValue(value) })}
                    disabled={busyTemplateId === editingTemplate.id || editingSubcategories.length === 0}
                  >
                    <SelectTrigger id={`template-subcat-${editingTemplate.id}`}>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
                      {editingSubcategories.map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`template-priority-${editingTemplate.id}`}>Priority</Label>
                  <Select
                    value={editingDraft.priority}
                    onValueChange={(v) => updateDraft(editingTemplate, { priority: v as TemplatePriority })}
                    disabled={busyTemplateId === editingTemplate.id}
                  >
                    <SelectTrigger id={`template-priority-${editingTemplate.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`template-subject-${editingTemplate.id}`}>Subject</Label>
                <Input
                  id={`template-subject-${editingTemplate.id}`}
                  value={editingDraft.subject}
                  onChange={(event) => updateDraft(editingTemplate, { subject: event.target.value })}
                  disabled={busyTemplateId === editingTemplate.id}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`template-body-${editingTemplate.id}`}>Body</Label>
                <Textarea
                  id={`template-body-${editingTemplate.id}`}
                  value={editingDraft.body}
                  onChange={(event) => updateDraft(editingTemplate, { body: event.target.value })}
                  rows={5}
                  disabled={busyTemplateId === editingTemplate.id}
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
                  checked={editingDraft.is_active}
                  onCheckedChange={(checked) => updateDraft(editingTemplate, { is_active: checked })}
                  disabled={busyTemplateId === editingTemplate.id}
                />
              </div>
            </div>
          )}
          <SheetFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setExpandedTemplateId(null)} disabled={!!busyTemplateId}>Cancel</Button>
            <Button
              type="button"
              onClick={() => { if (editingTemplate) void handleSave(editingTemplate); }}
              disabled={!editingTemplate || busyTemplateId === editingTemplate?.id || !editingDirty}
              className="gap-2"
            >
              {editingTemplate && busyTemplateId === editingTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
