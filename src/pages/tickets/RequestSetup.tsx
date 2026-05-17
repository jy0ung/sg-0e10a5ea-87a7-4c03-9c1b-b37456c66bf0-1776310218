import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Plus, Route, Save, Settings2, Trash2, X } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useRequestFormFields } from '@/hooks/useRequestFormFields';
import {
  createRequestCategory,
  deleteRequestCategory,
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
import {
  createRequestFormField,
  deleteRequestFormField,
  updateRequestFormField,
  type RequestFieldDataSource,
  type RequestFormFieldRecord,
  type RequestFormFieldType,
} from '@/services/requestFormFieldService';

interface CategoryDraft {
  label: string;
  description: string;
  response_sla_hours: number | null;
  resolution_sla_hours: number | null;
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
    || draft.response_sla_hours !== category.response_sla_hours
    || draft.resolution_sla_hours !== category.resolution_sla_hours
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

interface FormFieldDraft {
  label: string;
  field_type: RequestFormFieldType;
  data_source: RequestFieldDataSource | null;
  placeholder: string;
  help_text: string;
  is_required: boolean;
  is_active: boolean;
}

function hasFormFieldChanges(field: RequestFormFieldRecord, draft: FormFieldDraft | undefined) {
  if (!draft) return false;
  return draft.label !== field.label
    || draft.field_type !== field.field_type
    || draft.data_source !== field.data_source
    || draft.placeholder !== field.placeholder
    || draft.help_text !== field.help_text
    || draft.is_required !== field.is_required
    || draft.is_active !== field.is_active;
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

const ANY_SELECT_VALUE = '__any__';
const NONE_SELECT_VALUE = '__none__';

const FIELD_TYPE_OPTIONS: { value: RequestFormFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'database_select', label: 'Database dropdown' },
];

const DATA_SOURCE_OPTIONS: { value: RequestFieldDataSource; label: string }[] = [
  { value: 'branches', label: 'Branches' },
  { value: 'employees', label: 'Employees' },
  { value: 'vehicles', label: 'Vehicles' },
];

function selectValue(value: string | null | undefined) {
  return value || ANY_SELECT_VALUE;
}

function optionalSelectValue(value: string) {
  return value === ANY_SELECT_VALUE || value === NONE_SELECT_VALUE ? '' : value;
}

function parseSlaHours(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, parsed);
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
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
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

  // ── Form builder state ───────────────────────────────────────────────────
  const { fields: formFields, loading: formFieldsLoading, error: formFieldsError, reload: reloadFormFields } =
    useRequestFormFields(user?.company_id, { includeInactive: true });
  const [isAddingField, setIsAddingField] = useState(false);
  const [fieldCreateCategoryKey, setFieldCreateCategoryKey] = useState('');
  const [fieldCreateLabel, setFieldCreateLabel] = useState('');
  const [fieldCreateType, setFieldCreateType] = useState<RequestFormFieldType>('text');
  const [fieldCreateSource, setFieldCreateSource] = useState<RequestFieldDataSource>('branches');
  const [fieldCreatePlaceholder, setFieldCreatePlaceholder] = useState('');
  const [fieldCreateHelpText, setFieldCreateHelpText] = useState('');
  const [fieldCreateRequired, setFieldCreateRequired] = useState(false);
  const [creatingField, setCreatingField] = useState(false);
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FormFieldDraft>>({});
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
      response_sla_hours: category.response_sla_hours,
      resolution_sla_hours: category.resolution_sla_hours,
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

  useEffect(() => {
    setFieldDrafts(
      Object.fromEntries(
        formFields.map((field) => [
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
  }, [formFields]);

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

  const editCategory = useMemo(
    () => categories.find((c) => c.id === editCategoryId) ?? null,
    [categories, editCategoryId],
  );

  const activeTemplateCount = useMemo(
    () => templates.filter((t) => t.is_active).length,
    [templates],
  );

  const activeFormFieldCount = useMemo(
    () => formFields.filter((field) => field.is_active).length,
    [formFields],
  );

  const formFieldsByCategory = useMemo(
    () => formFields.reduce<Record<string, RequestFormFieldRecord[]>>((grouped, field) => {
      grouped[field.category_key] ??= [];
      grouped[field.category_key].push(field);
      return grouped;
    }, {}),
    [formFields],
  );

  const activeRoutingRuleCount = useMemo(
    () => routingRules.filter((rule) => rule.is_active).length,
    [routingRules],
  );

  const activeSubcategoriesForKey = useCallback(
    (categoryKey: string) =>
      subcategories.filter((s) => s.category_key === categoryKey && s.is_active),
    [subcategories],
  );

  const setupLoading = loading || subcategoriesLoading;
  const setupError = error ?? subcategoriesError;

  const editCatSubcategories = editCategory ? (subcategoriesByCategory[editCategory.key] ?? []) : [];
  const editCreateSubDraft = editCategory
    ? (createSubcategoryDrafts[editCategory.key] ?? { label: '', description: '' })
    : { label: '', description: '' };
  const editIsCreatingSub = editCategory ? creatingSubcategoryKey === editCategory.key : false;

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
        response_sla_hours: draft.response_sla_hours,
        resolution_sla_hours: draft.resolution_sla_hours,
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
      setEditCategoryId(null);
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

  const handleDeleteCategory = async () => {
    if (!user || !deleteCategoryId) return;

    setBusyCategoryId(deleteCategoryId);
    const result = await deleteRequestCategory(deleteCategoryId, {
      actorId: user.id,
      companyId: user.company_id,
    });
    setBusyCategoryId(null);
    setDeleteCategoryId(null);

    if (result.error) {
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

  // ── Form builder handlers ────────────────────────────────────────────────

  const resetFieldCreateForm = () => {
    setFieldCreateCategoryKey('');
    setFieldCreateLabel('');
    setFieldCreateType('text');
    setFieldCreateSource('branches');
    setFieldCreatePlaceholder('');
    setFieldCreateHelpText('');
    setFieldCreateRequired(false);
  };

  const updateFieldDraft = (field: RequestFormFieldRecord, patch: Partial<FormFieldDraft>) => {
    setFieldDrafts((current) => ({
      ...current,
      [field.id]: {
        label: field.label,
        field_type: field.field_type,
        data_source: field.data_source,
        placeholder: field.placeholder,
        help_text: field.help_text,
        is_required: field.is_required,
        is_active: field.is_active,
        ...current[field.id],
        ...patch,
      },
    }));
  };

  const handleCreateField = async () => {
    if (!user || !fieldCreateCategoryKey || !fieldCreateLabel.trim()) return;
    setCreatingField(true);
    const result = await createRequestFormField(
      {
        category_key: fieldCreateCategoryKey,
        label: fieldCreateLabel,
        field_type: fieldCreateType,
        data_source: fieldCreateType === 'database_select' ? fieldCreateSource : null,
        placeholder: fieldCreatePlaceholder,
        help_text: fieldCreateHelpText,
        is_required: fieldCreateRequired,
      },
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to create form field', { description: result.error });
    } else {
      toast.success('Form field created');
      setIsAddingField(false);
      resetFieldCreateForm();
      await reloadFormFields();
    }
    setCreatingField(false);
  };

  const handleSaveField = async (field: RequestFormFieldRecord) => {
    if (!user) return;
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
      { actorId: user.id, companyId: user.company_id },
    );
    if (result.error) {
      toast.error('Unable to save form field', { description: result.error });
    } else {
      toast.success('Form field saved');
      setExpandedFieldId(null);
      await reloadFormFields();
    }
    setBusyFieldId(null);
  };

  const handleDeleteField = async (field: RequestFormFieldRecord) => {
    if (!user) return;
    setBusyFieldId(field.id);
    const result = await deleteRequestFormField(field.id, {
      actorId: user.id,
      companyId: user.company_id,
    });
    if (result.error) {
      toast.error('Unable to delete form field', { description: result.error });
    } else {
      toast.success('Form field deleted', { description: `"${field.label}" has been removed.` });
      setExpandedFieldId(null);
      await reloadFormFields();
    }
    setBusyFieldId(null);
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
    <div className="w-full space-y-4">
      <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Internal Requests</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Request Operations Setup</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
            Shape the requester experience, routing logic, templates, and attachment controls from one workspace.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-center sm:w-auto sm:min-w-[460px] sm:grid-cols-4">
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-lg font-semibold tabular-nums text-foreground">{activeCategoryCount}</p>
            <p className="text-[11px] text-muted-foreground">Categories</p>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-lg font-semibold tabular-nums text-foreground">{activeTemplateCount}</p>
            <p className="text-[11px] text-muted-foreground">Templates</p>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-lg font-semibold tabular-nums text-foreground">{activeFormFieldCount}</p>
            <p className="text-[11px] text-muted-foreground">Fields</p>
          </div>
          <div className="rounded-lg border bg-background px-3 py-2">
            <p className="text-lg font-semibold tabular-nums text-foreground">{activeRoutingRuleCount}</p>
            <p className="text-[11px] text-muted-foreground">Rules</p>
          </div>
        </div>
      </div>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>Request Customization</CardTitle>
          <CardDescription>
            Manage categories, subcategories, and templates from one canvas. Changes take effect immediately for new requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <Tabs defaultValue="categories">
            <div className="mb-4 overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-max rounded-lg border bg-card p-1 shadow-sm">
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
              <TabsTrigger value="forms">
                Form Builder
                {activeFormFieldCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                    {activeFormFieldCount}
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
                {activeRoutingRuleCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                    {activeRoutingRuleCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            </div>

            <TabsContent value="categories" className="space-y-4">
          {/* Create category dialog */}
          <Dialog open={isAddingCategory} onOpenChange={(open) => {
            if (!open && !creating) { setIsAddingCategory(false); setCreateLabel(''); setCreateDescription(''); }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New category</DialogTitle>
                <DialogDescription>Add a new request category for your team.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="request-category-name">Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="request-category-name"
                    placeholder="e.g. Procurement Support"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
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
                    onChange={(e) => setCreateDescription(e.target.value)}
                    rows={3}
                    disabled={creating}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setIsAddingCategory(false); setCreateLabel(''); setCreateDescription(''); }}
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
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit category dialog */}
          <Dialog open={editCategoryId !== null} onOpenChange={(open) => {
            if (!open && !busyCategoryId) setEditCategoryId(null);
          }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit category</DialogTitle>
                <DialogDescription>Update this category's details, SLA targets, and subcategories.</DialogDescription>
              </DialogHeader>
              {editCategory && (
                <div className="max-h-[68vh] space-y-4 overflow-y-auto py-2 pr-1">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={drafts[editCategory.id]?.label ?? ''}
                        onChange={(e) => updateCategoryDraft(editCategory, { label: e.target.value })}
                        disabled={busyCategoryId === editCategory.id}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={drafts[editCategory.id]?.description ?? ''}
                        onChange={(e) => updateCategoryDraft(editCategory, { description: e.target.value })}
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
                        onChange={(e) => updateCategoryDraft(editCategory, { response_sla_hours: parseSlaHours(e.target.value) })}
                        disabled={busyCategoryId === editCategory.id}
                      />
                      <p className="text-xs text-muted-foreground">Leave blank when this category has no response target.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`edit-cat-resolution-sla-${editCategory.id}`}>Resolution SLA (hours)</Label>
                      <Input
                        id={`edit-cat-resolution-sla-${editCategory.id}`}
                        type="number"
                        min={1}
                        max={2160}
                        value={drafts[editCategory.id]?.resolution_sla_hours ?? ''}
                        onChange={(e) => updateCategoryDraft(editCategory, { resolution_sla_hours: parseSlaHours(e.target.value) })}
                        disabled={busyCategoryId === editCategory.id}
                      />
                      <p className="text-xs text-muted-foreground">New requests copy this target when they are submitted.</p>
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
                  <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-secondary/10 p-4">
                    <p className="text-sm font-semibold text-foreground">Subcategories</p>
                    <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input
                          placeholder="e.g. Stock Transfer"
                          value={editCreateSubDraft.label}
                          onChange={(e) => updateCreateSubcategoryDraft(editCategory.key, { label: e.target.value })}
                          disabled={editIsCreatingSub}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Description</Label>
                        <Input
                          placeholder="Optional"
                          value={editCreateSubDraft.description}
                          onChange={(e) => updateCreateSubcategoryDraft(editCategory.key, { description: e.target.value })}
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
                      <div className="space-y-1.5">
                        {editCatSubcategories.map((sub, subIdx) => {
                          const subDraft = subcategoryDrafts[sub.id];
                          const isSubBusy = busySubcategoryId === sub.id;
                          const isSubDirty = hasSubcategoryChanges(sub, subDraft);
                          return (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2.5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                                <Input
                                  className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                  value={subDraft?.label ?? sub.label}
                                  onChange={(e) => updateSubcategoryDraft(sub, { label: e.target.value })}
                                  disabled={isSubBusy}
                                />
                                {!sub.is_active && (
                                  <Badge variant="outline" className="shrink-0 text-xs">Archived</Badge>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => void handleMoveSubcategory(sub.id, 'up')}
                                  disabled={isSubBusy || subIdx === 0}
                                  aria-label="Move up"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => void handleMoveSubcategory(sub.id, 'down')}
                                  disabled={isSubBusy || subIdx === editCatSubcategories.length - 1}
                                  aria-label="Move down"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
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
                                {isSubBusy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <DialogFooter>
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
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {setupLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading request setup...</span>
            </div>
          ) : setupError ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border py-12 text-center">
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
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-sm text-muted-foreground">No categories yet. Add one to get started.</p>
              <Button
                type="button"
                onClick={() => setIsAddingCategory(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </Button>
            </div>
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
                  onClick={() => setIsAddingCategory(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Category
                </Button>
              </div>
              <div className="divide-y divide-border rounded-lg border">
                {categories.map((category, index) => {
                  const catSubcategories = subcategoriesByCategory[category.key] ?? [];
                  const isBusy = busyCategoryId === category.id;
                  return (
                    <div key={category.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{category.label}</span>
                          {!category.is_active && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Archived</Badge>
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
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => void handleMove(category.id, 'up')}
                          disabled={isBusy || index === 0}
                          aria-label={`Move ${category.label} up`}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => void handleMove(category.id, 'down')}
                          disabled={isBusy || index === categories.length - 1}
                          aria-label={`Move ${category.label} down`}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        {isBusy ? (
                          <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditCategoryId(category.id)}
                              className="ml-1"
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
                })}
              </div>
            </div>
          )}

          {/* Delete category confirmation dialog */}
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
          </TabsContent>

          {/* ── Templates tab ─────────────────────────────────────────── */}
          <TabsContent value="templates" className="space-y-4">
            {/* Create template form */}
            {isAddingTemplate && (
              <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
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
                      value={templateCreateSubcategoryKey || NONE_SELECT_VALUE}
                      onValueChange={(value) => setTemplateCreateSubcategoryKey(optionalSelectValue(value))}
                      disabled={creatingTemplate || !templateCreateCategoryKey || activeSubcategoriesForKey(templateCreateCategoryKey).length === 0}
                    >
                      <SelectTrigger id="template-create-subcategory">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
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
              !isAddingTemplate ? (
                <div className="flex items-center justify-center py-16">
                  <Button
                    type="button"
                    onClick={() => setIsAddingTemplate(true)}
                    className="gap-2"
                  >
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
                                value={draft.subcategory_key || NONE_SELECT_VALUE}
                                onValueChange={(value) => updateTemplateDraft(template, { subcategory_key: optionalSelectValue(value) })}
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

          {/* ── Form builder tab ──────────────────────────────────────────── */}
          <TabsContent value="forms" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Custom Request Fields</p>
                <p className="text-sm text-muted-foreground">
                  Add per-category fields requesters must complete before submission.
                </p>
              </div>
              {!isAddingField && (
                <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingField(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Field
                </Button>
              )}
            </div>

            {isAddingField && (
              <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">New custom field</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => { setIsAddingField(false); resetFieldCreateForm(); }}
                    disabled={creatingField}
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="field-create-category">Category <span className="text-destructive">*</span></Label>
                    <Select value={fieldCreateCategoryKey} onValueChange={setFieldCreateCategoryKey} disabled={creatingField}>
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
                      value={fieldCreateLabel}
                      onChange={(event) => setFieldCreateLabel(event.target.value)}
                      disabled={creatingField}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="field-create-type">Type</Label>
                    <Select value={fieldCreateType} onValueChange={(value) => setFieldCreateType(value as RequestFormFieldType)} disabled={creatingField}>
                      <SelectTrigger id="field-create-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {fieldCreateType === 'database_select' && (
                  <div className="space-y-2 max-w-xs">
                    <Label htmlFor="field-create-source">Database source</Label>
                    <Select value={fieldCreateSource} onValueChange={(value) => setFieldCreateSource(value as RequestFieldDataSource)} disabled={creatingField}>
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
                      value={fieldCreatePlaceholder}
                      onChange={(event) => setFieldCreatePlaceholder(event.target.value)}
                      disabled={creatingField}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="field-create-help">Help text</Label>
                    <Input
                      id="field-create-help"
                      value={fieldCreateHelpText}
                      onChange={(event) => setFieldCreateHelpText(event.target.value)}
                      disabled={creatingField}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Required before submit</p>
                    <p className="text-xs text-muted-foreground">Requesters cannot submit until this field has a value.</p>
                  </div>
                  <Switch checked={fieldCreateRequired} onCheckedChange={setFieldCreateRequired} disabled={creatingField} />
                </div>

                <Button
                  type="button"
                  onClick={() => void handleCreateField()}
                  disabled={creatingField || !fieldCreateCategoryKey || !fieldCreateLabel.trim()}
                  className="gap-2"
                >
                  {creatingField ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add field
                </Button>
              </div>
            )}

            {formFieldsLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-border py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading form fields...</span>
              </div>
            ) : formFieldsError ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border py-12 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Unable to load form fields</p>
                  <p className="text-sm text-muted-foreground">{formFieldsError}</p>
                </div>
                <Button variant="outline" onClick={() => void reloadFormFields()}>Retry</Button>
              </div>
            ) : formFields.length === 0 ? (
              !isAddingField ? (
                <div className="flex items-center justify-center py-16">
                  <Button type="button" onClick={() => setIsAddingField(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Field
                  </Button>
                </div>
              ) : null
            ) : (
              <div className="space-y-5">
                {categories.map((category) => {
                  const categoryFields = formFieldsByCategory[category.key] ?? [];
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
                          <div key={field.id} className="rounded-xl border border-border bg-background p-4 space-y-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-semibold text-foreground">{field.label}</p>
                                  <Badge variant={field.is_active ? 'secondary' : 'outline'}>
                                    {field.is_active ? 'Active' : 'Archived'}
                                  </Badge>
                                  <Badge variant="outline">{FIELD_TYPE_OPTIONS.find((option) => option.value === field.field_type)?.label ?? field.field_type}</Badge>
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
                                  onClick={() => void handleDeleteField(field)}
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
                                      onChange={(event) => updateFieldDraft(field, { label: event.target.value })}
                                      disabled={isBusy}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`field-type-${field.id}`}>Type</Label>
                                    <Select
                                      value={draft.field_type}
                                      onValueChange={(value) => updateFieldDraft(field, { field_type: value as RequestFormFieldType })}
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
                                        onValueChange={(value) => updateFieldDraft(field, { data_source: value as RequestFieldDataSource })}
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
                                      onChange={(event) => updateFieldDraft(field, { placeholder: event.target.value })}
                                      disabled={isBusy}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor={`field-help-${field.id}`}>Help text</Label>
                                    <Input
                                      id={`field-help-${field.id}`}
                                      value={draft.help_text}
                                      onChange={(event) => updateFieldDraft(field, { help_text: event.target.value })}
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
                                    <Switch checked={draft.is_required} onCheckedChange={(checked) => updateFieldDraft(field, { is_required: checked })} disabled={isBusy} />
                                  </div>
                                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                                    <div>
                                      <p className="text-sm font-medium text-foreground">Available</p>
                                      <p className="text-xs text-muted-foreground">Hide without deleting historical values.</p>
                                    </div>
                                    <Switch checked={draft.is_active} onCheckedChange={(checked) => updateFieldDraft(field, { is_active: checked })} disabled={isBusy} />
                                  </div>
                                </div>

                                <Button type="button" onClick={() => void handleSaveField(field)} disabled={isBusy || !isDirty} className="gap-2">
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
          </TabsContent>

          {/* ── Routing tab ──────────────────────────────────────────────── */}
          <TabsContent value="routing" className="space-y-4">
            {/* Create rule form */}
            {isAddingRule && (
              <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 p-4 space-y-4">
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
                      value={selectValue(ruleCreateCategory)}
                      onValueChange={(value) => { setRuleCreateCategory(optionalSelectValue(value)); setRuleCreateSubcategory(''); }}
                      disabled={creatingRule}
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
                      value={selectValue(ruleCreateSubcategory)}
                      onValueChange={(value) => setRuleCreateSubcategory(optionalSelectValue(value))}
                      disabled={creatingRule || !ruleCreateCategory}
                    >
                      <SelectTrigger id="rule-create-subcategory">
                        <SelectValue placeholder="Any subcategory" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ANY_SELECT_VALUE}>Any subcategory</SelectItem>
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
                      value={selectValue(ruleCreateRole)}
                      onValueChange={(value) => setRuleCreateRole(optionalSelectValue(value))}
                      disabled={creatingRule}
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
                      value={selectValue(ruleCreatePriority)}
                      onValueChange={(value) => setRuleCreatePriority(optionalSelectValue(value))}
                      disabled={creatingRule}
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
              !isAddingRule ? (
                <div className="flex items-center justify-center py-16">
                  <Button
                    type="button"
                    onClick={() => setIsAddingRule(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Rule
                  </Button>
                </div>
              ) : null
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline">
                    {routingRules.length} {routingRules.length === 1 ? 'rule' : 'rules'} ·{' '}
                    {routingRules.filter((r) => r.is_active).length} active
                  </Badge>
                  {!isAddingRule && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddingRule(true)}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Rule
                    </Button>
                  )}
                </div>

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
                                value={selectValue(draft.match_category)}
                                onValueChange={(value) => updateRuleDraft(rule, { match_category: optionalSelectValue(value), match_subcategory: '' })}
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
                                onValueChange={(value) => updateRuleDraft(rule, { match_subcategory: optionalSelectValue(value) })}
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
                                onValueChange={(value) => updateRuleDraft(rule, { match_submitter_role: optionalSelectValue(value) })}
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
                                onValueChange={(value) => updateRuleDraft(rule, { match_priority: optionalSelectValue(value) })}
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
          <TabsContent value="settings" className="space-y-4">
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
              <div className="rounded-lg border border-border bg-card p-4 space-y-4 max-w-lg shadow-sm">
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