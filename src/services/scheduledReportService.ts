import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type DateRangePreset = 'last_7_days' | 'last_30_days' | 'last_month' | 'current_month';

export interface ScheduledReport {
  id: string;
  companyId: string;
  reportId: string;
  reportLabel: string;
  frequency: ReportFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  dateRange: DateRangePreset;
  recipients: string[];
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateScheduledReportInput {
  reportId: string;
  reportLabel: string;
  frequency: ReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay?: string;
  dateRange?: DateRangePreset;
  recipients: string[];
}

function mapRow(row: Record<string, unknown>): ScheduledReport {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    reportId: String(row.report_id),
    reportLabel: String(row.report_label),
    frequency: row.frequency as ReportFrequency,
    dayOfWeek: row.day_of_week != null ? Number(row.day_of_week) : null,
    dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : null,
    timeOfDay: String(row.time_of_day),
    dateRange: String(row.date_range) as DateRangePreset,
    recipients: Array.isArray(row.recipients) ? row.recipients as string[] : [],
    isActive: Boolean(row.is_active),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    lastRunStatus: row.last_run_status ? String(row.last_run_status) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

export async function listScheduledReports(
  companyId: string,
): Promise<{ data: ScheduledReport[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('scheduled_reports')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    loggingService.error('listScheduledReports failed', { companyId, error }, 'ScheduledReportService');
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data ?? []).map(mapRow), error: null };
}

export async function createScheduledReport(
  companyId: string,
  userId: string,
  input: CreateScheduledReportInput,
): Promise<{ data: ScheduledReport | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('scheduled_reports')
    .insert({
      company_id: companyId,
      report_id: input.reportId,
      report_label: input.reportLabel,
      frequency: input.frequency,
      day_of_week: input.dayOfWeek ?? null,
      day_of_month: input.dayOfMonth ?? null,
      time_of_day: input.timeOfDay ?? '09:00',
      date_range: input.dateRange ?? 'last_30_days',
      recipients: input.recipients,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) {
    loggingService.error('createScheduledReport failed', { companyId, input, error }, 'ScheduledReportService');
    return { data: null, error: new Error(error.message) };
  }
  return { data: mapRow(data as Record<string, unknown>), error: null };
}

export async function toggleScheduledReport(
  companyId: string,
  id: string,
  isActive: boolean,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('scheduled_reports')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteScheduledReport(
  companyId: string,
  id: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('scheduled_reports')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}
