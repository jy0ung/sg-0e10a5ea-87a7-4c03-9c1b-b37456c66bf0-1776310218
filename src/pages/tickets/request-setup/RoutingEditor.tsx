import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
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
import { ROLE_LABELS } from '@/config/rolePermissions';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useRoutingRules } from '@/hooks/useRoutingRules';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { listProfiles } from '@flc/auth';
import {
  createRoutingRule,
  deleteRoutingRule,
  moveRoutingRule,
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

  const handleMove = async (ruleId: string, direction: 'up' | 'down') => {
    setBusyRuleId(ruleId);
    const result = await moveRoutingRule(ruleId, direction, { actorId, companyId });
    if (result.error) toast.error('Unable to reorder rule', { description: result.error });
    else await reload();
    setBusyRuleId(null);
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

  return (
    <div className="space-y-4">
      {isAdding && (
        <div className="space-y-4 rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">New routing rule</p>
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

          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !createName.trim() || !createAssignTo}
            className="gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add rule
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading routing rules…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Unable to load routing rules</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void reload()}>Retry</Button>
        </div>
      ) : rules.length === 0 ? (
        !isAdding ? (
          <div className="flex items-center justify-center py-16">
            <Button type="button" onClick={() => setIsAdding(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
          </div>
        ) : null
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

          {rules.map((rule, rIdx) => {
            const isRuleBusy = busyRuleId === rule.id;
            const isExpanded = expandedRuleId === rule.id;
            const draft = ruleDrafts[rule.id];
            const isDirty = hasRuleChanges(rule, draft);
            const assignee = profiles.find((p) => p.id === rule.assign_to_user_id);

            return (
              <div key={rule.id} className="space-y-4 rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
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

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Move ${rule.name} up`}
                      onClick={() => void handleMove(rule.id, 'up')}
                      disabled={isRuleBusy || rIdx === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Move ${rule.name} down`}
                      onClick={() => void handleMove(rule.id, 'down')}
                      disabled={isRuleBusy || rIdx === rules.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedRuleId(null);
                        } else {
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
                        }
                      }}
                      disabled={isRuleBusy}
                    >
                      {isExpanded ? 'Collapse' : 'Edit'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeletingRule(rule)}
                      disabled={isRuleBusy}
                      className="text-destructive hover:text-destructive"
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

                {isExpanded && draft && (
                  <div className="space-y-4 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                    {conflictRuleId === rule.id && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                          <span>{CONFLICT_RELOAD_MESSAGE}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setConflictRuleId(null);
                              setExpandedRuleId(null);
                              void reload();
                            }}
                          >
                            Reload
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor={`rule-name-${rule.id}`}>Rule name</Label>
                      <Input
                        id={`rule-name-${rule.id}`}
                        value={draft.name}
                        onChange={(event) => updateDraft(rule, { name: event.target.value })}
                        disabled={isRuleBusy}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`rule-cat-${rule.id}`}>Category condition</Label>
                        <Select
                          value={selectValue(draft.match_category)}
                          onValueChange={(value) => updateDraft(rule, {
                            match_category: optionalSelectValue(value),
                            match_subcategory: '',
                          })}
                          disabled={isRuleBusy}
                        >
                          <SelectTrigger id={`rule-cat-${rule.id}`}>
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
                        <Label htmlFor={`rule-subcat-${rule.id}`}>Subcategory condition</Label>
                        <Select
                          value={selectValue(draft.match_subcategory)}
                          onValueChange={(value) => updateDraft(rule, { match_subcategory: optionalSelectValue(value) })}
                          disabled={isRuleBusy || !draft.match_category}
                        >
                          <SelectTrigger id={`rule-subcat-${rule.id}`}>
                            <SelectValue placeholder="Any subcategory" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ANY_SELECT_VALUE}>Any subcategory</SelectItem>
                            {activeSubcategoriesForKey(draft.match_category).map((s) => (
                              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`rule-role-${rule.id}`}>Submitter role condition</Label>
                        <Select
                          value={selectValue(draft.match_submitter_role)}
                          onValueChange={(value) => updateDraft(rule, { match_submitter_role: optionalSelectValue(value) })}
                          disabled={isRuleBusy}
                        >
                          <SelectTrigger id={`rule-role-${rule.id}`}>
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
                        <Label htmlFor={`rule-priority-${rule.id}`}>Priority condition</Label>
                        <Select
                          value={selectValue(draft.match_priority)}
                          onValueChange={(value) => updateDraft(rule, { match_priority: optionalSelectValue(value) })}
                          disabled={isRuleBusy}
                        >
                          <SelectTrigger id={`rule-priority-${rule.id}`}>
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
                      <Label htmlFor={`rule-assign-${rule.id}`}>Assign to</Label>
                      <Select
                        value={draft.assign_to_user_id}
                        onValueChange={(v) => updateDraft(rule, { assign_to_user_id: v })}
                        disabled={isRuleBusy || profilesLoading}
                      >
                        <SelectTrigger id={`rule-assign-${rule.id}`}>
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

                    <Button
                      type="button"
                      onClick={() => void handleSave(rule)}
                      disabled={isRuleBusy || !isDirty}
                      className="gap-2"
                    >
                      {isRuleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save changes
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
