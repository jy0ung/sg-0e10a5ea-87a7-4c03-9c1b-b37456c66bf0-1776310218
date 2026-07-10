/**
 * auto-close-resolved-tickets
 *
 * Cron-invoked edge function that closes requests sitting in
 * `completed_by_owner` longer than the configured grace period.
 *
 * Default behaviour: close after 3 days.
 * Configurable per company through request_module_settings.closure_rules:
 *   { "auto_close_days": 7 }
 *
 * Invocation:
 *   POST /auto-close-resolved-tickets
 *   Authorization: Bearer <service_role_key> for operator cron, or an admin JWT
 *   Body: {} or { "dry_run": true, "company_id": "..." }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { withRequestLogging } from '../_shared/logger.ts';

const DEFAULT_AUTO_CLOSE_DAYS = 3;
const MAX_BATCH_SIZE = 500;

interface AutoCloseRequestBody {
  dry_run?: boolean;
  company_id?: string;
}

interface CallerProfile {
  id: string;
  role: string;
  company_id: string | null;
  access_scope: string | null;
  status: string | null;
}

interface CandidateTicket {
  id: string;
  company_id: string;
  subject: string | null;
  status_changed_at: string | null;
  resolved_at: string | null;
  assigned_to: string | null;
  last_action_by: string | null;
  submitted_by: string;
}

function responseHeaders(req: Request) {
  return { ...buildCorsHeaders(req), 'Content-Type': 'application/json' };
}

function jsonResponse(req: Request, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(req),
  });
}

async function parseBody(req: Request): Promise<AutoCloseRequestBody> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as AutoCloseRequestBody
      : {};
  } catch {
    return {};
  }
}

function configuredAutoCloseDays(closureRules: unknown) {
  if (!closureRules || typeof closureRules !== 'object' || Array.isArray(closureRules)) {
    return DEFAULT_AUTO_CLOSE_DAYS;
  }
  const value = (closureRules as Record<string, unknown>).auto_close_days;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_AUTO_CLOSE_DAYS;
}

Deno.serve(withRequestLogging('auto-close-resolved-tickets', async ({ req }) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearer) {
      return jsonResponse(req, 401, { error: 'Missing bearer token' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await parseBody(req);
    const dryRun = body.dry_run === true;

    let role = 'service_role';
    let allowedCompanyId: string | null = null;

    if (bearer !== serviceRoleKey) {
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
      if (callerError || !caller) {
        return jsonResponse(req, 401, { error: 'Unauthorized' });
      }

      const { data: callerProfile, error: profileError } = await admin
        .from('profiles')
        .select('id, role, company_id, access_scope, status')
        .eq('id', caller.id)
        .maybeSingle();

      if (profileError || !callerProfile || callerProfile.status !== 'active') {
        return jsonResponse(req, 403, { error: 'Forbidden' });
      }

      const profile = callerProfile as CallerProfile;
      role = profile.role;
      if (!['super_admin', 'company_admin', 'portal_admin'].includes(profile.role)) {
        return jsonResponse(req, 403, { error: 'Only administrators can run ticket auto-close' });
      }

      if (profile.role !== 'super_admin') {
        if (!profile.company_id) {
          return jsonResponse(req, 403, { error: 'Caller has no company scope' });
        }
        allowedCompanyId = profile.company_id;
      }
    }

    const requestedCompanyId = typeof body.company_id === 'string' && body.company_id.trim()
      ? body.company_id.trim()
      : null;
    if (allowedCompanyId && requestedCompanyId && requestedCompanyId !== allowedCompanyId) {
      return jsonResponse(req, 403, { error: 'Forbidden: company mismatch' });
    }
    const effectiveCompanyId = allowedCompanyId ?? requestedCompanyId;

    let candidateQuery = admin
      .from('tickets')
      .select('id, company_id, subject, status_changed_at, resolved_at, assigned_to, last_action_by, submitted_by')
      .eq('status', 'completed_by_owner')
      .order('status_changed_at', { ascending: true })
      .limit(MAX_BATCH_SIZE);

    if (effectiveCompanyId) {
      candidateQuery = candidateQuery.eq('company_id', effectiveCompanyId);
    }

    const { data: candidates, error: queryError } = await candidateQuery;
    if (queryError) throw queryError;

    const candidateRows = (candidates ?? []) as CandidateTicket[];
    if (candidateRows.length === 0) {
      return jsonResponse(req, 200, {
        success: true,
        message: 'No tickets eligible for auto-close',
        closed: 0,
        dry_run: dryRun,
        role,
        company_id: effectiveCompanyId,
      });
    }

    const byCompany = new Map<string, CandidateTicket[]>();
    for (const ticket of candidateRows) {
      const list = byCompany.get(ticket.company_id) ?? [];
      list.push(ticket);
      byCompany.set(ticket.company_id, list);
    }

    let totalClosed = 0;
    const results: Array<{ company_id: string; closed: number; skipped: number }> = [];

    for (const [companyId, companyTickets] of byCompany.entries()) {
      const { data: settings, error: settingsError } = await admin
        .from('request_module_settings')
        .select('closure_rules')
        .eq('company_id', companyId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const autoCloseDays = configuredAutoCloseDays(settings?.closure_rules);
      const companyCutoff = new Date(Date.now() - autoCloseDays * 24 * 60 * 60 * 1000);
      const eligible = companyTickets.filter((ticket) => {
        const changedAt = new Date(ticket.status_changed_at ?? ticket.resolved_at ?? 0);
        return changedAt.getTime() < companyCutoff.getTime();
      });

      if (eligible.length === 0) {
        results.push({ company_id: companyId, closed: 0, skipped: companyTickets.length });
        continue;
      }

      if (dryRun) {
        totalClosed += eligible.length;
        results.push({ company_id: companyId, closed: eligible.length, skipped: companyTickets.length - eligible.length });
        continue;
      }

      const now = new Date().toISOString();
      const ticketIds = eligible.map((ticket) => ticket.id);

      const { error: updateError } = await admin
        .from('tickets')
        .update({
          status: 'closed',
          closed_at: now,
          closure_confirmed: false,
          status_changed_at: now,
          current_responsible_party: 'None',
          next_action: 'No further action',
          last_action_by: null,
          updated_at: now,
        })
        .eq('company_id', companyId)
        .in('id', ticketIds);

      if (updateError) throw updateError;

      const activityRows = eligible.map((ticket) => ({
        ticket_id: ticket.id,
        company_id: companyId,
        actor_id: ticket.assigned_to ?? ticket.last_action_by ?? ticket.submitted_by,
        event_type: 'status_changed',
        message: `Request auto-closed after ${autoCloseDays} day${autoCloseDays === 1 ? '' : 's'} without requester confirmation.`,
        metadata: { before: 'completed_by_owner', after: 'closed', auto_close: true, auto_close_days: autoCloseDays },
      }));

      const { error: activityError } = await admin
        .from('ticket_activity')
        .insert(activityRows);

      if (activityError) throw activityError;

      totalClosed += eligible.length;
      results.push({ company_id: companyId, closed: eligible.length, skipped: companyTickets.length - eligible.length });
    }

    return jsonResponse(req, 200, {
      success: true,
      dry_run: dryRun,
      role,
      company_id: effectiveCompanyId,
      total_closed: totalClosed,
      total_candidates: candidateRows.length,
      by_company: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('auto-close-resolved-tickets error:', message);
    return jsonResponse(req, 500, { error: message });
  }
}));
