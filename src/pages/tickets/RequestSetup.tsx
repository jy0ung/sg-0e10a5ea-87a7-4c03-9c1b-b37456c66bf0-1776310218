import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Plus, Route, Save, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ROLE_LABELS } from '@/config/rolePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useAttachmentSettings } from '@/hooks/useAttachmentSettings';
import { useRoutingRules } from '@/hooks/useRoutingRules';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { useRequestSubcategories } from '@/hooks/useRequestSubcategories';
import { useRequestTemplates } from '@/hooks/useRequestTemplates';
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
import {
  createRequestTemplate,
  deleteRequestTemplate,
  moveRequestTemplate,
  updateRequestTemplate,
  type RequestTemplateRecord,
  type TemplatePriority,
} from '@/services/requestTemplateService';
import { listProfiles, type ProfileRow } from '@/services/profileService';
import {
  createRoutingRule,
  deleteRoutingRule,
  moveRoutingRule,
  updateRoutingRule,
  type RequestRoutingRule,
} from '@/services/requestRoutingService';

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

interface TemplateDraft {
  name: string;
  description: string;
  category_key: string;
  subcategory_key: string;
  priority: TemplatePriority;
  subject: string;
  body: string;
  is_active: boolean;
}

function hasTemplateChanges(template: RequestTemplateRecord, draft: TemplateDraft | undefined) {
  if (!draft) return false;
  return (
    draft.name !== template.name
    || draft.description !== template.description
    || draft.category_key !== template.category_key
    || draft.subcategory_key !== (template.subcategory_key ?? '')
    || draft.priority !== template.priority
    || draft.subject !== template.subject
    || draft.body !== template.body
    || draft.is_active !== template.is_active
  );
}

interface RoutingRuleDraft {
  name: string;
  match_category: string;
  match_subcategory: string;
  match_submitter_role: string;
  match_priority: string;
  assign_to_user_id: string;
}

function hasRuleChanges(rule: RequestRoutingRule, draft: RoutingRuleDraft | undefined) {
  if (!draft) return false;
  return (
    draft.name !== rule.name
    || (draft.match_category || null) !== rule.match_category
    || (draft.match_subcategory || null) !== rule.match_subcategory
    || (draft.match_submitter_role || null) !== rule.match_submitter_role
    || (draft.match_priority || null) !== rule.match_priority
    || draft.assign_to_user_id !== rule.assign_to_user_id
  );
}

const PRIORITY_OPTIONS: { value: TemplatePriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function RequestSetup() {
  const { user } = useAuth();
  const { categories, loading, error, reload } = useRequestCategories(user?.company_id, true);
  const {
    subcategories,
    loading: subcategoriesLoading,
    error: subcategoriesError,
    reload: reloadSubcategories,
  } = useRequestSubcategories(user?.company_id, { includeInactive: true });
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  const [creatingSubcategoryKey, setCreatingSubcategoryKey] = useState<string | null>(null);
  const [busySubcategoryId, setBusySubcategoryId] = useState<string | null>(null);
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, SubcategoryDraft>>({});
  const [createSubcategoryDrafts, setCreateSubcategoryDrafts] = useState<Record<string, CreateSubcategoryDraft>>({});

  // ── Attachment settings state ─────────────────────────────────────────────
  const { settings: attachmentSettings, loading: attachmentSettingsLoading, save: saveAttachmentSettings } =
    useAttachmentSettings(user?.company_id);
  const [attachMaxFileSizeMb, setAttachMaxFileSizeMb] = useState(3);
  const [attachMaxFiles, setAttachMaxFiles] = useState(3);
  const [savingAttachmentSettings, setSavingAttachmentSettings] = useState(false);

  useEffect(() => {
    setAttachMaxFileSizeMb(attachmentSettings.max_file_size_mb);
    setAttachMaxFiles(attachmentSettings.max_files_per_ticket);
  }, [attachmentSettings]);

  const handleSaveAttachmentSettings = async () => {
    if (!user) return;
    setSavingAttachmentSettings(true);
    const { error } = await saveAttachmentSettings(
      { max_file_size_mb: attachMaxFileSizeMb, max_files_per_ticket: attachMaxFiles },
      user.id,
    );
    if (error) {
      toast.error('Failed to save settings', { description: error });
    } else {
      toast.success('Attachment settings saved');
    }
    setSavingAttachmentSettings(false);
  };

  // ── Template state ────────────────────────────────────────────────────────
  const { templates, loading: templatesLoading, error: templatesError, reload: reloadTemplates } =
    useRequestTemplates(user?.company_id, { includeInactive: true });
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [templateCreateName, setTemplateCreateName] = useState('');
  const [templateCreateDescription, setTemplateCreateDescription] = useState('');
  const [templateCreateCategoryKey, setTemplateCreateCategoryKey] = useState('');
  const [templateCreateSubcategoryKey, setTemplateCreateSubcategoryKey] = useState('');
  const [templateCreatePriority, setTemplateCreatePriority] = useState<TemplatePriority>('medium');
  const [templateCreateSubject, setTemplateCreateSubject] = useState('');
  const [templateCreateBody, setTemplateCreateBody] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, TemplateDraft>>({});
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Routing rules state ───────────────────────────────────────────────────
  const { rules: routingRules, loading: routingRulesLoading, error: routingRulesError, reload: reloadRoutingRules } =
    useRoutingRules(user?.company_id);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [ruleCreateName, setRuleCreateName] = useState('');
  const [ruleCreateCategory, setRuleCreateCategory] = useState('');
  const [ruleCreateSubcategory, setRuleCreateSubcategory] = useState('');
  const [ruleCreateRole, setRuleCreateRole] = useState('');
  const [ruleCreatePriority, setRuleCreatePriority] = useState('');
  const [ruleCreateAssignTo, setRuleCreateAssignTo] = useState('');
  const [creatingRule, setCreatingRule] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RoutingRuleDraft>>({});

  useEffect(() => {
    if (!user?.company_id) return;
    void (async () => {
      setProfilesLoading(true);
      const { data } = await listProfiles(user.company_id ?? undefined);
      setProfiles(data);
      setProfilesLoading(false);
    })();
  }, [user?.company_id]);
  // ─────────────────────────────────────────────────────────────────────────

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

  const activeTemplateCount = useMemo(
    () => templates.filter((t) => t.is_active).length,
    [templates],
  );

  const activeSubcategoriesForKey = useCallback(
    (categoryKey: string) =>
      subcategories.filter((s) => s.category_key === categoryKey && s.is_active),
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
      setIsAddingCategory(false);
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

  // ── Template handlers ─────────────────────────────────────────────────────

  const resetTemplateCreateForm = () => {
    setTemplateCreateName('');
    setTemplateCreateDescription('');
    setTemplateCreateCategoryKey('');
    setTemplateCreateSubcategoryKey('');
    setTemplateCreatePriority('medium');
    setTemplateCreateSubject('');
    setTemplateCreateBody('');
  };

  const handleCreateTemplate = async () => {
    if (!user) return;
    setCreatingTemplate(true);
    const result = await createRequestTemplate(
      {
        name: templateCreateName,
        description: templateCreateDescription,
        category_key: templateCreateCategoryKey,
        subcategory_key: templateCreateSubcategoryKey || null,
        priority: templateCreatePriority,
        subject: templateCreateSubject,
        body: templateCreateBody,
      },
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to create template', { description: result.error });
    } else {
      toast.success('Template created', {
        description: 'Requesters can now pick this template when creating a new request.',
      });
      setIsAddingTemplate(false);
      resetTemplateCreateForm();
      await reloadTemplates();
    }
    setCreatingTemplate(false);
  };

  const updateTemplateDraft = (template: RequestTemplateRecord, patch: Partial<TemplateDraft>) => {
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

  const handleSaveTemplate = async (template: RequestTemplateRecord) => {
    if (!user) return;
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
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to save template', { description: result.error });
    } else {
      toast.success('Template saved');
      await reloadTemplates();
    }
    setBusyTemplateId(null);
  };

  const handleMoveTemplate = async (templateId: string, direction: 'up' | 'down') => {
    if (!user) return;
    setBusyTemplateId(templateId);
    const result = await moveRequestTemplate(templateId, direction, {
      actorId: user.id,
      companyId: user.company_id,
    });
    if (result.error) {
      toast.error('Unable to reorder templates', { description: result.error });
    } else {
      await reloadTemplates();
    }
    setBusyTemplateId(null);
  };

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!user) return;
    setBusyTemplateId(templateId);
    const result = await deleteRequestTemplate(templateId, {
      actorId: user.id,
      companyId: user.company_id,
    });
    if (result.error) {
      toast.error('Unable to delete template', { description: result.error });
    } else {
      toast.success('Template deleted', {
        description: `"${templateName}" has been removed.`,
      });
      setExpandedTemplateId(null);
      await reloadTemplates();
    }
    setBusyTemplateId(null);
  };

  // ── Routing rule handlers ─────────────────────────────────────────────────

  const activeProfiles = profiles.filter((p) => p.status === 'active' && !p.portal_access_only);

  const resetRuleCreateForm = () => {
    setRuleCreateName('');
    setRuleCreateCategory('');
    setRuleCreateSubcategory('');
    setRuleCreateRole('');
    setRuleCreatePriority('');
    setRuleCreateAssignTo('');
  };

  const handleCreateRule = async () => {
    if (!user || !ruleCreateName.trim() || !ruleCreateAssignTo) return;
    setCreatingRule(true);
    const result = await createRoutingRule(
      {
        name: ruleCreateName,
        match_category: ruleCreateCategory || null,
        match_subcategory: ruleCreateSubcategory || null,
        match_submitter_role: ruleCreateRole || null,
        match_priority: ruleCreatePriority || null,
        assign_to_user_id: ruleCreateAssignTo,
      },
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to create routing rule', { description: result.error });
    } else {
      toast.success('Routing rule created');
      setIsAddingRule(false);
      resetRuleCreateForm();
      await reloadRoutingRules();
    }
    setCreatingRule(false);
  };

  const updateRuleDraft = (rule: RequestRoutingRule, patch: Partial<RoutingRuleDraft>) => {
    setRuleDrafts((current) => ({
      ...current,
      [rule.id]: {
        name: rule.name,
        match_category: rule.match_category ?? '',
        match_subcategory: rule.match_subcategory ?? '',
        match_submitter_role: rule.match_submitter_role ?? '',
        match_priority: rule.match_priority ?? '',
        assign_to_user_id: rule.assign_to_user_id,
        ...current[rule.id],
        ...patch,
      },
    }));
  };

  const handleSaveRule = async (rule: RequestRoutingRule) => {
    if (!user) return;
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
      },
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to save routing rule', { description: result.error });
    } else {
      toast.success('Rule updated');
      setExpandedRuleId(null);
      await reloadRoutingRules();
    }
    setBusyRuleId(null);
  };

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (!user) return;
    setBusyRuleId(ruleId);
    const result = await deleteRoutingRule(ruleId, { actorId: user.id, companyId: user.company_id });
    if (result.error) {
      toast.error('Unable to delete routing rule', { description: result.error });
    } else {
      toast.success('Rule deleted', { description: `"${ruleName}" has been removed.` });
      setExpandedRuleId(null);
      await reloadRoutingRules();
    }
    setBusyRuleId(null);
  };

  const handleMoveRule = async (ruleId: string, direction: 'up' | 'down') => {
    if (!user) return;
    setBusyRuleId(ruleId);
    const result = await moveRoutingRule(ruleId, direction, { actorId: user.id, companyId: user.company_id });
    if (result.error) {
      toast.error('Unable to reorder rule', { description: result.error });
    } else {
      await reloadRoutingRules();
    }
    setBusyRuleId(null);
  };

  const handleToggleRule = async (rule: RequestRoutingRule) => {
    if (!user) return;
    setBusyRuleId(rule.id);
    const result = await updateRoutingRule(
      rule.id,
      { is_active: !rule.is_active },
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to update rule', { description: result.error });
    } else {
      await reloadRoutingRules();
    }
    setBusyRuleId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Request Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure request categories and pre-built templates for Internal Requests.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Customization</CardTitle>
          <CardDescription>
            Manage categories, subcategories, and templates from one canvas. Changes take effect immediately for new requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="categories">
            <TabsList className="mb-6">
              <TabsTrigger value="categories">
                Categories
                {activeCategoryCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                    {activeCategoryCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="templates">
                Templates
                {activeTemplateCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                    {activeTemplateCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="routing">
                <Route className="mr-1.5 h-3.5 w-3.5" />
                Routing
                {routingRules.filter((r) => r.is_active).length > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                    {routingRules.filter((r) => r.is_active).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="categories" className="space-y-6">
          {isAddingCategory && (
            <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">New category</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => { setIsAddingCategory(false); setCreateLabel(''); setCreateDescription(''); }}
                  disabled={creating}
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.2fr,1.8fr]">
                <div className="space-y-2">
                  <Label htmlFor="request-category-name">Category name</Label>
                  <Input
                    id="request-category-name"
                    placeholder="Example: Procurement Support"
                    value={createLabel}
                    onChange={(event) => setCreateLabel(event.target.value)}
                    disabled={creating}
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
          )}

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
            !isAddingCategory ? (
              <div className="flex items-center justify-center py-16">
                <Button
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Category
                </Button>
              </div>
            ) : null
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="outline">{categories.length} {categories.length === 1 ? 'category' : 'categories'}</Badge>
                {!isAddingCategory && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingCategory(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Category
                  </Button>
                )}
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
          </TabsContent>

          {/* ── Templates tab ─────────────────────────────────────────── */}
          <TabsContent value="templates" className="space-y-6">
            {/* Add template header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Templates</p>
                <p className="text-sm text-muted-foreground">
                  Pre-build request starters so employees can submit common requests in seconds.
                </p>
              </div>
              {!isAddingTemplate && (
                <Button
                  type="button"
                  onClick={() => setIsAddingTemplate(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Template
                </Button>
              )}
            </div>

            {/* Create template form */}
            {isAddingTemplate && (
              <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">New template</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => { setIsAddingTemplate(false); resetTemplateCreateForm(); }}
                    disabled={creatingTemplate}
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
                      value={templateCreateName}
                      onChange={(e) => setTemplateCreateName(e.target.value)}
                      disabled={creatingTemplate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-create-description">Description</Label>
                    <Input
                      id="template-create-description"
                      placeholder="When should employees use this template?"
                      value={templateCreateDescription}
                      onChange={(e) => setTemplateCreateDescription(e.target.value)}
                      disabled={creatingTemplate}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="template-create-category">Category <span className="text-destructive">*</span></Label>
                    <Select
                      value={templateCreateCategoryKey}
                      onValueChange={(v) => { setTemplateCreateCategoryKey(v); setTemplateCreateSubcategoryKey(''); }}
                      disabled={creatingTemplate || categories.length === 0}
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
                      value={templateCreateSubcategoryKey}
                      onValueChange={setTemplateCreateSubcategoryKey}
                      disabled={creatingTemplate || !templateCreateCategoryKey || activeSubcategoriesForKey(templateCreateCategoryKey).length === 0}
                    >
                      <SelectTrigger id="template-create-subcategory">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {activeSubcategoriesForKey(templateCreateCategoryKey).map((s) => (
                          <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-create-priority">Default priority <span className="text-destructive">*</span></Label>
                    <Select
                      value={templateCreatePriority}
                      onValueChange={(v) => setTemplateCreatePriority(v as TemplatePriority)}
                      disabled={creatingTemplate}
                    >
                      <SelectTrigger id="template-create-priority">
                        <SelectValue />
                      </SelectTrigger>
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
                    value={templateCreateSubject}
                    onChange={(e) => setTemplateCreateSubject(e.target.value)}
                    disabled={creatingTemplate}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-create-body">Body <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="template-create-body"
                    placeholder="Pre-filled description requesters can edit before submitting."
                    value={templateCreateBody}
                    onChange={(e) => setTemplateCreateBody(e.target.value)}
                    rows={5}
                    disabled={creatingTemplate}
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => void handleCreateTemplate()}
                  disabled={
                    creatingTemplate
                    || templateCreateName.trim().length === 0
                    || !templateCreateCategoryKey
                    || templateCreateSubject.trim().length === 0
                    || templateCreateBody.trim().length === 0
                  }
                  className="gap-2"
                >
                  {creatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add template
                </Button>
              </div>
            )}

            {/* Template list */}
            {templatesLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading templates...</span>
              </div>
            ) : templatesError ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Unable to load templates</p>
                  <p className="text-sm text-muted-foreground">{templatesError}</p>
                </div>
                <Button variant="outline" onClick={() => void reloadTemplates()}>Retry</Button>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-16 text-center">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">No templates yet</p>
                  <p className="text-sm text-muted-foreground">
                    Click <span className="font-medium">Add Template</span> to create the first one.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline">
                    {templates.length} {templates.length === 1 ? 'template' : 'templates'}
                  </Badge>
                  {!isAddingTemplate && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddingTemplate(true)}
                      className="gap-2"
                    >
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
                    <div key={template.id} className="rounded-xl border border-border bg-background p-4 space-y-4">
                      {/* Template header */}
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
                            onClick={() => void handleMoveTemplate(template.id, 'up')}
                            disabled={isBusy || tIdx === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Move ${template.name} down`}
                            onClick={() => void handleMoveTemplate(template.id, 'down')}
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
                            onClick={() => void handleDeleteTemplate(template.id, template.name)}
                            disabled={isBusy}
                            className="text-destructive hover:text-destructive"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Inline edit form */}
                      {isExpanded && draft && (
                        <div className="space-y-4 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`template-name-${template.id}`}>Template name</Label>
                              <Input
                                id={`template-name-${template.id}`}
                                value={draft.name}
                                onChange={(e) => updateTemplateDraft(template, { name: e.target.value })}
                                disabled={isBusy}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`template-desc-${template.id}`}>Description</Label>
                              <Input
                                id={`template-desc-${template.id}`}
                                value={draft.description}
                                onChange={(e) => updateTemplateDraft(template, { description: e.target.value })}
                                disabled={isBusy}
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor={`template-cat-${template.id}`}>Category</Label>
                              <Select
                                value={draft.category_key}
                                onValueChange={(v) => updateTemplateDraft(template, { category_key: v, subcategory_key: '' })}
                                disabled={isBusy || categories.length === 0}
                              >
                                <SelectTrigger id={`template-cat-${template.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
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
                                value={draft.subcategory_key}
                                onValueChange={(v) => updateTemplateDraft(template, { subcategory_key: v })}
                                disabled={isBusy || draftSubcategories.length === 0}
                              >
                                <SelectTrigger id={`template-subcat-${template.id}`}>
                                  <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">None</SelectItem>
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
                                onValueChange={(v) => updateTemplateDraft(template, { priority: v as TemplatePriority })}
                                disabled={isBusy}
                              >
                                <SelectTrigger id={`template-priority-${template.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
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
                              onChange={(e) => updateTemplateDraft(template, { subject: e.target.value })}
                              disabled={isBusy}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`template-body-${template.id}`}>Body</Label>
                            <Textarea
                              id={`template-body-${template.id}`}
                              value={draft.body}
                              onChange={(e) => updateTemplateDraft(template, { body: e.target.value })}
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
                              onCheckedChange={(checked) => updateTemplateDraft(template, { is_active: checked })}
                              disabled={isBusy}
                            />
                          </div>

                          <Button
                            type="button"
                            onClick={() => void handleSaveTemplate(template)}
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
          </TabsContent>

          {/* ── Routing tab ──────────────────────────────────────────────── */}
          <TabsContent value="routing" className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Auto-routing Rules</p>
                <p className="text-sm text-muted-foreground">
                  Rules are evaluated in order — the first active match wins. Leave a condition blank to match any value.
                </p>
              </div>
              {!isAddingRule && (
                <Button type="button" onClick={() => setIsAddingRule(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Rule
                </Button>
              )}
            </div>

            {/* Create rule form */}
            {isAddingRule && (
              <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">New routing rule</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => { setIsAddingRule(false); resetRuleCreateForm(); }}
                    disabled={creatingRule}
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
                    value={ruleCreateName}
                    onChange={(e) => setRuleCreateName(e.target.value)}
                    disabled={creatingRule}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rule-create-category">Category condition</Label>
                    <Select
                      value={ruleCreateCategory}
                      onValueChange={(v) => { setRuleCreateCategory(v); setRuleCreateSubcategory(''); }}
                      disabled={creatingRule}
                    >
                      <SelectTrigger id="rule-create-category">
                        <SelectValue placeholder="Any category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any category</SelectItem>
                        {categories.filter((c) => c.is_active).map((c) => (
                          <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rule-create-subcategory">Subcategory condition</Label>
                    <Select
                      value={ruleCreateSubcategory}
                      onValueChange={setRuleCreateSubcategory}
                      disabled={creatingRule || !ruleCreateCategory}
                    >
                      <SelectTrigger id="rule-create-subcategory">
                        <SelectValue placeholder="Any subcategory" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any subcategory</SelectItem>
                        {activeSubcategoriesForKey(ruleCreateCategory).map((s) => (
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
                      value={ruleCreateRole}
                      onValueChange={setRuleCreateRole}
                      disabled={creatingRule}
                    >
                      <SelectTrigger id="rule-create-role">
                        <SelectValue placeholder="Any role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any role</SelectItem>
                        {(Object.entries(ROLE_LABELS) as [string, string][]).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rule-create-priority">Priority condition</Label>
                    <Select
                      value={ruleCreatePriority}
                      onValueChange={setRuleCreatePriority}
                      disabled={creatingRule}
                    >
                      <SelectTrigger id="rule-create-priority">
                        <SelectValue placeholder="Any priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any priority</SelectItem>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!ruleCreateCategory && !ruleCreateRole && !ruleCreatePriority && (
                  <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
                    <span className="font-medium">Tip:</span> Leaving all conditions blank creates a catch-all rule that matches every incoming request.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="rule-create-assign">Assign to <span className="text-destructive">*</span></Label>
                  <Select
                    value={ruleCreateAssignTo}
                    onValueChange={setRuleCreateAssignTo}
                    disabled={creatingRule || profilesLoading}
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
                  onClick={() => void handleCreateRule()}
                  disabled={creatingRule || !ruleCreateName.trim() || !ruleCreateAssignTo}
                  className="gap-2"
                >
                  {creatingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add rule
                </Button>
              </div>
            )}

            {/* Rule list */}
            {routingRulesLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading routing rules…</span>
              </div>
            ) : routingRulesError ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Unable to load routing rules</p>
                  <p className="text-sm text-muted-foreground">{routingRulesError}</p>
                </div>
                <Button variant="outline" onClick={() => void reloadRoutingRules()}>Retry</Button>
              </div>
            ) : routingRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-16 text-center">
                <Route className="h-10 w-10 text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">No routing rules yet</p>
                  <p className="text-sm text-muted-foreground">
                    Click <span className="font-medium">Add Rule</span> to automatically assign incoming requests.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Badge variant="outline">
                  {routingRules.length} {routingRules.length === 1 ? 'rule' : 'rules'} ·{' '}
                  {routingRules.filter((r) => r.is_active).length} active
                </Badge>

                {routingRules.map((rule, rIdx) => {
                  const isRuleBusy = busyRuleId === rule.id;
                  const isExpanded = expandedRuleId === rule.id;
                  const draft = ruleDrafts[rule.id];
                  const isDirty = hasRuleChanges(rule, draft);
                  const assignee = profiles.find((p) => p.id === rule.assign_to_user_id);

                  return (
                    <div key={rule.id} className="rounded-xl border border-border bg-background p-4 space-y-4">
                      {/* Rule header */}
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
                            onClick={() => void handleMoveRule(rule.id, 'up')}
                            disabled={isRuleBusy || rIdx === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Move ${rule.name} down`}
                            onClick={() => void handleMoveRule(rule.id, 'down')}
                            disabled={isRuleBusy || rIdx === routingRules.length - 1}
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
                            onClick={() => void handleDeleteRule(rule.id, rule.name)}
                            disabled={isRuleBusy}
                            className="text-destructive hover:text-destructive"
                          >
                            {isRuleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Active toggle */}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Rule active</p>
                          <p className="text-xs text-muted-foreground">
                            Inactive rules are skipped during evaluation.
                          </p>
                        </div>
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => void handleToggleRule(rule)}
                          disabled={isRuleBusy}
                        />
                      </div>

                      {/* Inline edit form */}
                      {isExpanded && draft && (
                        <div className="space-y-4 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                          <div className="space-y-2">
                            <Label htmlFor={`rule-name-${rule.id}`}>Rule name</Label>
                            <Input
                              id={`rule-name-${rule.id}`}
                              value={draft.name}
                              onChange={(e) => updateRuleDraft(rule, { name: e.target.value })}
                              disabled={isRuleBusy}
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`rule-cat-${rule.id}`}>Category condition</Label>
                              <Select
                                value={draft.match_category}
                                onValueChange={(v) => updateRuleDraft(rule, { match_category: v, match_subcategory: '' })}
                                disabled={isRuleBusy}
                              >
                                <SelectTrigger id={`rule-cat-${rule.id}`}>
                                  <SelectValue placeholder="Any category" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">Any category</SelectItem>
                                  {categories.filter((c) => c.is_active).map((c) => (
                                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`rule-subcat-${rule.id}`}>Subcategory condition</Label>
                              <Select
                                value={draft.match_subcategory}
                                onValueChange={(v) => updateRuleDraft(rule, { match_subcategory: v })}
                                disabled={isRuleBusy || !draft.match_category}
                              >
                                <SelectTrigger id={`rule-subcat-${rule.id}`}>
                                  <SelectValue placeholder="Any subcategory" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">Any subcategory</SelectItem>
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
                                value={draft.match_submitter_role}
                                onValueChange={(v) => updateRuleDraft(rule, { match_submitter_role: v })}
                                disabled={isRuleBusy}
                              >
                                <SelectTrigger id={`rule-role-${rule.id}`}>
                                  <SelectValue placeholder="Any role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">Any role</SelectItem>
                                  {(Object.entries(ROLE_LABELS) as [string, string][]).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`rule-priority-${rule.id}`}>Priority condition</Label>
                              <Select
                                value={draft.match_priority}
                                onValueChange={(v) => updateRuleDraft(rule, { match_priority: v })}
                                disabled={isRuleBusy}
                              >
                                <SelectTrigger id={`rule-priority-${rule.id}`}>
                                  <SelectValue placeholder="Any priority" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">Any priority</SelectItem>
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
                              onValueChange={(v) => updateRuleDraft(rule, { assign_to_user_id: v })}
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
                            onClick={() => void handleSaveRule(rule)}
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
          </TabsContent>

          {/* ── Settings tab ─────────────────────────────────────────────── */}
          <TabsContent value="settings" className="space-y-6">
            <div>
              <p className="text-sm font-semibold text-foreground">Attachment Settings</p>
              <p className="text-sm text-muted-foreground">
                Control how many files requesters can attach and the per-file size cap. Changes take effect immediately.
              </p>
            </div>

            {attachmentSettingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings…
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-5 space-y-5 max-w-sm">
                {/* Max file size */}
                <div className="space-y-2">
                  <Label htmlFor="attach-max-size">Maximum file size per attachment (MB)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="attach-max-size"
                      type="number"
                      min={1}
                      max={50}
                      value={attachMaxFileSizeMb}
                      onChange={(e) =>
                        setAttachMaxFileSizeMb(
                          Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)),
                        )
                      }
                      className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">MB (1 – 50)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Files larger than this will be rejected at upload time.
                  </p>
                </div>

                {/* Max files per request */}
                <div className="space-y-2">
                  <Label htmlFor="attach-max-files">Maximum files per request</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="attach-max-files"
                      type="number"
                      min={1}
                      max={10}
                      value={attachMaxFiles}
                      onChange={(e) =>
                        setAttachMaxFiles(
                          Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)),
                        )
                      }
                      className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">files (1 – 10)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How many files a requester can attach to a single request.
                  </p>
                </div>

                <Button
                  type="button"
                  disabled={savingAttachmentSettings}
                  onClick={handleSaveAttachmentSettings}
                >
                  {savingAttachmentSettings ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}