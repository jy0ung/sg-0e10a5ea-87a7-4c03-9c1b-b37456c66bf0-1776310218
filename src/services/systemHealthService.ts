import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

export interface HealthMetrics {
  dbConnected: boolean;
  userCount: number;
  dealCount: number;
  vehicleCount: number;
  ticketCount: number;
  recentAuditEvents: number;
  lastDmsSync: string | null;
  lastDmsStatus: string | null;
}

export async function fetchHealthMetrics(companyId: string): Promise<HealthMetrics> {
  const results: HealthMetrics = {
    dbConnected: false,
    userCount: 0,
    dealCount: 0,
    vehicleCount: 0,
    ticketCount: 0,
    recentAuditEvents: 0,
    lastDmsSync: null,
    lastDmsStatus: null,
  };

  try {
    const { count: userCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    results.dbConnected = true;
    results.userCount = userCount ?? 0;

    const { count: dealCount } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    results.dealCount = dealCount ?? 0;

    const { count: vehicleCount } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .neq('is_deleted', true);
    results.vehicleCount = vehicleCount ?? 0;

    const { count: ticketCount } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    results.ticketCount = ticketCount ?? 0;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: auditCount } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo);
    results.recentAuditEvents = auditCount ?? 0;

    try {
      const { data: syncRun } = await supabase
        .from('dms_sync_runs')
        .select('started_at, status')
        .eq('company_id', companyId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (syncRun) {
        results.lastDmsSync = syncRun.started_at as string;
        results.lastDmsStatus = syncRun.status as string;
      }
    } catch {
      // dms_sync_runs may not exist
    }
  } catch (err) {
    loggingService.error('Health check failed', { err }, 'SystemHealthService');
    results.dbConnected = false;
  }

  return results;
}
