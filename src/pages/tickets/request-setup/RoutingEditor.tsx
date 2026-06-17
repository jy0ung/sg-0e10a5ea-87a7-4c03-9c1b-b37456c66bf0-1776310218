import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  AlertCircle,
  Loader2,
  Plus,
  Route,
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
import { ROLE_LABELS } from '@/config/rolePermissions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { SortableList } from '@/components/ui/SortableList';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useRoutingRules } from '@/hooks/useRoutingRules';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { listProfiles } from '@flc/auth';
import {
  createRoutingRule,
  deleteRoutingRule,
  reorderRoutingRules,
  updateRoutingRule,
  type RequestRoutingRule,
} from '@flc/internal-requests';

import {
  ANY_SELECT_VALUE,
  CONFLICT_RELOAD_MESSAGE,
  PRIORITY_OPTIONS,
  hasRuleChanges,
  isConflict,
  optionalSelectValue,
  selectValue,
  type RoutingRuleDraft,
} from './shared';

interface Props {
  companyId: string;
  actorId: string;
  /** Notify the shell of the active-rule count for the badge in the tab list. */
  onActiveCountChange?: (count: number) => void;
}

/**
 * Routing rules tab content. Owns:
 *  - rule list (via useRoutingRules) + reload after each mutation
 *  - inline create form state
 *  - per-row draft + busy state + expanded toggle
 *  - profile list (for the "assign to" picker) cached by companyId
 *  - category/subcategory lists (for the condition pickers)
 *
 * Active-count is surfaced upward via onActiveCountChange so the shell's tab
 * badge can render in sync without lifting the entire rules array.
 */
export function RoutingEditor({ companyId, actorId, onActiveCountChange }: Props) {
  const { rules, loading, error, reload } = useRoutingRules(companyId);
  const { categories } = useRequestCategories(companyId, true);
  const { subcategories } = useRequestSubcategories(companyId, { includeInactive: true });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['profiles', companyId],
    queryFn: () => listProfiles(companyId).then((r) => r.data),
    enabled: !!companyId,
    staleTime: STALE.reference,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('');
  const [createSubcategory, setCreateSubcategory] = useState('');
  const [createRole, setCreateRole] = useState('');
  const [createPriority, setCreatePriority] = useState('');
  const [createAssignTo, setCreateAssignTo] = useState('');
  const [creating, setCreating] = useState(false);

  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RoutingRuleDraft>>({});
  // Rule awaiting delete confirmation, and the rule whose last save hit an
  // optimistic-lock conflict (drives the inline "reload" banner).
  const [deletingRule, setDeletingRule] = useState<RequestRoutingRule | null>(null);
  const [conflictRuleId, setConflictRuleId] = useState<string | null>(null);

  // Local mirror so drag-and-drop can reorder optimistically; re-synced from
  // the hook's server state on every load/reload.
  const [orderedRules, setOrderedRules] = useState<RequestRoutingRule[]>(rules);
  const [reordering, setReordering] = useState(false);
  useEffect(() => { setOrderedRules(rules); }, [rules]);

  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.status === 'active' && !p.portal_access_only),
    [profiles],
  );
  const activeSubcategoriesForKey = useCallback(
    (key: string) => subcategories.filter((s) => s.category_key === key && s.is_active),
    [subcategories],
  );

  // Surface the active-rule count to the shell so its tab badge stays in sync
  // without having to re-query useRoutingRules at the shell level.
  const activeRuleCount = useMemo(
    () => rules.filter((rule) => rule.is_active).length,
    [rules],
  );
  useEffect(() => {
    onActiveCountChange?.(activeRuleCount);
  }, [activeRuleCount, onActiveCountChange]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateCategory('');
    setCreateSubcategory('');
    setCreateRole('');
    setCreatePriority('');
    setCreateAssignTo('');
  };

  const updateDraft = (rule: RequestRoutingRule, patch: Partial<RoutingRuleDraft>) => {
    setRuleDrafts((current) => ({
      ...current,
      [rule.id]: {
        ...current[rule.id],
        name: rule.name,
        match_category: rule.match_category ?? '',
        match_subcategory: rule.match_subcategory ?? '',
        match_submitter_role: rule.match_submitter_role ?? '',
        match_priority: rule.match_priority ?? '',
        assign_to_user_id: rule.assign_to_user_id,
        ...patch,
      },
    }));
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createAssignTo) return;
    setCreating(true);
    const result = await createRoutingRule(
      {
        name: createName,
        match_category: createCategory || null,
        match_subcategory: createSubcategory || null,
        match_submitter_role: createRole || null,
        match_priority: createPriority || null,
        assign_to_user_id: createAssignTo,
      },
      { actorId, companyId },
    );
    if (result.error) {
      toast.error('Unable to create routing rule', { description: result.error });
    } else {
      toast.success('Routing rule created');
      setIsAdding(false);
      resetCreateForm();
      await reload();
    }
    setCreating(false);
  };

  const handleSave = async (rule: RequestRoutingRule) => {
    const draft = ruleDrafts[rule.id];
    if (!draft || !hasRuleChanges(rule, draft)) return;
    setBusyRuleId(rule.id);
    const result = await updateRoutingRule(
      rule.id,
      {
        name: draft.name,
        match_category: draft.match_category || null,
        match_subcategory: draft.match_subcategory || null,
        match_submitter_role: draft.match_submitter_role || null,
        match_priority: draft.match_priority || null,
        assign_to_user_id: draft.assign_to_user_id,
        // Optimistic-lock token: the version this draft was based on.
        expectedUpdatedAt: rule.updated_at,
      },
      { actorId, companyId },
    );
    if (isConflict(result)) {
      // Surface an inline reload prompt instead of clobbering the other writer.
      setConflictRuleId(rule.id);
    } else if (result.error) {
      toast.error('Unable to save routing rule', { description: result.error });
    } else {
      toast.success('Rule updated');
      setConflictRuleId(null);
      setExpandedRuleId(null);
      await reload();
    }
    setBusyRuleId(null);
  };

  const handleDelete = async (rule: RequestRoutingRule) => {
    setBusyRuleId(rule.id);
    const result = await deleteRoutingRule(rule.id, { actorId, companyId }, rule.updated_at);
    if (isConflict(result)) {
      toast.error('Rule changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reload();
    } else if (result.error) {
      toast.error('Unable to delete routing rule', { description: result.error });
    } else {
      toast.success('Rule deleted', { description: `"${rule.name}" has been removed.` });
      setExpandedRuleId(null);
      await reload();
    }
    setDeletingRule(null);
    setBusyRuleId(null);
  };

  const handleReorder = async (orderedIds: string[]) => {
    const byId = new Map(orderedRules.map((rule) => [rule.id, rule]));
    const next = orderedIds.map((id) => byId.get(id)).filter((rule): rule is RequestRoutingRule => Boolean(rule));
    setOrderedRules(next);
    setReordering(true);
    const result = await reorderRoutingRules(orderedIds, { actorId, companyId });
    if (result.error) toast.error('Unable to reorder rules', { description: result.error });
    await reload();
    setReordering(false);
  };

  const handleToggle = async (rule: RequestRoutingRule) => {
    setBusyRuleId(rule.id);
    const result = await updateRoutingRule(
      rule.id,
      { is_active: !rule.is_active, expectedUpdatedAt: rule.updated_at },
      { actorId, companyId },
    );
    if (isConflict(result)) {
      toast.error('Rule changed', { description: CONFLICT_RELOAD_MESSAGE });
      await reload();
    } else if (result.error) {
      toast.error('Unable to update rule', { description: result.error });
    } else {
      await reload();
    }
    setBusyRuleId(null);
  };

  const editingRule = rules.find((rule) => rule.id === expandedRuleId) ?? null;
  const editingDraft = editingRule ? ruleDrafts[editingRule.id] : undefined;
  const editingDirty = editingRule ? hasRuleChanges(editingRule, editingDraft) : false;

  const openEdit = (rule: RequestRoutingRule) => {
    setRuleDrafts((prev) => ({
      ...prev,
      [rule.id]: {
        name: rule.name,
        match_category: rule.match_category ?? '',
        match_subcategory: rule.match_subcategory ?? '',
        match_submitter_role: rule.match_submitter_role ?? '',
        match_priority: rule.match_priority ?? '',
        assign_to_user_id: rule.assign_to_user_id,
      },
    }));
    setExpandedRuleId(rule.id);
  };

  return (
    <div className="space-y-4">
      <Sheet
        open={isAdding}
        onOpenChange={(open) => { setIsAdding(open); if (!open) resetCreateForm(); }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>New routing rule</SheetTitle>
            <SheetDescription>Route matching requests to a specific assignee.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-create-name">Rule name <span className="text-destructive">*</span></Label>
            <Input
              id="rule-create-name"
              placeholder="e.g. Sales requests → Alice"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              disabled={creating}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rule-create-category">Category condition</Label>
              <Select
                value={selectValue(createCategory)}
                onValueChange={(value) => {
                  setCreateCategory(optionalSelectValue(value));
                  setCreateSubcategory('');
                }}
                disabled={creating}
              >
                <SelectTrigger id="rule-create-category">
                  <SelectValue placeholder="Any category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SELECT_VALUE}>Any category</SelectItem>
                  {categories.filter((c) => c.is_active).map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-create-subcategory">Subcategory condition</Label>
              <Select
                value={selectValue(createSubcategory)}
                onValueChange={(value) => setCreateSubcategory(optionalSelectValue(value))}
                disabled={creating || !createCategory}
              >
                <SelectTrigger id="rule-create-subcategory">
                  <SelectValue placeholder="Any subcategory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SELECT_VALUE}>Any subcategory</SelectItem>
                  {activeSubcategoriesForKey(createCategory).map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rule-create-role">Submitter role condition</Label>
              <Select
                value={selectValue(createRole)}
                onValueChange={(value) => setCreateRole(optionalSelectValue(value))}
                disabled={creating}
              >
                <SelectTrigger id="rule-create-role">
                  <SelectValue placeholder="Any role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SELECT_VALUE}>Any role</SelectItem>
                  {(Object.entries(ROLE_LABELS) as [string, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-create-priority">Priority condition</Label>
              <Select
                value={selectValue(createPriority)}
                onValueChange={(value) => setCreatePriority(optionalSelectValue(value))}
                disabled={creating}
              >
                <SelectTrigger id="rule-create-priority">
                  <SelectValue placeholder="Any priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SELECT_VALUE}>Any priority</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!createCategory && !createRole && !createPriority && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium">Tip:</span> Leaving all conditions blank creates a catch-all rule that matches every incoming request.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-create-assign">Assign to <span className="text-destructive">*</span></Label>
            <Select
              value={createAssignTo}
              onValueChange={setCreateAssignTo}
              disabled={creating || profilesLoading}
            >
              <SelectTrigger id="rule-create-assign">
                <SelectValue placeholder={profilesLoading ? 'Loading…' : 'Select assignee'} />
              </SelectTrigger>
              <SelectContent>
                {activeProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name || p.email}
                    {p.role && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({ROLE_LABELS[p.role] ?? p.role})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={creating || !createName.trim() || !createAssignTo}
              className="gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add rule
            </Button>
          </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading routing rules…</span>
        </div>
      ) : error ? (
        <HrmsEmptyState
          icon={AlertCircle}
          title="Unable to load routing rules"
          description={error}
          action={{ label: 'Retry', onClick: () => void reload() }}
        />
      ) : rules.length === 0 ? (
        <HrmsEmptyState
          icon={Route}
          title="No routing rules yet"
          description="Add a rule to auto-assign matching requests to the right person."
          action={{ label: 'Add rule', onClick: () => setIsAdding(true) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline">
              {rules.length} {rules.length === 1 ? 'rule' : 'rules'} ·{' '}
              {rules.filter((r) => r.is_active).length} active
            </Badge>
            {!isAdding && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAdding(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Rule
              </Button>
            )}
          </div>

          <SortableList
            items={orderedRules}
            getId={(rule) => rule.id}
            onReorder={(ids) => void handleReorder(ids)}
            disabled={reordering}
            className="space-y-4"
          >
            {(rule, { handle }) => {
              const isRuleBusy = busyRuleId === rule.id;
              const assignee = profiles.find((p) => p.id === rule.assign_to_user_id);

              return (
                <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="pt-0.5">{handle}</div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-foreground">{rule.name}</p>
                          <Badge variant={rule.is_active ? 'secondary' : 'outline'}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {rule.match_category ? (
                            <Badge variant="outline">Category: {categories.find((c) => c.key === rule.match_category)?.label ?? rule.match_category}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Any category</Badge>
                          )}
                          {rule.match_subcategory && (
                            <Badge variant="outline">Subcategory: {subcategories.find((s) => s.key === rule.match_subcategory)?.label ?? rule.match_subcategory}</Badge>
                          )}
                          {rule.match_submitter_role && (
                            <Badge variant="outline">Role: {ROLE_LABELS[rule.match_submitter_role as keyof typeof ROLE_LABELS] ?? rule.match_submitter_role}</Badge>
                          )}
                          {rule.match_priority && (
                            <Badge variant="outline" className="capitalize">Priority: {rule.match_priority}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Assign to: <span className="font-medium text-foreground">{assignee ? (assignee.name || assignee.email) : rule.assign_to_user_id}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(rule)}
                        disabled={isRuleBusy}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${rule.name}`}
                        onClick={() => setDeletingRule(rule)}
                        disabled={isRuleBusy}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {isRuleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Rule active</p>
                      <p className="text-xs text-muted-foreground">
                        Inactive rules are skipped during evaluation.
                      </p>
                    </div>
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => void handleToggle(rule)}
                      disabled={isRuleBusy}
                    />
                  </div>
                </div>
              );
            }}
          </SortableList>
        </div>
      )}

      {/* Edit routing rule drawer */}
      <Sheet
        open={!!editingRule}
        onOpenChange={(open) => { if (!open) { setExpandedRuleId(null); setConflictRuleId(null); } }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Edit routing rule</SheetTitle>
            <SheetDescription>{editingRule?.name ?? ''}</SheetDescription>
          </SheetHeader>
          {editingRule && editingDraft && (
            <div className="mt-4 space-y-4">
              {conflictRuleId === editingRule.id && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>{CONFLICT_RELOAD_MESSAGE}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setConflictRuleId(null); setExpandedRuleId(null); void reload(); }}
                    >
                      Reload
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor={`rule-name-${editingRule.id}`}>Rule name</Label>
                <Input
                  id={`rule-name-${editingRule.id}`}
                  value={editingDraft.name}
                  onChange={(event) => updateDraft(editingRule, { name: event.target.value })}
                  disabled={busyRuleId === editingRule.id}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`rule-cat-${editingRule.id}`}>Category condition</Label>
                  <Select
                    value={selectValue(editingDraft.match_category)}
                    onValueChange={(value) => updateDraft(editingRule, {
                      match_category: optionalSelectValue(value),
                      match_subcategory: '',
                    })}
                    disabled={busyRuleId === editingRule.id}
                  >
                    <SelectTrigger id={`rule-cat-${editingRule.id}`}>
                      <SelectValue placeholder="Any category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_SELECT_VALUE}>Any category</SelectItem>
                      {categories.filter((c) => c.is_active).map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`rule-subcat-${editingRule.id}`}>Subcategory condition</Label>
                  <Select
                    value={selectValue(editingDraft.match_subcategory)}
                    onValueChange={(value) => updateDraft(editingRule, { match_subcategory: optionalSelectValue(value) })}
                    disabled={busyRuleId === editingRule.id || !editingDraft.match_category}
                  >
                    <SelectTrigger id={`rule-subcat-${editingRule.id}`}>
                      <SelectValue placeholder="Any subcategory" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_SELECT_VALUE}>Any subcategory</SelectItem>
                      {activeSubcategoriesForKey(editingDraft.match_category).map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`rule-role-${editingRule.id}`}>Submitter role condition</Label>
                  <Select
                    value={selectValue(editingDraft.match_submitter_role)}
                    onValueChange={(value) => updateDraft(editingRule, { match_submitter_role: optionalSelectValue(value) })}
                    disabled={busyRuleId === editingRule.id}
                  >
                    <SelectTrigger id={`rule-role-${editingRule.id}`}>
                      <SelectValue placeholder="Any role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_SELECT_VALUE}>Any role</SelectItem>
                      {(Object.entries(ROLE_LABELS) as [string, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`rule-priority-${editingRule.id}`}>Priority condition</Label>
                  <Select
                    value={selectValue(editingDraft.match_priority)}
                    onValueChange={(value) => updateDraft(editingRule, { match_priority: optionalSelectValue(value) })}
                    disabled={busyRuleId === editingRule.id}
                  >
                    <SelectTrigger id={`rule-priority-${editingRule.id}`}>
                      <SelectValue placeholder="Any priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_SELECT_VALUE}>Any priority</SelectItem>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`rule-assign-${editingRule.id}`}>Assign to</Label>
                <Select
                  value={editingDraft.assign_to_user_id}
                  onValueChange={(v) => updateDraft(editingRule, { assign_to_user_id: v })}
                  disabled={busyRuleId === editingRule.id || profilesLoading}
                >
                  <SelectTrigger id={`rule-assign-${editingRule.id}`}>
                    <SelectValue placeholder={profilesLoading ? 'Loading…' : 'Select assignee'} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.email}
                        {p.role && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({ROLE_LABELS[p.role] ?? p.role})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <SheetFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setExpandedRuleId(null)} disabled={!!busyRuleId}>Cancel</Button>
            <Button
              type="button"
              onClick={() => { if (editingRule) void handleSave(editingRule); }}
              disabled={!editingRule || busyRuleId === editingRule?.id || !editingDirty}
              className="gap-2"
            >
              {editingRule && busyRuleId === editingRule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deletingRule !== null}
        onOpenChange={(open) => { if (!open) setDeletingRule(null); }}
        title="Delete routing rule"
        description={
          deletingRule
            ? `"${deletingRule.name}" will be permanently removed. Incoming requests will no longer match this rule. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete rule"
        confirmVariant="destructive"
        loading={deletingRule ? busyRuleId === deletingRule.id : false}
        onConfirm={() => { if (deletingRule) void handleDelete(deletingRule); }}
      />
    </div>
  );
}
