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
import {
  createRequestCategory,
  moveRequestCategory,
  updateRequestCategory,
  type RequestCategoryRecord,
} from '@/services/requestCategoryService';

interface CategoryDraft {
  label: string;
  description: string;
  is_active: boolean;
}

function hasCategoryChanges(category: RequestCategoryRecord, draft: CategoryDraft | undefined) {
  if (!draft) return false;
  return draft.label !== category.label
    || draft.description !== category.description
    || draft.is_active !== category.is_active;
}

export default function RequestSetup() {
  const { user } = useAuth();
  const { categories, loading, error, reload } = useRequestCategories(user?.company_id, true);
  const [createLabel, setCreateLabel] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(categories.map((category) => [category.id, {
      label: category.label,
      description: category.description,
      is_active: category.is_active,
    }])));
  }, [categories]);

  const activeCategoryCount = useMemo(
    () => categories.filter((category) => category.is_active).length,
    [categories],
  );

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
          <CardTitle className="text-lg">Add Category</CardTitle>
          <CardDescription>
            Add a new request lane without leaving the module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading request setup...</span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Unable to load request categories</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" onClick={() => void reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No categories are configured yet. Add the first category above to enable request submission.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((category, index) => {
            const draft = drafts[category.id];
            const isSaving = busyCategoryId === category.id;
            const isDirty = hasCategoryChanges(category, draft);

            return (
              <Card key={category.id}>
                <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{category.label}</CardTitle>
                      <Badge variant={category.is_active ? 'secondary' : 'outline'}>
                        {category.is_active ? 'Active' : 'Archived'}
                      </Badge>
                    </div>
                    <CardDescription>
                      Key: {category.key}
                    </CardDescription>
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
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-[1.2fr,1.8fr]">
                    <div className="space-y-2">
                      <Label htmlFor={`category-label-${category.id}`}>Category name</Label>
                      <Input
                        id={`category-label-${category.id}`}
                        value={draft?.label ?? ''}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [category.id]: {
                            ...(current[category.id] ?? {
                              label: category.label,
                              description: category.description,
                              is_active: category.is_active,
                            }),
                            label: event.target.value,
                          },
                        }))}
                        disabled={isSaving}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`category-description-${category.id}`}>Description</Label>
                      <Textarea
                        id={`category-description-${category.id}`}
                        value={draft?.description ?? ''}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [category.id]: {
                            ...(current[category.id] ?? {
                              label: category.label,
                              description: category.description,
                              is_active: category.is_active,
                            }),
                            description: event.target.value,
                          },
                        }))}
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
                      onCheckedChange={(checked) => setDrafts((current) => ({
                        ...current,
                        [category.id]: {
                          ...(current[category.id] ?? {
                            label: category.label,
                            description: category.description,
                            is_active: category.is_active,
                          }),
                          is_active: checked,
                        },
                      }))}
                      disabled={isSaving}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}