import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import {
  createRequestCategory,
  moveRequestCategory,
  updateRequestCategory,
  type RequestCategoryRecord,
} from '@/services/requestCategoryService';
import {
  createRequestSubcategory,
  moveRequestSubcategory,
  updateRequestSubcategory,
  type RequestSubcategoryRecord,
} from '@/services/requestSubcategoryService';

interface CategoryDraft {
  label: string;
  description: string;
  is_active: boolean;
}

interface SubcategoryDraft {
  label: string;
  description: string;
  is_active: boolean;
}

interface CreateSubcategoryDraft {
  label: string;
  description: string;
}

function hasCategoryChanges(category: RequestCategoryRecord, draft: CategoryDraft | undefined) {
  if (!draft) return false;
  return draft.label !== category.label
    || draft.description !== category.description
    || draft.is_active !== category.is_active;
}

function hasSubcategoryChanges(subcategory: RequestSubcategoryRecord, draft: SubcategoryDraft | undefined) {
  if (!draft) return false;
  return draft.label !== subcategory.label
    || draft.description !== subcategory.description
    || draft.is_active !== subcategory.is_active;
}

export default function RequestSetup() {
  const { user } = useAuth();
  const { categories, loading, error, reload } = useRequestCategories(user?.company_id, true);
  const {
    subcategories,
    loading: subcategoriesLoading,
    error: subcategoriesError,
    reload: reloadSubcategories,
  } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const [createLabel, setCreateLabel] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  const [creatingSubcategoryKey, setCreatingSubcategoryKey] = useState<string | null>(null);
  const [busySubcategoryId, setBusySubcategoryId] = useState<string | null>(null);
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, SubcategoryDraft>>({});
  const [createSubcategoryDrafts, setCreateSubcategoryDrafts] = useState<Record<string, CreateSubcategoryDraft>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map((category) => [category.id, {
      label: category.label,
      description: category.description,
      is_active: category.is_active,
    }])));
  }, [categories]);

  useEffect(() => {
    setSubcategoryDrafts(Object.fromEntries(subcategories.map((subcategory) => [subcategory.id, {
      label: subcategory.label,
      description: subcategory.description,
      is_active: subcategory.is_active,
    }])));
  }, [subcategories]);

  const activeCategoryCount = useMemo(
    () => categories.filter((category) => category.is_active).length,
    [categories],
  );

  const subcategoriesByCategory = useMemo(
    () => subcategories.reduce<Record<string, RequestSubcategoryRecord[]>>((grouped, subcategory) => {
      grouped[subcategory.category_key] ??= [];
      grouped[subcategory.category_key].push(subcategory);
      return grouped;
    }, {}),
    [subcategories],
  );

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
          is_active: category.is_active,
        }),
        ...patch,
      },
    }));
  };

  const updateSubcategoryDraft = (subcategory: RequestSubcategoryRecord, patch: Partial<SubcategoryDraft>) => {
    setSubcategoryDrafts((current) => ({
      ...current,
      [subcategory.id]: {
        ...(current[subcategory.id] ?? {
          label: subcategory.label,
          description: subcategory.description,
          is_active: subcategory.is_active,
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
    if (!user) return;

    setCreating(true);
    const result = await createRequestCategory(
      {
        label: createLabel,
        description: createDescription,
      },
      { actorId: user.id, companyId: user.company_id },
    );

    if (result.error) {
      toast.error('Unable to create category', {
        description: result.error,
      });
    } else {
      toast.success('Category created', {
        description: 'The new request category is now available in the module.',
      });
      setCreateLabel('');
      setCreateDescription('');
      await reload();
    }

    setCreating(false);
  };

  const handleSave = async (category: RequestCategoryRecord) => {
    if (!user) return;
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
        is_active: draft.is_active,
      },
      { actorId: user.id, companyId: user.company_id },
    );

    if (result.error) {
      toast.error('Unable to save category', {
        description: result.error,
      });
    } else {
      toast.success('Category updated', {
        description: 'The Internal Requests module now uses the new category settings.',
      });
      await reload();
    }
    setBusyCategoryId(null);
  };

  const handleMove = async (categoryId: string, direction: 'up' | 'down') => {
    if (!user) return;

    setBusyCategoryId(categoryId);
    const result = await moveRequestCategory(categoryId, direction, {
      actorId: user.id,
      companyId: user.company_id,
    });

    if (result.error) {
      toast.error('Unable to reorder categories', {
        description: result.error,
      });
    } else {
      await reload();
    }

    setBusyCategoryId(null);
  };

  const handleCreateSubcategory = async (categoryKey: string) => {
    if (!user) return;

    const draft = createSubcategoryDrafts[categoryKey] ?? { label: '', description: '' };
    if (!draft.label.trim()) return;

    setCreatingSubcategoryKey(categoryKey);
    const result = await createRequestSubcategory(
      {
        categoryKey,
        label: draft.label,
        description: draft.description,
      },
      { actorId: user.id, companyId: user.company_id },
    );

    if (result.error) {
      toast.error('Unable to create subcategory', {
        description: result.error,
      });
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

  const handleSaveSubcategory = async (subcategory: RequestSubcategoryRecord) => {
    if (!user) return;
    const draft = subcategoryDrafts[subcategory.id];
    if (!draft || !hasSubcategoryChanges(subcategory, draft)) return;

    setBusySubcategoryId(subcategory.id);
    const result = await updateRequestSubcategory(
      subcategory.id,
      {
        label: draft.label,
        description: draft.description,
        is_active: draft.is_active,
      },
      { actorId: user.id, companyId: user.company_id },
    );

    if (result.error) {
      toast.error('Unable to save subcategory', {
        description: result.error,
      });
    } else {
      toast.success('Subcategory updated', {
        description: 'The new request flow now uses the updated subcategory settings.',
      });
      await reloadSubcategories();
    }

    setBusySubcategoryId(null);
  };

  const handleMoveSubcategory = async (subcategoryId: string, direction: 'up' | 'down') => {
    if (!user) return;

    setBusySubcategoryId(subcategoryId);
    const result = await moveRequestSubcategory(subcategoryId, direction, {
      actorId: user.id,
      companyId: user.company_id,
    });

    if (result.error) {
      toast.error('Unable to reorder subcategories', {
        description: result.error,
      });
    } else {
      await reloadSubcategories();
    }

    setBusySubcategoryId(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Request Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the categories requesters can choose inside Internal Requests. Archived categories stay visible on historical tickets but disappear from new submissions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Customization</CardTitle>
          <CardDescription>
            Use one canvas to add, edit, sort, and archive request categories. Subcategory support can sit in this same setup flow next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Add category</p>
              <p className="text-sm text-muted-foreground">
                Start from one blank canvas, add a category here, and keep the rest of the request setup inside this same card.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr,1.8fr]">
              <div className="space-y-2">
                <Label htmlFor="request-category-name">Category name</Label>
                <Input
                  id="request-category-name"
                  placeholder="Example: Procurement Support"
                  value={createLabel}
                  onChange={(event) => setCreateLabel(event.target.value)}
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
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || createLabel.trim().length === 0}
              className="gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add category
            </Button>
          </div>

          {setupLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading request setup...</span>
            </div>
          ) : setupError ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Unable to load request setup</p>
                <p className="text-sm text-muted-foreground">{setupError}</p>
              </div>
              <Button variant="outline" onClick={() => void handleRetry()}>
                Retry
              </Button>
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded-xl border border-border py-12 text-center text-sm text-muted-foreground">
              No categories are configured yet. Add the first category above to enable request submission.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Current categories</p>
                  <p className="text-sm text-muted-foreground">
                    Edit and reorder every request category from this same canvas.
                  </p>
                </div>
                <Badge variant="outline">{categories.length} categories</Badge>
              </div>

              {categories.map((category, index) => {
                const draft = drafts[category.id];
                const isSaving = busyCategoryId === category.id;
                const isDirty = hasCategoryChanges(category, draft);
                const categorySubcategories = subcategoriesByCategory[category.key] ?? [];
                const createSubcategoryDraft = createSubcategoryDrafts[category.key] ?? { label: '', description: '' };
                const isCreatingSubcategory = creatingSubcategoryKey === category.key;

                return (
                  <div key={category.id} className="rounded-xl border border-border bg-background p-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-foreground">{category.label}</p>
                          <Badge variant={category.is_active ? 'secondary' : 'outline'}>
                            {category.is_active ? 'Active' : 'Archived'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Key: {category.key}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Move ${category.label} up`}
                          onClick={() => void handleMove(category.id, 'up')}
                          disabled={isSaving || index === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Move ${category.label} down`}
                          onClick={() => void handleMove(category.id, 'down')}
                          disabled={isSaving || index === categories.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleSave(category)}
                          disabled={isSaving || !isDirty}
                          className="gap-2"
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1.2fr,1.8fr]">
                      <div className="space-y-2">
                        <Label htmlFor={`category-label-${category.id}`}>Category name</Label>
                        <Input
                          id={`category-label-${category.id}`}
                          value={draft?.label ?? ''}
                          onChange={(event) => updateCategoryDraft(category, { label: event.target.value })}
                          disabled={isSaving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`category-description-${category.id}`}>Description</Label>
                        <Textarea
                          id={`category-description-${category.id}`}
                          value={draft?.description ?? ''}
                          onChange={(event) => updateCategoryDraft(category, { description: event.target.value })}
                          rows={3}
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Visible in new requests</p>
                        <p className="text-xs text-muted-foreground">
                          Turn this off to archive the category without removing it from historical tickets.
                        </p>
                      </div>
                      <Switch
                        checked={draft?.is_active ?? false}
                        onCheckedChange={(checked) => updateCategoryDraft(category, { is_active: checked })}
                        disabled={isSaving}
                      />
                    </div>

                    <div className="space-y-4 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">Subcategories</p>
                          <p className="text-sm text-muted-foreground">
                            Add more specific request types under {category.label} without leaving this setup canvas.
                          </p>
                        </div>
                        <Badge variant="outline">{categorySubcategories.length} subcategories</Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1.1fr,1.7fr,auto] md:items-end">
                        <div className="space-y-2">
                          <Label htmlFor={`create-subcategory-label-${category.id}`}>Subcategory name</Label>
                          <Input
                            id={`create-subcategory-label-${category.id}`}
                            placeholder="Example: Stock Transfer"
                            value={createSubcategoryDraft.label}
                            onChange={(event) => updateCreateSubcategoryDraft(category.key, { label: event.target.value })}
                            disabled={isCreatingSubcategory}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`create-subcategory-description-${category.id}`}>Description</Label>
                          <Textarea
                            id={`create-subcategory-description-${category.id}`}
                            placeholder="Explain when requesters should choose this subcategory."
                            value={createSubcategoryDraft.description}
                            onChange={(event) => updateCreateSubcategoryDraft(category.key, { description: event.target.value })}
                            rows={2}
                            disabled={isCreatingSubcategory}
                          />
                        </div>

                        <Button
                          type="button"
                          onClick={() => void handleCreateSubcategory(category.key)}
                          disabled={isCreatingSubcategory || createSubcategoryDraft.label.trim().length === 0}
                          className="gap-2"
                        >
                          {isCreatingSubcategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add subcategory
                        </Button>
                      </div>

                      {categorySubcategories.length === 0 ? (
                        <div className="rounded-lg border border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                          No subcategories yet. Add one above if this category needs a more specific request path.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {categorySubcategories.map((subcategory, subcategoryIndex) => {
                            const subcategoryDraft = subcategoryDrafts[subcategory.id];
                            const isSubcategorySaving = busySubcategoryId === subcategory.id;
                            const isSubcategoryDirty = hasSubcategoryChanges(subcategory, subcategoryDraft);

                            return (
                              <div key={subcategory.id} className="rounded-lg border border-border bg-background p-4 space-y-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-foreground">{subcategory.label}</p>
                                      <Badge variant={subcategory.is_active ? 'secondary' : 'outline'}>
                                        {subcategory.is_active ? 'Active' : 'Archived'}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Key: {subcategory.key}</p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      aria-label={`Move ${subcategory.label} up`}
                                      onClick={() => void handleMoveSubcategory(subcategory.id, 'up')}
                                      disabled={isSubcategorySaving || subcategoryIndex === 0}
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      aria-label={`Move ${subcategory.label} down`}
                                      onClick={() => void handleMoveSubcategory(subcategory.id, 'down')}
                                      disabled={isSubcategorySaving || subcategoryIndex === categorySubcategories.length - 1}
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={() => void handleSaveSubcategory(subcategory)}
                                      disabled={isSubcategorySaving || !isSubcategoryDirty}
                                      className="gap-2"
                                    >
                                      {isSubcategorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                      Save
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-[1.1fr,1.7fr]">
                                  <div className="space-y-2">
                                    <Label htmlFor={`subcategory-label-${subcategory.id}`}>Subcategory name</Label>
                                    <Input
                                      id={`subcategory-label-${subcategory.id}`}
                                      value={subcategoryDraft?.label ?? ''}
                                      onChange={(event) => updateSubcategoryDraft(subcategory, { label: event.target.value })}
                                      disabled={isSubcategorySaving}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor={`subcategory-description-${subcategory.id}`}>Description</Label>
                                    <Textarea
                                      id={`subcategory-description-${subcategory.id}`}
                                      value={subcategoryDraft?.description ?? ''}
                                      onChange={(event) => updateSubcategoryDraft(subcategory, { description: event.target.value })}
                                      rows={2}
                                      disabled={isSubcategorySaving}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">Visible in new requests</p>
                                    <p className="text-xs text-muted-foreground">
                                      Turn this off to archive the subcategory while keeping it visible on historical tickets.
                                    </p>
                                  </div>
                                  <Switch
                                    checked={subcategoryDraft?.is_active ?? false}
                                    onCheckedChange={(checked) => updateSubcategoryDraft(subcategory, { is_active: checked })}
                                    disabled={isSubcategorySaving}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}