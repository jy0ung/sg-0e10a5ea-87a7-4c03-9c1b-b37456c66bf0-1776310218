import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
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

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> | null {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.error(`${label} must be a JSON object.`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    toast.error(`${label} is not valid JSON.`);
    return null;
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
  }, [settings]);

  const handleSave = async () => {
    const parsedStatusLabels = parseJsonObject(statusLabels, 'Status labels');
    const parsedNotificationTemplates = parseJsonObject(notificationTemplates, 'Notification templates');
    const parsedClosureRules = parseJsonObject(closureRules, 'Closure rules');
    const parsedPriorityMatrix = parseJsonObject(priorityMatrix, 'Priority matrix');
    const parsedRolePermissions = parseJsonObject(rolePermissions, 'Role permissions');
    if (!parsedStatusLabels || !parsedNotificationTemplates || !parsedClosureRules || !parsedPriorityMatrix || !parsedRolePermissions) return;

    setSaving(true);
    const result = await updateRequestModuleSettings(companyId, actorId, {
      request_title_placeholder: placeholder.trim() || 'Customer Name',
      default_fallback_queue: fallbackQueue.trim() || 'Unassigned',
      sla_at_risk_threshold_hours: slaThreshold,
      reopen_window_days: reopenWindow,
      chat_attachment_max_files: chatMaxFiles,
      allowed_file_types: allowedTypes.split('\n').map((value) => value.trim()).filter(Boolean),
      status_labels: parsedStatusLabels as RequestModuleSettings['status_labels'],
      notification_templates: parsedNotificationTemplates as RequestModuleSettings['notification_templates'],
      closure_rules: parsedClosureRules,
      priority_matrix: parsedPriorityMatrix,
      role_permissions: parsedRolePermissions,
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

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Module Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="request-title-placeholder">Request title placeholder</Label>
            <Input id="request-title-placeholder" value={placeholder} onChange={(event) => setPlaceholder(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fallback-queue">Default fallback queue</Label>
            <Input id="fallback-queue" value={fallbackQueue} onChange={(event) => setFallbackQueue(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sla-at-risk">SLA at-risk threshold hours</Label>
            <Input id="sla-at-risk" type="number" min={1} max={168} value={slaThreshold} onChange={(event) => setSlaThreshold(Number(event.target.value) || 1)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reopen-window">Reopen window days</Label>
            <Input id="reopen-window" type="number" min={0} max={365} value={reopenWindow} onChange={(event) => setReopenWindow(Number(event.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chat-max-files">Chat attachment limit</Label>
            <Input id="chat-max-files" type="number" min={1} max={10} value={chatMaxFiles} onChange={(event) => setChatMaxFiles(Number(event.target.value) || 1)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowed-file-types">Allowed file types</Label>
            <Textarea id="allowed-file-types" value={allowedTypes} onChange={(event) => setAllowedTypes(event.target.value)} rows={4} placeholder="application/pdf&#10;image/png" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="status-labels">Status labels JSON</Label>
            <Textarea id="status-labels" value={statusLabels} onChange={(event) => setStatusLabels(event.target.value)} rows={7} className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notification-templates">Notification templates JSON</Label>
            <Textarea id="notification-templates" value={notificationTemplates} onChange={(event) => setNotificationTemplates(event.target.value)} rows={7} className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closure-rules">Closure rules JSON</Label>
            <Textarea id="closure-rules" value={closureRules} onChange={(event) => setClosureRules(event.target.value)} rows={7} className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority-matrix">Priority matrix JSON</Label>
            <Textarea id="priority-matrix" value={priorityMatrix} onChange={(event) => setPriorityMatrix(event.target.value)} rows={7} className="font-mono text-xs" />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="role-permissions">Role permissions JSON</Label>
            <Textarea id="role-permissions" value={rolePermissions} onChange={(event) => setRolePermissions(event.target.value)} rows={7} className="font-mono text-xs" />
          </div>
        </div>

        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save module settings
        </Button>
      </CardContent>
    </Card>
  );
}
