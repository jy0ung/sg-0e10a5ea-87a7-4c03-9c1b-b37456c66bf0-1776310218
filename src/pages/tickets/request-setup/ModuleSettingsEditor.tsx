import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { STALE } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getRequestModuleSettings,
  updateRequestModuleSettings,
  type RequestModuleSettings,
} from '@/services/requestModuleSettingsService';

interface Props {
  companyId: string;
  actorId: string;
}

const JSON_HELP: Record<string, string> = {
  status_labels: 'Maps status keys to display names. Example: {"open": "New", "in_progress": "Working"}',
  notification_templates: 'Message templates with {subject}, {status} placeholders. Example: {"ticket_created": "New request: {subject}"}',
  closure_rules: 'Controls closure behaviour. Example: {"require_satisfaction": true, "auto_close_days": 7}',
  priority_matrix: 'Priority defaults and escalation hours. Example: {"default": "medium", "urgent_hours": 2}',
  role_permissions: 'Role-based action grants. Example: {"can_reassign": ["super_admin"], "can_close": ["super_admin", "portal_manager"]}',
};

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function validateJsonObject(value: string, label: string): { ok: boolean; error?: string } {
  if (!value.trim()) return { ok: true };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `${label} must be a plain JSON object.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `${label} contains invalid JSON.` };
  }
}

function validateStringRecord(value: string, label: string): { ok: boolean; error?: string } {
  if (!value.trim()) return { ok: true };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `${label} must be a JSON object.` };
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string') {
        return { ok: false, error: `${label}["${k}"] must be a string, got ${typeof v}.` };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `${label} contains invalid JSON.` };
  }
}

export function ModuleSettingsEditor({ companyId, actorId }: Props) {
  const queryClient = useQueryClient();
  const settingsKey = ['request-module-settings', companyId] as const;
  const { data: settings, isLoading } = useQuery({
    queryKey: settingsKey,
    queryFn: () => getRequestModuleSettings(companyId),
    staleTime: STALE.reference,
  });

  const [placeholder, setPlaceholder] = useState('Customer Name');
  const [fallbackQueue, setFallbackQueue] = useState('Unassigned');
  const [slaThreshold, setSlaThreshold] = useState(4);
  const [reopenWindow, setReopenWindow] = useState(14);
  const [chatMaxFiles, setChatMaxFiles] = useState(5);
  const [allowedTypes, setAllowedTypes] = useState('');
  const [statusLabels, setStatusLabels] = useState('{}');
  const [notificationTemplates, setNotificationTemplates] = useState('{}');
  const [closureRules, setClosureRules] = useState('{}');
  const [priorityMatrix, setPriorityMatrix] = useState('{}');
  const [rolePermissions, setRolePermissions] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!settings) return;
    setPlaceholder(settings.request_title_placeholder);
    setFallbackQueue(settings.default_fallback_queue);
    setSlaThreshold(settings.sla_at_risk_threshold_hours);
    setReopenWindow(settings.reopen_window_days);
    setChatMaxFiles(settings.chat_attachment_max_files);
    setAllowedTypes(settings.allowed_file_types.join('\n'));
    setStatusLabels(pretty(settings.status_labels));
    setNotificationTemplates(pretty(settings.notification_templates));
    setClosureRules(pretty(settings.closure_rules));
    setPriorityMatrix(pretty(settings.priority_matrix));
    setRolePermissions(pretty(settings.role_permissions));
    setJsonErrors({});
  }, [settings]);

  const handleJsonChange = (key: string, value: string, validator: (v: string, l: string) => { ok: boolean; error?: string }, label: string) => {
    switch (key) {
      case 'status_labels': setStatusLabels(value); break;
      case 'notification_templates': setNotificationTemplates(value); break;
      case 'closure_rules': setClosureRules(value); break;
      case 'priority_matrix': setPriorityMatrix(value); break;
      case 'role_permissions': setRolePermissions(value); break;
    }
    const result = validator(value, label);
    setJsonErrors((prev) => ({ ...prev, [key]: result.ok ? null : result.error ?? null }));
  };

  const handleResetJson = (key: string) => {
    handleJsonChange(key, '{}', validateJsonObject, key);
  };

  const hasJsonErrors = useMemo(() => Object.values(jsonErrors).some((e) => e !== null), [jsonErrors]);

  const handleSave = async () => {
    // Validate all JSON fields before saving
    const validations: [string, string, (v: string, l: string) => { ok: boolean; error?: string }][] = [
      ['status_labels', statusLabels, validateStringRecord],
      ['notification_templates', notificationTemplates, validateStringRecord],
      ['closure_rules', closureRules, validateJsonObject],
      ['priority_matrix', priorityMatrix, validateJsonObject],
      ['role_permissions', rolePermissions, validateJsonObject],
    ];
    const errors: Record<string, string | null> = {};
    let hasError = false;
    for (const [key, value, validator] of validations) {
      const result = validator(value, key.replace(/_/g, ' '));
      errors[key] = result.ok ? null : result.error ?? null;
      if (!result.ok) hasError = true;
    }
    setJsonErrors(errors);
    if (hasError) {
      toast.error('Fix JSON errors before saving.');
      return;
    }

    const parseObj = (v: string) => (v.trim() ? JSON.parse(v) : {});

    setSaving(true);
    const result = await updateRequestModuleSettings(companyId, actorId, {
      request_title_placeholder: placeholder.trim() || 'Customer Name',
      default_fallback_queue: fallbackQueue.trim() || 'Unassigned',
      sla_at_risk_threshold_hours: slaThreshold,
      reopen_window_days: reopenWindow,
      chat_attachment_max_files: chatMaxFiles,
      allowed_file_types: allowedTypes.split('\n').map((v) => v.trim()).filter(Boolean),
      status_labels: parseObj(statusLabels) as RequestModuleSettings['status_labels'],
      notification_templates: parseObj(notificationTemplates) as RequestModuleSettings['notification_templates'],
      closure_rules: parseObj(closureRules),
      priority_matrix: parseObj(priorityMatrix),
      role_permissions: parseObj(rolePermissions),
    });
    setSaving(false);
    if (result.error) {
      toast.error('Failed to save module settings', { description: result.error });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: settingsKey });
    toast.success('Module settings saved');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading module settings...
      </div>
    );
  }

  const jsonFields: { key: string; label: string; value: string; setter: (v: string) => void; validator: (v: string, l: string) => { ok: boolean; error?: string }; rows?: number }[] = [
    { key: 'status_labels', label: 'Status labels', value: statusLabels, setter: (v) => handleJsonChange('status_labels', v, validateStringRecord, 'Status labels'), validator: validateStringRecord },
    { key: 'notification_templates', label: 'Notification templates', value: notificationTemplates, setter: (v) => handleJsonChange('notification_templates', v, validateStringRecord, 'Notification templates'), validator: validateStringRecord },
    { key: 'closure_rules', label: 'Closure rules', value: closureRules, setter: (v) => handleJsonChange('closure_rules', v, validateJsonObject, 'Closure rules'), validator: validateJsonObject },
    { key: 'priority_matrix', label: 'Priority matrix', value: priorityMatrix, setter: (v) => handleJsonChange('priority_matrix', v, validateJsonObject, 'Priority matrix'), validator: validateJsonObject },
    { key: 'role_permissions', label: 'Role permissions', value: rolePermissions, setter: (v) => handleJsonChange('role_permissions', v, validateJsonObject, 'Role permissions'), validator: validateJsonObject, rows: 5 },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Module Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="request-title-placeholder">Request title placeholder</Label>
            <Input id="request-title-placeholder" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fallback-queue">Default fallback queue</Label>
            <Input id="fallback-queue" value={fallbackQueue} onChange={(e) => setFallbackQueue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sla-at-risk">SLA at-risk threshold hours</Label>
            <Input id="sla-at-risk" type="number" min={1} max={168} value={slaThreshold} onChange={(e) => setSlaThreshold(Number(e.target.value) || 1)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reopen-window">Reopen window days</Label>
            <Input id="reopen-window" type="number" min={0} max={365} value={reopenWindow} onChange={(e) => setReopenWindow(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chat-max-files">Chat attachment limit</Label>
            <Input id="chat-max-files" type="number" min={1} max={10} value={chatMaxFiles} onChange={(e) => setChatMaxFiles(Number(e.target.value) || 1)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowed-file-types">Allowed file types</Label>
            <Textarea id="allowed-file-types" value={allowedTypes} onChange={(e) => setAllowedTypes(e.target.value)} rows={4} placeholder="application/pdf&#10;image/png" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {jsonFields.map((field) => (
            <div key={field.key} className={`space-y-2 ${field.key === 'role_permissions' ? 'lg:col-span-2' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleResetJson(field.key)}>
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{JSON_HELP[field.key]}</p>
              <Textarea
                id={field.key}
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                rows={field.rows ?? 7}
                className={`font-mono text-xs ${jsonErrors[field.key] ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {jsonErrors[field.key] && (
                <p className="text-xs text-destructive">{jsonErrors[field.key]}</p>
              )}
            </div>
          ))}
        </div>

        <Button type="button" onClick={() => void handleSave()} disabled={saving || hasJsonErrors}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save module settings
        </Button>
      </CardContent>
    </Card>
  );
}
