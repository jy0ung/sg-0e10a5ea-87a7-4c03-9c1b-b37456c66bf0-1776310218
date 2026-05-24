/**
 * dms-sync-worker — Phase 5 backend sync skeleton
 *
 * This function is intentionally read-only toward Proton DMS and canonical UBS
 * tables. It creates a `sync_runs` row and persists caller-supplied raw DMS
 * payloads into the appropriate `dms_raw_*` staging table. Live DMS fetching,
 * token refresh, and canonical normalizers remain later slices.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

// Durable rate limit for non-service-role callers: 60 staging POSTs per
// minute. Tuned for batched operator-driven uploads (up to 1000 records
// per request, see `records.length > 1000` guard below).
const RATE_MAX_CALLS = 60;
const RATE_WINDOW_SECONDS = 60;

type DmsTarget =
  | 'sales_orders'
  | 'vehicle_stock'
  | 'collections'
  | 'order_vehicle_matches'
  | 'deliveries'
  | 'leads'
  | 'prospects'
  | 'soa_snapshots'
  | 'master_data';

interface SyncRequestBody {
  company_id?: string;
  sync_type?: string;
  source_endpoint?: string;
  request_filters?: Record<string, unknown>;
  page_cursor?: string;
  target: DmsTarget;
  records?: Array<Record<string, unknown>>;
  fetch_live?: boolean;
}

interface CallerProfile {
  id: string;
  role: string;
  company_id: string | null;
  access_scope: string | null;
}

const DMS_SYNC_ROLES = new Set(['super_admin', 'company_admin', 'director', 'general_manager']);

const targetTable: Record<DmsTarget, string> = {
  sales_orders: 'dms_raw_sales_orders',
  vehicle_stock: 'dms_raw_vehicle_stock',
  collections: 'dms_raw_collections',
  order_vehicle_matches: 'dms_raw_order_vehicle_matches',
  deliveries: 'dms_raw_deliveries',
  leads: 'dms_raw_leads',
  prospects: 'dms_raw_prospects',
  soa_snapshots: 'dms_raw_soa_snapshots',
  master_data: 'dms_raw_master_data',
};

const defaultEndpoint: Record<DmsTarget, string> = {
  sales_orders: '/api/2b/dms.retail/manfacturer/order/pageorders',
  vehicle_stock: '/api/2b/dms.retail/vsStock/findStockList',
  collections: '/api/2b/dms.retail/vcOrder/queryList',
  order_vehicle_matches: '/api/2b/dms.retail/manfacturer/order/query/ordersMatchCar',
  deliveries: '/api/2b/dms.retail/car/order/pageDelivery',
  leads: '/api/dms.app/pc/sales/leads/page',
  prospects: '/api/dms.app/pc/sales/prospect/page',
  soa_snapshots: '/api/2b/dms.finance/soaRequest/getSoaList',
  master_data: 'dms-master-data',
};

function jsonResponse(req: Request, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function rawPayload(record: Record<string, unknown>): Record<string, unknown> {
  const raw = record.raw_payload;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : record;
}

async function payloadHash(payload: Record<string, unknown>): Promise<string> {
  const input = JSON.stringify(payload);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function mapRecord(target: DmsTarget, companyId: string, syncRunId: string, endpoint: string, record: Record<string, unknown>) {
  const raw_payload = rawPayload(record);
  const base = {
    company_id: companyId,
    sync_run_id: syncRunId,
    source_endpoint: endpoint,
    payload_hash: await payloadHash(raw_payload),
    raw_payload,
    normalized_payload: record.normalized_payload ?? null,
  };

  switch (target) {
    case 'sales_orders':
      return {
        ...base,
        dms_so_no: asText(record.dms_so_no ?? record.soNo),
        dms_so_no_id: asText(record.dms_so_no_id ?? record.soNoId),
        dms_customer_id: asText(record.dms_customer_id ?? record.customerId),
        dms_customer_business_id: asText(record.dms_customer_business_id ?? record.customerBusinessId),
        order_status: asText(record.order_status ?? record.status),
        branch_code: asText(record.branch_code ?? record.branchCode),
        salesperson_code: asText(record.salesperson_code ?? record.salespersonCode),
        order_date: asText(record.order_date ?? record.orderDate),
      };
    case 'vehicle_stock':
      return {
        ...base,
        dms_vs_stock_id: asText(record.dms_vs_stock_id ?? record.vsStockId),
        vin: asText(record.vin),
        chassis_no: asText(record.chassis_no ?? record.chassisNo),
        stock_status: asText(record.stock_status ?? record.stockStatus),
        branch_code: asText(record.branch_code ?? record.branchCode),
        model_code: asText(record.model_code ?? record.modelCode),
        config_code: asText(record.config_code ?? record.configCode),
        color_code: asText(record.color_code ?? record.colorCode),
      };
    case 'collections':
      return {
        ...base,
        dms_collection_id: asText(record.dms_collection_id ?? record.collectionId),
        dms_so_no: asText(record.dms_so_no ?? record.soNo),
        dms_so_no_id: asText(record.dms_so_no_id ?? record.soNoId),
        vin: asText(record.vin),
        chassis_no: asText(record.chassis_no ?? record.chassisNo),
        branch_code: asText(record.branch_code ?? record.branchCode),
        collection_status: asText(record.collection_status ?? record.status),
        collection_amount: asNumber(record.collection_amount ?? record.amount),
        collection_date: asText(record.collection_date ?? record.collectionDate),
      };
    case 'order_vehicle_matches':
      return {
        ...base,
        dms_match_id: asText(record.dms_match_id ?? record.matchId),
        dms_so_no: asText(record.dms_so_no ?? record.soNo),
        dms_so_no_id: asText(record.dms_so_no_id ?? record.soNoId),
        dms_vs_stock_id: asText(record.dms_vs_stock_id ?? record.vsStockId),
        vin: asText(record.vin),
        chassis_no: asText(record.chassis_no ?? record.chassisNo),
        branch_code: asText(record.branch_code ?? record.branchCode),
        allocation_status: asText(record.allocation_status ?? record.allocationStatus),
        registration_status: asText(record.registration_status ?? record.registrationStatus),
        allocated_at: asText(record.allocated_at ?? record.allocatedAt),
        registered_at: asText(record.registered_at ?? record.registeredAt),
      };
    case 'deliveries':
      return {
        ...base,
        dms_delivery_id: asText(record.dms_delivery_id ?? record.deliveryId),
        dms_so_no: asText(record.dms_so_no ?? record.soNo),
        dms_so_no_id: asText(record.dms_so_no_id ?? record.soNoId),
        vin: asText(record.vin),
        chassis_no: asText(record.chassis_no ?? record.chassisNo),
        branch_code: asText(record.branch_code ?? record.branchCode),
        delivery_status: asText(record.delivery_status ?? record.status),
        delivered_at: asText(record.delivered_at ?? record.deliveredAt),
      };
    case 'leads':
      return {
        ...base,
        dms_lead_id: asText(record.dms_lead_id ?? record.leadId),
        dms_customer_id: asText(record.dms_customer_id ?? record.customerId),
        branch_code: asText(record.branch_code ?? record.branchCode),
        salesperson_code: asText(record.salesperson_code ?? record.salespersonCode),
        lead_status: asText(record.lead_status ?? record.status),
        lead_created_at: asText(record.lead_created_at ?? record.createdAt),
      };
    case 'prospects':
      return {
        ...base,
        dms_prospect_id: asText(record.dms_prospect_id ?? record.prospectId),
        dms_customer_id: asText(record.dms_customer_id ?? record.customerId),
        branch_code: asText(record.branch_code ?? record.branchCode),
        salesperson_code: asText(record.salesperson_code ?? record.salespersonCode),
        prospect_status: asText(record.prospect_status ?? record.status),
        prospect_created_at: asText(record.prospect_created_at ?? record.createdAt),
      };
    case 'soa_snapshots':
      return {
        ...base,
        dms_soa_id: asText(record.dms_soa_id ?? record.soaId),
        dms_so_no: asText(record.dms_so_no ?? record.soNo),
        branch_code: asText(record.branch_code ?? record.branchCode),
        snapshot_status: asText(record.snapshot_status ?? record.status),
        snapshot_date: asText(record.snapshot_date ?? record.snapshotDate),
        amount: asNumber(record.amount),
      };
    case 'master_data':
      return {
        ...base,
        entity_type: asText(record.entity_type ?? record.entityType) ?? 'unknown',
        dms_entity_id: asText(record.dms_entity_id ?? record.entityId),
        entity_code: asText(record.entity_code ?? record.code),
        entity_label: asText(record.entity_label ?? record.label ?? record.name),
      };
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { error: 'Method Not Allowed' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(req, 401, { error: 'Unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const bearer = authHeader.slice('Bearer '.length).trim();
  const isServiceRole = bearer === serviceRoleKey;

  let body: SyncRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, 400, { error: 'Invalid JSON' });
  }

  if (body.fetch_live) {
    return jsonResponse(req, 501, { error: 'Live DMS fetching is not implemented in this skeleton' });
  }

  if (!body.target || !(body.target in targetTable)) {
    return jsonResponse(req, 400, { error: 'Invalid target' });
  }

  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length > 1000) {
    return jsonResponse(req, 400, { error: 'Maximum 1000 records per staging request' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let callerProfile: CallerProfile | null = null;
  if (!isServiceRole) {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return jsonResponse(req, 401, { error: 'Unauthorized' });

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, company_id, access_scope')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) return jsonResponse(req, 403, { error: 'Profile not found' });
    callerProfile = profile as CallerProfile;

    if (!DMS_SYNC_ROLES.has(callerProfile.role)) {
      return jsonResponse(req, 403, { error: 'Insufficient role for DMS sync staging' });
    }

    const limit = await checkRateLimit({
      callerId: callerProfile.id,
      action: 'dms-sync-worker',
      maxCalls: RATE_MAX_CALLS,
      windowSeconds: RATE_WINDOW_SECONDS,
      supabaseUrl,
      serviceRoleKey,
    });
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: limit.message }),
        { status: 429, headers: { ...corsHeaders, ...limit.headers } },
      );
    }
  }

  const companyId = body.company_id ?? callerProfile?.company_id ?? Deno.env.get('DMS_DEFAULT_COMPANY_ID') ?? '';
  if (!companyId) return jsonResponse(req, 400, { error: 'company_id is required' });

  if (!isServiceRole && callerProfile?.access_scope !== 'global' && callerProfile?.company_id !== companyId) {
    return jsonResponse(req, 403, { error: 'Cannot stage DMS payloads outside caller company' });
  }

  const endpoint = body.source_endpoint ?? defaultEndpoint[body.target];
  const syncType = body.sync_type ?? `dms_${body.target}`;

  const { data: syncRun, error: syncRunError } = await admin
    .from('sync_runs')
    .insert({
      company_id: companyId,
      source_system: 'dms',
      sync_type: syncType,
      source_endpoint: endpoint,
      request_filters: body.request_filters ?? {},
      page_cursor: body.page_cursor ?? null,
      status: 'running',
      created_by: callerProfile?.id ?? null,
    })
    .select('id')
    .single();

  if (syncRunError || !syncRun) {
    return jsonResponse(req, 500, { error: syncRunError?.message ?? 'Failed to create sync run' });
  }

  const syncRunId = String((syncRun as { id: string }).id);

  try {
    if (records.length > 0) {
      const rows = await Promise.all(records.map((record) => mapRecord(body.target, companyId, syncRunId, endpoint, record)));
      const { error: insertError } = await admin.from(targetTable[body.target]).upsert(rows, { ignoreDuplicates: true });
      if (insertError) throw insertError;
    }

    await admin
      .from('sync_runs')
      .update({ status: 'succeeded', record_count: records.length, finished_at: new Date().toISOString() })
      .eq('id', syncRunId);

    return jsonResponse(req, 200, {
      sync_run_id: syncRunId,
      status: 'succeeded',
      target: body.target,
      table: targetTable[body.target],
      record_count: records.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DMS staging error';
    await admin
      .from('sync_runs')
      .update({ status: 'failed', error_message: message, finished_at: new Date().toISOString() })
      .eq('id', syncRunId);
    return jsonResponse(req, 500, { error: message, sync_run_id: syncRunId });
  }
});