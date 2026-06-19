import { supabase } from '@/integrations/supabase/client';
import { logUserAction } from './auditService';
import { loggingService } from './loggingService';

export interface RequestModuleSettings {
  request_title_placeholder: string;
  sla_at_risk_threshold_hours: number;
  pause_sla_on_pending_requester: boolean;
  sla_start_event: 'submitted' | 'assigned';
  default_fallback_queue: string;
  reopen_window_days: number;
  chat_attachment_max_files: number;
  status_labels: Record<string, string>;
  notification_templates: Record<string, string>;
  closure_rules: Record<string, unknown>;
  priority_matrix: Record<string, unknown>;
  role_permissions: Record<string, unknown>;
  allowed_file_types: string[];
}

const DEFAULT_REQUEST_MODULE_SETTINGS: RequestModuleSettings = {
  request_title_placeholder: 'Customer Name',
  sla_at_risk_threshold_hours: 4,
  pause_sla_on_pending_requester: true,
  sla_start_event: 'submitted',
  default_fallback_queue: 'Unassigned',
  reopen_window_days: 14,
  chat_attachment_max_files: 5,
  status_labels: {},
  notification_templates: {},
  closure_rules: {},
  priority_matrix: {},
  role_permissions: {},
  allowed_file_types: [],
};

type SettingsPayload = Partial<RequestModuleSettings>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).filter(([, entry]) => typeof entry === 'string'),
  ) as Record<string, string>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function getRequestModuleSettings(companyId: string): Promise<RequestModuleSettings> {
  try {
    const { data, error } = await (supabase as never as { from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: Partial<RequestModuleSettings> | null; error: { message: string } | null }> };
      };
    } })
      .from('request_module_settings')
      .select('request_title_placeholder, sla_at_risk_threshold_hours, pause_sla_on_pending_requester, sla_start_event, default_fallback_queue, reopen_window_days, chat_attachment_max_files, status_labels, notification_templates, closure_rules, priority_matrix, role_permissions, allowed_file_types')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      if (error.message.includes('request_module_settings')) return DEFAULT_REQUEST_MODULE_SETTINGS;
      throw error;
    }

    if (!data) return DEFAULT_REQUEST_MODULE_SETTINGS;

    return {
      request_title_placeholder: data.request_title_placeholder || DEFAULT_REQUEST_MODULE_SETTINGS.request_title_placeholder,
      sla_at_risk_threshold_hours: Number(data.sla_at_risk_threshold_hours ?? DEFAULT_REQUEST_MODULE_SETTINGS.sla_at_risk_threshold_hours),
      pause_sla_on_pending_requester: Boolean(data.pause_sla_on_pending_requester ?? DEFAULT_REQUEST_MODULE_SETTINGS.pause_sla_on_pending_requester),
      sla_start_event: data.sla_start_event === 'assigned' ? 'assigned' : 'submitted',
      default_fallback_queue: data.default_fallback_queue || DEFAULT_REQUEST_MODULE_SETTINGS.default_fallback_queue,
      reopen_window_days: Number(data.reopen_window_days ?? DEFAULT_REQUEST_MODULE_SETTINGS.reopen_window_days),
      chat_attachment_max_files: Number(data.chat_attachment_max_files ?? DEFAULT_REQUEST_MODULE_SETTINGS.chat_attachment_max_files),
      status_labels: asStringRecord(data.status_labels),
      notification_templates: asStringRecord(data.notification_templates),
      closure_rules: asRecord(data.closure_rules),
      priority_matrix: asRecord(data.priority_matrix),
      role_permissions: asRecord(data.role_permissions),
      allowed_file_types: asStringArray(data.allowed_file_types),
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to load request module settings');
    loggingService.error('Failed to load request module settings', { error: error.message }, 'RequestModuleSettingsService');
    return DEFAULT_REQUEST_MODULE_SETTINGS;
  }
}

export async function updateRequestModuleSettings(
  companyId: string,
  actorId: string,
  payload: SettingsPayload,
): Promise<{ data: RequestModuleSettings | null; error: string | null }> {
  try {
    const updatePayload = {
      company_id: companyId,
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase as never as { from: (table: string) => {
      upsert: (values: typeof updatePayload, options: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    } })
      .from('request_module_settings')
      .upsert(updatePayload, { onConflict: 'company_id' });
    if (error) throw error;

    void logUserAction(actorId, 'update', 'request_module_settings', companyId, {
      component: 'RequestModuleSettingsService',
      keys: Object.keys(payload),
    });

    return { data: await getRequestModuleSettings(companyId), error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to save request module settings');
    loggingService.error('Failed to update request module settings', { error: error.message }, 'RequestModuleSettingsService');
    return { data: null, error: error.message };
  }
}
