import type { Json } from '@flc/supabase';
import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

export interface WebhookEndpoint {
  id:                  string;
  companyId:           string;
  name:                string;
  url:                 string;
  eventTypes:          string[];
  active:              boolean;
  lastSuccessAt:       string | null;
  lastFailureAt:       string | null;
  consecutiveFailures: number;
  createdAt:           string;
  updatedAt:           string;
}

export type WebhookDeliveryStatus = 'pending' | 'delivering' | 'delivered' | 'failed' | 'dead';

export interface WebhookDelivery {
  id:                 string;
  endpointId:         string;
  companyId:          string;
  eventType:          string;
  payload:            Record<string, unknown>;
  status:             WebhookDeliveryStatus;
  attempts:           number;
  lastError:          string | null;
  lastResponseStatus: number | null;
  nextRetryAt:        string;
  deliveredAt:        string | null;
  createdAt:          string;
  updatedAt:          string;
}

function mapEndpoint(row: Record<string, unknown>): WebhookEndpoint {
  return {
    id:                  String(row.id ?? ''),
    companyId:           String(row.company_id ?? ''),
    name:                String(row.name ?? ''),
    url:                 String(row.url ?? ''),
    eventTypes:          Array.isArray(row.event_types) ? (row.event_types as string[]) : [],
    active:              Boolean(row.active),
    lastSuccessAt:       row.last_success_at == null ? null : String(row.last_success_at),
    lastFailureAt:       row.last_failure_at == null ? null : String(row.last_failure_at),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    createdAt:           String(row.created_at ?? ''),
    updatedAt:           String(row.updated_at ?? ''),
  };
}

function mapDelivery(row: Record<string, unknown>): WebhookDelivery {
  return {
    id:                 String(row.id ?? ''),
    endpointId:         String(row.endpoint_id ?? ''),
    companyId:          String(row.company_id ?? ''),
    eventType:          String(row.event_type ?? ''),
    payload:            (row.payload as Record<string, unknown>) ?? {},
    status:             (row.status as WebhookDeliveryStatus) ?? 'pending',
    attempts:           Number(row.attempts ?? 0),
    lastError:          row.last_error == null ? null : String(row.last_error),
    lastResponseStatus: row.last_response_status == null ? null : Number(row.last_response_status),
    nextRetryAt:        String(row.next_retry_at ?? ''),
    deliveredAt:        row.delivered_at == null ? null : String(row.delivered_at),
    createdAt:          String(row.created_at ?? ''),
    updatedAt:          String(row.updated_at ?? ''),
  };
}

/** Admin: list endpoints for a company. */
export async function listWebhookEndpoints(
  companyId: string,
): Promise<{ data: WebhookEndpoint[]; error: Error | null }> {
  const { data, error } = await supabase
    .rpc('list_webhook_endpoints', { p_company_id: companyId });
  if (error) {
    loggingService.error('listWebhookEndpoints failed', { companyId, error }, 'webhookOutboxService');
    return { data: [], error: new Error(error.message) };
  }
  return { data: ((data ?? []) as Record<string, unknown>[]).map(mapEndpoint), error: null };
}

/** Admin: create an endpoint. The signing key is returned once. */
export async function createWebhookEndpoint(args: {
  companyId:  string;
  name:       string;
  url:        string;
  eventTypes: string[];
  active:     boolean;
}): Promise<{ id: string | null; secret: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_webhook_endpoint', {
    p_company_id:  args.companyId,
    p_name:        args.name,
    p_url:         args.url,
    p_event_types: args.eventTypes,
    p_active:      args.active,
  });
  if (error) {
    loggingService.error('createWebhookEndpoint failed', { companyId: args.companyId, error }, 'webhookOutboxService');
    return { id: null, secret: null, error: new Error(error.message) };
  }
  const created = data as { id?: string; secret?: string } | null;
  return { id: created?.id ?? null, secret: created?.secret ?? null, error: null };
}

/** Admin: edit endpoint metadata without reading or replacing the key. */
export async function updateWebhookEndpoint(args: {
  id: string;
  companyId: string;
  name: string;
  url: string;
  eventTypes: string[];
  active: boolean;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('update_webhook_endpoint', {
    p_id: args.id,
    p_company_id: args.companyId,
    p_name: args.name,
    p_url: args.url,
    p_event_types: args.eventTypes,
    p_active: args.active,
  });
  if (error) {
    loggingService.error('updateWebhookEndpoint failed', { endpointId: args.id, error }, 'webhookOutboxService');
  }
  return { error: error ? new Error(error.message) : null };
}

/** Admin: rotate the key. The new plaintext is returned for one-time reveal. */
export async function rotateWebhookEndpointSecret(
  endpointId: string,
): Promise<{ secret: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('rotate_webhook_endpoint_secret', { p_id: endpointId });
  if (error) {
    loggingService.error('rotateWebhookEndpointSecret failed', { endpointId, error }, 'webhookOutboxService');
  }
  return { secret: error ? null : data as string, error: error ? new Error(error.message) : null };
}

/** Admin: list recent deliveries for a company, newest first. */
export async function listWebhookDeliveries(
  companyId: string,
  limit = 50,
): Promise<{ data: WebhookDelivery[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('webhook_outbox')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    loggingService.error('listWebhookDeliveries failed', { companyId, error }, 'webhookOutboxService');
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data ?? []).map(mapDelivery), error: null };
}

/** Admin: requeue a delivery. */
export async function requeueWebhookDelivery(
  deliveryId: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const { data, error } = await supabase.rpc('requeue_webhook_delivery', { p_id: deliveryId });
  if (error) {
    loggingService.error('requeueWebhookDelivery failed', { deliveryId, error }, 'webhookOutboxService');
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: Boolean(data), error: null };
}

/**
 * Producer-side helper. Feature code calls this to publish a domain event;
 * the RPC fans out one outbox row per matching active endpoint. Safe no-op
 * when no endpoints are registered. Returns the number of rows fanned out.
 *
 * Call sites should pass redacted payloads only — anything written here is
 * persisted in webhook_outbox.payload and visible to company admins via
 * the deliveries list.
 */
export async function emitWebhookEvent(
  companyId: string,
  eventType: string,
  payload:   Record<string, unknown>,
): Promise<{ fanned: number; error: Error | null }> {
  const { data, error } = await supabase.rpc('emit_webhook_event', {
    p_company_id: companyId,
    p_event_type: eventType,
    p_payload:    JSON.parse(JSON.stringify(payload)) as Json,
  });
  if (error) {
    loggingService.error('emitWebhookEvent failed', { companyId, eventType, error }, 'webhookOutboxService');
    return { fanned: 0, error: new Error(error.message) };
  }
  return { fanned: Number(data ?? 0), error: null };
}
