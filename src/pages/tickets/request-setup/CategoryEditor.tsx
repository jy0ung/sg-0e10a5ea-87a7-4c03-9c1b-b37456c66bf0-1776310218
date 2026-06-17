import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  AlertCircle,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { SortableList } from '@/components/ui/SortableList';
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
import {
  createRequestCategory,
  deleteRequestCategory,
  reorderRequestCategories,
  updateRequestCategory,
  type RequestCategoryRecord,
} from '@/services/requestCategoryService';
import {
  createRequestSubcategory,
  deleteRequestSubcategory,
  reorderRequestSubcategories,
  updateRequestSubcategory,
  type RequestSubcategoryRecord,
} from '@/services/requestSubcategoryService';
import { listApprovalFlows } from '@/services/approvalFlowService';

import {
  CONFLICT_RELOAD_MESSAGE,
  hasCategoryChanges,
  hasSubcategoryChanges,
  isConflict,
  parseSlaHours,
  type CategoryDraft,
  type CreateSubcategoryDraft,
  type SubcategoryDraft,
} from './shared';

interface Props {
  companyId: string;
  actorId: string;
  onActiveCountChange?: (count: number) => void;
}

/**
 * Categories tab content — by far the largest editor. Owns the categories
 * list, the create dialog, the edit dialog (which nests subcategory CRUD),
 * the delete confirmation, and the per-category approval-flow pin selector.
 * Subcategories are managed inline inside the edit dialog rather than as a
 * separate tab.
 */
export function CategoryEditor({ companyId, actorId, onActiveCountChange }: Props) {
  const { categories, loading, error, reload } = useRequestCategories(companyId, true);
  const {
    subcategories,
    loading: subcategoriesLoading,
    error: subcategoriesError,
    reload: reloadSubcategories,
  } = useRequestSubcategories(companyId, { includeInactive: true });

  const { data: approvalFlows = [] } = useQuery({
    queryKey: ['approval-flows', companyId],
    queryFn: () => listApprovalFlows(companyId).then((r) => r.data),
    enabled: !!companyId,
    staleTime: STALE.reference,
  });
  const internalRequestFlows = useMemo(
    () => approvalFlows.filter((f) => f.entityType === 'internal_request' && f.isActive),
    [approvalFlows],
  );

  const [isAdding, setIsAdding] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});

  const [creatingSubcategoryKey, setCreatingSubcategoryKey] = useState<string | null>(null);
  const [busySubcategoryId, setBusySubcategoryId] = useState<string | null>(null);
  const [deletingSubcategory, setDeletingSubcategory] = useState<RequestSubcategoryRecord | null>(null);
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, SubcategoryDraft>>({});
  const [createSubcategoryDrafts, setCreateSubcategoryDrafts] = useState<Record<string, CreateSubcategoryDraft>>({});

  // Local mirrors so drag-and-drop can reorder optimistically; re-synced from
  // the hooks' server state on every load/reload.
  const [orderedCategories, setOrderedCategories] = useState<RequestCategoryRecord[]>(categories);
  const [orderedSubcategories, setOrderedSubcategories] = useState<RequestSubcategoryRecord[]>(subcategories);
  const [reordering, setReordering] = useState(false);
  useEffect(() => { setOrderedCategories(categories); }, [categories]);
  useEffect(() => { setOrderedSubcategories(subcategories); }, [subcategories]);

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map((category) => [category.id, {
      label: category.label,
      description: category.description,
      response_sla_hours: category.response_sla_hours,
      resolution_sla_hours: category.resolution_sla_hours,
      is_active: category.is_active,
      approval_flow_id: category.approval_flow_id,
    }])));
  }, [categories]);

  useEffect(() => {
    setSubcategoryDrafts(Object.fromEntries(subcategories.map((sub) => [sub.id, {
      label: sub.label,
      description: sub.description,
      is_active: sub.is_active,
      approval_flow_id: sub.approval_flow_id,
    }])));
  }, [subcategories]);

  const activeCategoryCount = useMemo(
    () => categories.filter((category) => category.is_active).length,
    [categories],
  );
  useEffect(() => {
    onActiveCountChange?.(activeCategoryCount);
  }, [activeCategoryCount, onActiveCountChange]);

  const subcategoriesByCategory = useMemo(
    () => subcategories.reduce<Record<string, RequestSubcategoryRecord[]>>((grouped, sub) => {
      grouped[sub.category_key] ??= [];
      grouped[sub.category_key].push(sub);
      return grouped;
    }, {}),
    [subcategories],
  );

  const editCategory = useMemo(
    () => categories.find((c) => c.id === editCategoryId) ?? null,
    [categories, editCategoryId],
  );
  const editCatSubcategories = editCategory
    ? orderedSubcategories.filter((sub) => sub.category_key === editCategory.key)
    : [];
  const editCreateSubDraft = editCategory
    ? (createSubcategoryDrafts[editCategory.key] ?? { label: '', description: '' })
    : { label: '', description: '' };
  const editIsCreatingSub = editCategory ? creatingSubcategoryKey === editCategory.key : false;

  const setupLoading = loading || subcategoriesLoading;
  const setupError = error ?? subcategoriesError;

  const handleRetry = async () => {
    await Promise.all([reload(), reloadSubcategories()]);
  };

  const updateCategoryDraft = (category: RequestCategoryRecord, patch: Partial<CategoryDraft>) => {
    setDrafts((current) => ({
      ...current,
      [category.id]: {
        ...(current[category.id] ?? {
          label: category.label,
          description: category.description,
          response_sla_hours: category.response_sla_hours,
          resolution_sla_hours: category.resolution_sla_hours,
          is_active: category.is_active,
          approval_flow_id: category.approval_flow_id,
        }),
        ...patch,
      },
    }));
  };

  const updateSubcategoryDraft = (sub: RequestSubcategoryRecord, patch: Partial<SubcategoryDraft>) => {
    setSubcategoryDrafts((current) => ({
      ...current,
      [sub.id]: {
        ...(current[sub.id] ?? {
          label: sub.label,
          description: sub.description,
          is_active: sub.is_active,
          approval_flow_id: sub.approval_flow_id,
        }),
        ...patch,
      },
    }));
  };

  const updateCreateSubcategoryDraft = (categoryKey: string, patch: Partial<CreateSubcategoryDraft>) => {
    setCreateSubcategoryDrafts((current) => ({
      ...current,
      [categoryKey]: {
        ...(current[categoryKey] ?? { label: '', description: '' }),
        ...patch,
      },
    }));
  };

  const handleCreate = async () => {
    setCreating(true);
    const result = await createRequestCategory(
      { label: createLabel, description: createDescription },
      { actorId, companyId },
    );
    if (result.error) {
      toast.error('Unable to create category', { description: result.error });
    } else {
      toast.success('Category created', {
        description: 'The new request category is now available in the module.',
      });
      setCreateLabel('');
      setCreateDescription('');
      setIsAdding(false);
      await reload();
    }
    setCreating(false);
  };

  const handleSave = async (category: RequestCategoryRecord) => {
    const draft = drafts[category.id];
    if (!draft || !hasCategoryChanges(category, draft)) return;

    if (!draft.is_active && category.is_active && activeCategoryCount === 1) {
      toast.error('At least one active category is required', {
        description: 'Keep one category active so requesters can continue submitting requests.',
      });
      return;
    }

    setBusyCategoryId(category.id);
    const result = await updateRequestCategory(
      category.id,
      {
        label: draft.label,
        description: draft.description,
        response_sla_hours: draft.response_sla_hours,
        resolution_sla_hours: draft.resolution_sla_hours,
        is_active: draft.is_active,
        approval_flow_id: draft.approval_flow_id,
        expectedUpdatedAt: category.updated_at,
      },
      { actorId, companyId },
    );
    if (isConflict(result)) {
      toast.error('Category changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reload();
    } else if (result.error) {
      toast.error('Unable to save category', { description: result.error });
    } else {
      toast.success('Category updated', {
        description: 'The Internal Requests module now uses the new category settings.',
      });
      setEditCategoryId(null);
      await reload();
    }
    setBusyCategoryId(null);
  };

  const handleReorderCategories = async (orderedIds: string[]) => {
    const byId = new Map(orderedCategories.map((category) => [category.id, category]));
    const next = orderedIds.map((id) => byId.get(id)).filter((c): c is RequestCategoryRecord => Boolean(c));
    setOrderedCategories(next);
    setReordering(true);
    const result = await reorderRequestCategories(orderedIds, { actorId, companyId });
    if (result.error) toast.error('Unable to reorder categories', { description: result.error });
    await reload();
    setReordering(false);
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryId) return;
    const target = categories.find((category) => category.id === deleteCategoryId);
    setBusyCategoryId(deleteCategoryId);
    const result = await deleteRequestCategory(deleteCategoryId, { actorId, companyId }, target?.updated_at);
    setBusyCategoryId(null);
    setDeleteCategoryId(null);
    if (isConflict(result)) {
      toast.error('Category changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reload();
    } else if (result.error) {
      if (result.inUse) {
        toast.warning('Cannot delete — category is in use', {
          description: result.error + ' Open the Edit dialog to deactivate it instead.',
        });
      } else {
        toast.error('Failed to delete category', { description: result.error });
      }
    } else {
      toast.success('Category deleted');
      await reload();
    }
  };

  const handleCreateSubcategory = async (categoryKey: string) => {
    const draft = createSubcategoryDrafts[categoryKey] ?? { label: '', description: '' };
    if (!draft.label.trim()) return;

    setCreatingSubcategoryKey(categoryKey);
    const result = await createRequestSubcategory(
      { categoryKey, label: draft.label, description: draft.description },
      { actorId, companyId },
    );
    if (result.error) {
      toast.error('Unable to create subcategory', { description: result.error });
    } else {
      toast.success('Subcategory created', {
        description: 'The new request subcategory is now available for this category.',
      });
      setCreateSubcategoryDrafts((current) => ({
        ...current,
        [categoryKey]: { label: '', description: '' },
      }));
      await reloadSubcategories();
    }
    setCreatingSubcategoryKey(null);
  };

  const handleSaveSubcategory = async (sub: RequestSubcategoryRecord) => {
    const draft = subcategoryDrafts[sub.id];
    if (!draft || !hasSubcategoryChanges(sub, draft)) return;

    setBusySubcategoryId(sub.id);
    const result = await updateRequestSubcategory(
      sub.id,
      {
        label: draft.label,
        description: draft.description,
        is_active: draft.is_active,
        approval_flow_id: draft.approval_flow_id,
        expectedUpdatedAt: sub.updated_at,
      },
      { actorId, companyId },
    );
    if (isConflict(result)) {
      toast.error('Subcategory changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reloadSubcategories();
    } else if (result.error) {
      toast.error('Unable to save subcategory', { description: result.error });
    } else {
      toast.success('Subcategory updated', {
        description: 'The new request flow now uses the updated subcategory settings.',
      });
      await reloadSubcategories();
    }
    setBusySubcategoryId(null);
  };

  const handleReorderSubcategories = async (categoryKey: string, orderedIds: string[]) => {
    // Optimistically reorder just this category's slice within the flat mirror.
    setOrderedSubcategories((prev) => {
      const byId = new Map(prev.filter((s) => s.category_key === categoryKey).map((s) => [s.id, s]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter((s): s is RequestSubcategoryRecord => Boolean(s));
      let cursor = 0;
      return prev.map((sub) => (sub.category_key === categoryKey ? reordered[cursor++] ?? sub : sub));
    });
    setReordering(true);
    const result = await reorderRequestSubcategories(categoryKey, orderedIds, { actorId, companyId });
    if (result.error) toast.error('Unable to reorder subcategories', { description: result.error });
    await reloadSubcategories();
    setReordering(false);
  };

  const handleDeleteSubcategory = async (sub: RequestSubcategoryRecord) => {
    setBusySubcategoryId(sub.id);
    const result = await deleteRequestSubcategory(sub.id, { actorId, companyId }, sub.updated_at);
    setBusySubcategoryId(null);
    setDeletingSubcategory(null);
    if (isConflict(result)) {
      toast.error('Subcategory changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reloadSubcategories();
    } else if (result.error) {
      if (result.inUse) {
        toast.warning('Cannot delete — subcategory is in use', { description: result.error });
      } else {
        toast.error('Failed to delete subcategory', { description: result.error });
      }
    } else {
      toast.success('Subcategory deleted');
      await reloadSubcategories();
    }
  };

  return (
    <div className="space-y-4">
      {/* Create category drawer */}
      <Sheet open={isAdding} onOpenChange={(open) => {
        if (!open && !creating) { setIsAdding(false); setCreateLabel(''); setCreateDescription(''); }
      }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New category</SheetTitle>
            <SheetDescription>Add a new request category for your team.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="request-category-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="request-category-name"
                placeholder="e.g. Procurement Support"
                value={createLabel}
                onChange={(event) => setCreateLabel(event.target.value)}
                disabled={creating}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-category-description">Description</Label>
              <Textarea
                id="request-category-description"
                placeholder="Explain when requesters should use this category."
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                rows={3}
                disabled={creating}
              />
            </div>
          </div>
          <SheetFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => { setIsAdding(false); setCreateLabel(''); setCreateDescription(''); }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={creating || createLabel.trim().length === 0}
              className="gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add category
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit category drawer */}
      <Sheet open={editCategoryId !== null} onOpenChange={(open) => {
        if (!open && !busyCategoryId) setEditCategoryId(null);
      }}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Edit category</SheetTitle>
            <SheetDescription>Update this category's details, SLA targets, and subcategories.</SheetDescription>
          </SheetHeader>
          {editCategory && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={drafts[editCategory.id]?.label ?? ''}
                    onChange={(event) => updateCategoryDraft(editCategory, { label: event.target.value })}
                    disabled={busyCategoryId === editCategory.id}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={drafts[editCategory.id]?.description ?? ''}
                    onChange={(event) => updateCategoryDraft(editCategory, { description: event.target.value })}
                    rows={2}
                    disabled={busyCategoryId === editCategory.id}
                  />
                </div>
              </div>
              <div className="grid gap-4 rounded-lg border border-border px-4 py-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`edit-cat-response-sla-${editCategory.id}`}>First response SLA (hours)</Label>
                  <Input
                    id={`edit-cat-response-sla-${editCategory.id}`}
                    type="number"
                    min={1}
                    max={720}
                    value={drafts[editCategory.id]?.response_sla_hours ?? ''}
                    onChange={(event) => updateCategoryDraft(editCategory, { response_sla_hours: parseSlaHours(event.target.value) })}
                    disabled={busyCategoryId === editCategory.id}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hours from submission until an assignee must respond. Allowed range 1–720 (up to 30 days). Leave blank when this category has no response target.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`edit-cat-resolution-sla-${editCategory.id}`}>Resolution SLA (hours)</Label>
                  <Input
                    id={`edit-cat-resolution-sla-${editCategory.id}`}
                    type="number"
                    min={1}
                    max={2160}
                    value={drafts[editCategory.id]?.resolution_sla_hours ?? ''}
                    onChange={(event) => updateCategoryDraft(editCategory, { resolution_sla_hours: parseSlaHours(event.target.value) })}
                    disabled={busyCategoryId === editCategory.id}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hours from submission until the request must be resolved. Allowed range 1–2160 (up to 90 days). New requests copy this target when they are submitted.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Visible in new requests</p>
                  <p className="text-xs text-muted-foreground">
                    Turn off to archive without removing from historical tickets.
                  </p>
                </div>
                <Switch
                  checked={drafts[editCategory.id]?.is_active ?? editCategory.is_active}
                  onCheckedChange={(checked) => updateCategoryDraft(editCategory, { is_active: checked })}
                  disabled={busyCategoryId === editCategory.id}
                />
              </div>
              <div className="space-y-2 rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Approval flow</p>
                  <p className="text-xs text-muted-foreground">
                    Pin a specific flow for this category. Overrides the condition-based scorer.
                    Leave blank to use the default flow matching rules.
                  </p>
                </div>
                <Select
                  value={drafts[editCategory.id]?.approval_flow_id ?? '__none__'}
                  onValueChange={(value) =>
                    updateCategoryDraft(editCategory, { approval_flow_id: value === '__none__' ? null : value })
                  }
                  disabled={busyCategoryId === editCategory.id}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Use default matching rules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Use default matching rules</SelectItem>
                    {internalRequestFlows.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                    {internalRequestFlows.length === 0 && (
                      <SelectItem value="__no_flows__" disabled>
                        No active internal-request flows configured
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                <p className="text-sm font-semibold text-foreground">Subcategories</p>
                <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input
                      placeholder="e.g. Stock Transfer"
                      value={editCreateSubDraft.label}
                      onChange={(event) => updateCreateSubcategoryDraft(editCategory.key, { label: event.target.value })}
                      disabled={editIsCreatingSub}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      placeholder="Optional"
                      value={editCreateSubDraft.description}
                      onChange={(event) => updateCreateSubcategoryDraft(editCategory.key, { description: event.target.value })}
                      rows={2}
                      className="min-h-[40px] resize-y"
                      disabled={editIsCreatingSub}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleCreateSubcategory(editCategory.key)}
                    disabled={editIsCreatingSub || editCreateSubDraft.label.trim().length === 0}
                    className="gap-1.5"
                  >
                    {editIsCreatingSub ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </Button>
                </div>
                {editCatSubcategories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No subcategories yet.</p>
                ) : (
                  <SortableList
                    items={editCatSubcategories}
                    getId={(sub) => sub.id}
                    onReorder={(ids) => void handleReorderSubcategories(editCategory.key, ids)}
                    disabled={reordering}
                    className="space-y-1.5"
                  >
                    {(sub, { handle }) => {
                      const subDraft = subcategoryDrafts[sub.id];
                      const isSubBusy = busySubcategoryId === sub.id;
                      const isSubDirty = hasSubcategoryChanges(sub, subDraft);
                      const subFlowValue = subDraft?.approval_flow_id ?? sub.approval_flow_id ?? '__none__';
                      return (
                        <div className="space-y-2 rounded-lg border bg-background px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {handle}
                              <Input
                                className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                value={subDraft?.label ?? sub.label}
                                onChange={(event) => updateSubcategoryDraft(sub, { label: event.target.value })}
                                disabled={isSubBusy}
                              />
                              {!sub.is_active && (
                                <Badge variant="outline" className="shrink-0 text-xs">Archived</Badge>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {isSubDirty && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => void handleSaveSubcategory(sub)}
                                  disabled={isSubBusy}
                                  aria-label="Save subcategory"
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                              )}
                              <Switch
                                className="scale-75 origin-right"
                                checked={subDraft?.is_active ?? sub.is_active}
                                onCheckedChange={(checked) => updateSubcategoryDraft(sub, { is_active: checked })}
                                disabled={isSubBusy}
                              />
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setDeletingSubcategory(sub)}
                                disabled={isSubBusy}
                                aria-label={`Delete ${sub.label}`}
                              >
                                {isSubBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                          <div className="pl-8">
                            <Textarea
                              placeholder="Description shown to requesters (optional)"
                              value={subDraft?.description ?? sub.description}
                              onChange={(event) => updateSubcategoryDraft(sub, { description: event.target.value })}
                              rows={2}
                              className="min-h-[40px] resize-y text-sm"
                              disabled={isSubBusy}
                            />
                          </div>
                          <div className="flex items-center gap-2 pl-8">
                            <span className="shrink-0 text-xs text-muted-foreground">Approval flow</span>
                            <Select
                              value={subFlowValue}
                              onValueChange={(value) =>
                                updateSubcategoryDraft(sub, { approval_flow_id: value === '__none__' ? null : value })
                              }
                              disabled={isSubBusy}
                            >
                              <SelectTrigger className="h-7 flex-1 text-xs">
                                <SelectValue placeholder="Inherit from category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Inherit from category</SelectItem>
                                {internalRequestFlows.map((flow) => (
                                  <SelectItem key={flow.id} value={flow.id}>
                                    {flow.name}
                                  </SelectItem>
                                ))}
                                {internalRequestFlows.length === 0 && (
                                  <SelectItem value="__no_flows__" disabled>
                                    No active internal-request flows configured
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    }}
                  </SortableList>
                )}
              </div>
            </div>
          )}
          <SheetFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => setEditCategoryId(null)}
              disabled={!!busyCategoryId}
            >
              Cancel
            </Button>
            <Button
              onClick={() => editCategory && void handleSave(editCategory)}
              disabled={!!busyCategoryId || !editCategory || !hasCategoryChanges(editCategory, drafts[editCategory.id])}
              className="gap-2"
            >
              {busyCategoryId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {setupLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading request setup...</span>
        </div>
      ) : setupError ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load request setup"
          description={setupError}
          action={{ label: 'Retry', onClick: () => void handleRetry() }}
        />
      ) : categories.length === 0 ? (
        <HrmsEmptyState
          icon={Plus}
          title="No categories yet"
          description="Add a request category to get started."
          action={{ label: 'Add category', onClick: () => setIsAdding(true) }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {categories.length} {categories.length === 1 ? 'category' : 'categories'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Category
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <SortableList
              items={orderedCategories}
              getId={(category) => category.id}
              onReorder={(ids) => void handleReorderCategories(ids)}
              disabled={reordering}
              className="divide-y divide-border"
            >
              {(category, { handle }) => {
                const catSubcategories = subcategoriesByCategory[category.key] ?? [];
                const isBusy = busyCategoryId === category.id;
                return (
                  <div className="flex items-center gap-2 px-3 py-3">
                    {handle}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{category.label}</span>
                        {!category.is_active && (
                          <Badge variant="outline" className="px-1.5 py-0 text-xs">Archived</Badge>
                        )}
                        {catSubcategories.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {catSubcategories.length} {catSubcategories.length === 1 ? 'subcategory' : 'subcategories'}
                          </span>
                        )}
                      </div>
                      {category.description && (
                        <p className="truncate text-xs text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {isBusy ? (
                        <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditCategoryId(category.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteCategoryId(category.id)}
                            aria-label={`Delete ${category.label}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }}
            </SortableList>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {(() => {
        const catToDelete = categories.find((c) => c.id === deleteCategoryId);
        return (
          <AlertDialog open={deleteCategoryId !== null} onOpenChange={(open) => { if (!open) setDeleteCategoryId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete category</AlertDialogTitle>
                <AlertDialogDescription>
                  {catToDelete
                    ? <>Permanently delete <strong>{catToDelete.label}</strong>? This cannot be undone. If this category is already referenced by requests or templates, you will be asked to deactivate it instead.</>
                    : 'Permanently delete this category? This cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busyCategoryId !== null}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleDeleteCategory()}
                  disabled={busyCategoryId !== null}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {busyCategoryId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      {/* Subcategory delete confirmation */}
      <AlertDialog
        open={deletingSubcategory !== null}
        onOpenChange={(open) => { if (!open) setDeletingSubcategory(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subcategory</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingSubcategory
                ? <>Permanently delete <strong>{deletingSubcategory.label}</strong>? This cannot be undone. If it is already used by requests or templates, you will be asked to deactivate it instead.</>
                : 'Permanently delete this subcategory? This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busySubcategoryId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingSubcategory) void handleDeleteSubcategory(deletingSubcategory); }}
              disabled={busySubcategoryId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busySubcategoryId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
