import { supabase } from '@/integrations/supabase/client';
import { loggingService } from './loggingService';

// ============================================================
// Types
// ============================================================

export type DealStage = 
  | 'lead' | 'prospect' | 'booking' | 'loan_submission' | 'lou'
  | 'shipment' | 'receive' | 'registration' | 'delivery' | 'disbursement' | 'completed';

export type LoanStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'lou_issued' | 'lou_verified' | 'disbursed';
export type InsuranceStatus = 'pending' | 'cover_note_issued' | 'policy_active' | 'expired';
export type RegistrationStatus = 'pending' | 'submitted' | 'registered' | 'plate_received';

export interface Deal {
  id: string;
  company_id: string;
  branch_id: string | null;
  deal_no: string;
  vso_no: string | null;
  stage: DealStage;
  stage_entered_at: string;
  stage_updated_at: string;
  stage_updated_by: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_ic: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  model_id: string | null;
  model_name: string | null;
  variant: string | null;
  colour: string | null;
  chassis_no: string | null;
  selling_price: number | null;
  deposit_amount: number | null;
  deposit_date: string | null;
  discount_amount: number;
  accessories_amount: number;
  total_amount: number | null;
  sales_advisor_id: string | null;
  sales_advisor_name: string | null;
  lead_source: string | null;
  lead_source_detail: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined data
  deal_loan?: DealLoan | null;
  deal_insurance?: DealInsurance | null;
  deal_registration?: DealRegistration | null;
}

export interface DealLoan {
  id: string;
  deal_id: string;
  company_id: string;
  bank_id: string | null;
  bank_name: string | null;
  loan_type: string | null;
  loan_amount: number | null;
  loan_tenure_months: number | null;
  monthly_installment: number | null;
  interest_rate: number | null;
  status: LoanStatus;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  lou_received_at: string | null;
  lou_verified_at: string | null;
  disbursed_at: string | null;
  loan_form_url: string | null;
  lou_url: string | null;
  approval_letter_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealInsurance {
  id: string;
  deal_id: string;
  company_id: string;
  insurer_id: string | null;
  insurer_name: string | null;
  policy_no: string | null;
  cover_note_no: string | null;
  premium: number | null;
  coverage_type: string | null;
  start_date: string | null;
  expiry_date: string | null;
  status: InsuranceStatus;
  cover_note_issued_at: string | null;
  policy_issued_at: string | null;
  cover_note_url: string | null;
  policy_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealRegistration {
  id: string;
  deal_id: string;
  company_id: string;
  jpj_ref: string | null;
  plate_no: string | null;
  registration_date: string | null;
  road_tax_expiry: string | null;
  status: RegistrationStatus;
  submitted_at: string | null;
  registered_at: string | null;
  plate_received_at: string | null;
  registration_doc_url: string | null;
  road_tax_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  company_id: string;
  actor_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DealDocument {
  id: string;
  deal_id: string;
  company_id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface CreateDealInput {
  company_id: string;
  branch_id?: string;
  customer_name: string;
  customer_ic?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_id?: string;
  model_id?: string;
  model_name?: string;
  variant?: string;
  colour?: string;
  selling_price?: number;
  deposit_amount?: number;
  deposit_date?: string;
  discount_amount?: number;
  accessories_amount?: number;
  total_amount?: number;
  sales_advisor_id?: string;
  sales_advisor_name?: string;
  lead_source?: string;
  lead_source_detail?: string;
  notes?: string;
  vso_no?: string;
}

export interface UpdateDealInput extends Partial<CreateDealInput> {
  stage?: DealStage;
}

export interface DealFilters {
  company_id: string;
  branch_id?: string;
  stage?: DealStage | DealStage[];
  sales_advisor_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface PipelineColumn {
  stage: DealStage;
  deals: Deal[];
  count: number;
  total_value: number;
}

// ============================================================
// Stage transition rules
// ============================================================

const STAGE_TRANSITIONS: Record<DealStage, DealStage[]> = {
  lead:            ['prospect'],
  prospect:        ['booking'],
  booking:         ['loan_submission'],
  loan_submission: ['lou', 'booking'],
  lou:             ['shipment'],
  shipment:        ['receive'],
  receive:         ['registration'],
  registration:    ['delivery'],
  delivery:        ['disbursement'],
  disbursement:    ['completed'],
  completed:       [],
};

const STAGE_LABELS: Record<DealStage, string> = {
  lead:            'Lead',
  prospect:        'Prospect',
  booking:         'Booking',
  loan_submission: 'Loan Submission',
  lou:             'LOU',
  shipment:        'Shipment',
  receive:         'Receive',
  registration:    'Registration',
  delivery:        'Delivery',
  disbursement:    'Disbursement',
  completed:       'Completed',
};

const STAGE_ORDER: DealStage[] = [
  'lead', 'prospect', 'booking', 'loan_submission', 'lou',
  'shipment', 'receive', 'registration', 'delivery', 'disbursement', 'completed',
];

export function getValidTransitions(stage: DealStage): DealStage[] {
  return STAGE_TRANSITIONS[stage] || [];
}

export function getStageLabel(stage: DealStage): string {
  return STAGE_LABELS[stage] || stage;
}

export function getStageOrder(): DealStage[] {
  return [...STAGE_ORDER];
}

export function canAdvanceStage(current: DealStage, target: DealStage): boolean {
  return STAGE_TRANSITIONS[current]?.includes(target) ?? false;
}

// ============================================================
// Responsible party mapping
// ============================================================

export function getResponsibleParty(stage: DealStage): string {
  switch (stage) {
    case 'lead':
    case 'prospect':
    case 'booking':
    case 'delivery':
      return 'Sales Advisor';
    case 'loan_submission':
    case 'lou':
    case 'disbursement':
      return 'Finance Team';
    case 'shipment':
    case 'receive':
    case 'registration':
      return 'Operations';
    case 'completed':
      return '—';
    default:
      return '—';
  }
}

export function getNextAction(stage: DealStage): string {
  switch (stage) {
    case 'lead': return 'Contact and qualify lead';
    case 'prospect': return 'Collect deposit and create booking';
    case 'booking': return 'Submit loan application';
    case 'loan_submission': return 'Wait for bank approval';
    case 'lou': return 'Verify LOU and arrange shipment';
    case 'shipment': return 'Track shipment and receive vehicle';
    case 'receive': return 'Submit registration documents';
    case 'registration': return 'Complete registration and prepare delivery';
    case 'delivery': return 'Hand over vehicle to customer';
    case 'disbursement': return 'Await bank disbursement';
    case 'completed': return 'Deal fully settled';
    default: return '';
  }
}

// ============================================================
// CRUD Operations
// ============================================================

export async function createDeal(input: CreateDealInput, userId: string): Promise<{ data: Deal | null; error: Error | null }> {
  try {
    // Generate deal number
    const { data: dealNo, error: dealNoError } = await supabase
      .rpc('generate_deal_no', { p_company_id: input.company_id, p_branch_id: input.branch_id || null });
    
    if (dealNoError) {
      loggingService.error('Failed to generate deal number', { error: dealNoError });
      return { data: null, error: new Error(dealNoError.message) };
    }

    const totalAmount = (input.selling_price || 0) - (input.discount_amount || 0) + (input.accessories_amount || 0);

    const { data, error } = await supabase
      .from('deals')
      .insert({
        ...input,
        deal_no: dealNo,
        total_amount: totalAmount,
        created_by: userId,
        stage: 'lead',
      })
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to create deal', { error, input });
      return { data: null, error: new Error(error.message) };
    }

    // Log activity
    await logActivity(data.id, input.company_id, userId, 'deal_created', { deal_no: dealNo });

    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to create deal');
    loggingService.error('createDeal exception', { error });
    return { data: null, error };
  }
}

export async function getDeal(id: string): Promise<{ data: Deal | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select(`
        *,
        deal_loan(*),
        deal_insurance(*),
        deal_registration(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      loggingService.error('Failed to get deal', { error, id });
      return { data: null, error: new Error(error.message) };
    }

    // Flatten sub-tracks (Supabase returns arrays for joins)
    const deal: Deal = {
      ...data,
      deal_loan: data.deal_loan?.[0] || null,
      deal_insurance: data.deal_insurance?.[0] || null,
      deal_registration: data.deal_registration?.[0] || null,
    };

    return { data: deal, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to get deal');
    loggingService.error('getDeal exception', { error });
    return { data: null, error };
  }
}

export async function listDeals(filters: DealFilters): Promise<{ data: Deal[]; error: Error | null }> {
  try {
    let query = supabase
      .from('deals')
      .select('*')
      .eq('company_id', filters.company_id)
      .order('created_at', { ascending: false });

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id);
    }

    if (filters.stage) {
      if (Array.isArray(filters.stage)) {
        query = query.in('stage', filters.stage);
      } else {
        query = query.eq('stage', filters.stage);
      }
    }

    if (filters.sales_advisor_id) {
      query = query.eq('sales_advisor_id', filters.sales_advisor_id);
    }

    if (filters.search) {
      query = query.or(`customer_name.ilike.%${filters.search}%,deal_no.ilike.%${filters.search}%,vso_no.ilike.%${filters.search}%`);
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    if (filters.limit) {
      query = query.range(filters.offset || 0, (filters.offset || 0) + filters.limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      loggingService.error('Failed to list deals', { error, filters });
      return { data: [], error: new Error(error.message) };
    }

    return { data: data || [], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to list deals');
    loggingService.error('listDeals exception', { error });
    return { data: [], error };
  }
}

export async function updateDeal(id: string, input: UpdateDealInput, userId: string): Promise<{ data: Deal | null; error: Error | null }> {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return { data: null, error: new Error('Deal not found') };
    }

    // Calculate total_amount if pricing fields changed
    const updates: Record<string, unknown> = { ...input };
    if (input.selling_price !== undefined || input.discount_amount !== undefined || input.accessories_amount !== undefined) {
      const sp = input.selling_price ?? current.selling_price ?? 0;
      const disc = input.discount_amount ?? current.discount_amount ?? 0;
      const acc = input.accessories_amount ?? current.accessories_amount ?? 0;
      updates.total_amount = sp - disc + acc;
    }

    const { data, error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to update deal', { error, id, input });
      return { data: null, error: new Error(error.message) };
    }

    // Log changes
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(input)) {
      if ((current as Record<string, unknown>)[key] !== (input as Record<string, unknown>)[key]) {
        changes[key] = { before: (current as Record<string, unknown>)[key], after: (input as Record<string, unknown>)[key] };
      }
    }
    if (Object.keys(changes).length > 0) {
      await logActivity(id, current.company_id, userId, 'deal_updated', changes);
    }

    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to update deal');
    loggingService.error('updateDeal exception', { error });
    return { data: null, error };
  }
}

// ============================================================
// Lifecycle Operations
// ============================================================

export async function advanceStage(id: string, targetStage: DealStage, userId: string): Promise<{ data: Deal | null; error: Error | null }> {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return { data: null, error: new Error('Deal not found') };
    }

    if (!canAdvanceStage(current.stage as DealStage, targetStage)) {
      return { data: null, error: new Error(`Cannot advance from ${current.stage} to ${targetStage}`) };
    }

    const { data, error } = await supabase
      .from('deals')
      .update({
        stage: targetStage,
        stage_updated_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to advance stage', { error, id, targetStage });
      return { data: null, error: new Error(error.message) };
    }

    await logActivity(id, current.company_id, userId, 'stage_changed', {
      before: current.stage,
      after: targetStage,
    });

    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to advance stage');
    loggingService.error('advanceStage exception', { error });
    return { data: null, error };
  }
}

// ============================================================
// Sub-Track Operations
// ============================================================

export async function setupLoan(dealId: string, companyId: string, input: Partial<DealLoan>, userId: string): Promise<{ data: DealLoan | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('deal_loan')
      .upsert({ deal_id: dealId, company_id: companyId, ...input })
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to setup loan', { error, dealId, input });
      return { data: null, error: new Error(error.message) };
    }

    await logActivity(dealId, companyId, userId, 'loan_updated', { action: 'setup', ...input });
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to setup loan');
    return { data: null, error };
  }
}

export async function updateLoanStatus(dealId: string, companyId: string, status: LoanStatus, userId: string, metadata?: Record<string, unknown>): Promise<{ error: Error | null }> {
  try {
    const updates: Record<string, unknown> = { status };
    
    // Set timestamp based on status
    switch (status) {
      case 'submitted': updates.submitted_at = new Date().toISOString(); break;
      case 'approved': updates.approved_at = new Date().toISOString(); break;
      case 'rejected': updates.rejected_at = new Date().toISOString(); break;
      case 'lou_issued': updates.lou_received_at = new Date().toISOString(); break;
      case 'lou_verified': updates.lou_verified_at = new Date().toISOString(); break;
      case 'disbursed': updates.disbursed_at = new Date().toISOString(); break;
    }

    const { error } = await supabase
      .from('deal_loan')
      .update(updates)
      .eq('deal_id', dealId);

    if (error) {
      loggingService.error('Failed to update loan status', { error, dealId, status });
      return { error: new Error(error.message) };
    }

    await logActivity(dealId, companyId, userId, 'loan_status_changed', { status, ...metadata });
    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to update loan status');
    return { error };
  }
}

export async function setupInsurance(dealId: string, companyId: string, input: Partial<DealInsurance>, userId: string): Promise<{ data: DealInsurance | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('deal_insurance')
      .upsert({ deal_id: dealId, company_id: companyId, ...input })
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to setup insurance', { error, dealId, input });
      return { data: null, error: new Error(error.message) };
    }

    await logActivity(dealId, companyId, userId, 'insurance_updated', { action: 'setup', ...input });
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to setup insurance');
    return { data: null, error };
  }
}

export async function updateInsuranceStatus(dealId: string, companyId: string, status: InsuranceStatus, userId: string): Promise<{ error: Error | null }> {
  try {
    const updates: Record<string, unknown> = { status };
    switch (status) {
      case "cover_note_issued": updates.cover_note_issued_at = new Date().toISOString(); break;
      case "policy_active": updates.policy_issued_at = new Date().toISOString(); break;
    }
    const { error } = await supabase.from("deal_insurance").update(updates).eq("deal_id", dealId);
    if (error) return { error: new Error(error.message) };
    await logActivity(dealId, companyId, userId, "insurance_status_changed", { status });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error("Failed to update insurance status") };
  }
}

export async function updateRegistrationStatus(dealId: string, companyId: string, status: RegistrationStatus, userId: string): Promise<{ error: Error | null }> {
  try {
    const updates: Record<string, unknown> = { status };
    switch (status) {
      case "submitted": updates.submitted_at = new Date().toISOString(); break;
      case "registered": updates.registered_at = new Date().toISOString(); break;
      case "plate_received": updates.plate_received_at = new Date().toISOString(); break;
    }
    const { error } = await supabase.from("deal_registration").update(updates).eq("deal_id", dealId);
    if (error) return { error: new Error(error.message) };
    await logActivity(dealId, companyId, userId, "registration_status_changed", { status });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error("Failed to update registration status") };
  }
}

export async function setupRegistration(dealId: string, companyId: string, input: Partial<DealRegistration>, userId: string): Promise<{ data: DealRegistration | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('deal_registration')
      .upsert({ deal_id: dealId, company_id: companyId, ...input })
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to setup registration', { error, dealId, input });
      return { data: null, error: new Error(error.message) };
    }

    await logActivity(dealId, companyId, userId, 'registration_updated', { action: 'setup', ...input });
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to setup registration');
    return { data: null, error };
  }
}

// ============================================================
// Pipeline
// ============================================================

export async function getPipeline(companyId: string, filters?: { branch_id?: string; sales_advisor_id?: string }): Promise<{ data: PipelineColumn[]; error: Error | null }> {
  try {
    let query = supabase
      .from('deals')
      .select('*')
      .eq('company_id', companyId)
      .neq('stage', 'completed')
      .order('stage_entered_at', { ascending: true });

    if (filters?.branch_id) {
      query = query.eq('branch_id', filters.branch_id);
    }
    if (filters?.sales_advisor_id) {
      query = query.eq('sales_advisor_id', filters.sales_advisor_id);
    }

    const { data, error } = await query;

    if (error) {
      loggingService.error('Failed to get pipeline', { error, companyId });
      return { data: [], error: new Error(error.message) };
    }

    // Group by stage
    const columns: PipelineColumn[] = STAGE_ORDER
      .filter(s => s !== 'completed')
      .map(stage => {
        const stageDeals = (data || []).filter(d => d.stage === stage);
        return {
          stage,
          deals: stageDeals,
          count: stageDeals.length,
          total_value: stageDeals.reduce((sum, d) => sum + (d.total_amount || 0), 0),
        };
      });

    return { data: columns, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to get pipeline');
    return { data: [], error };
  }
}

// ============================================================
// Activity Logging (Event Sourcing)
// ============================================================

async function logActivity(dealId: string, companyId: string, actorId: string, action: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    await supabase
      .from('deal_activities')
      .insert({
        deal_id: dealId,
        company_id: companyId,
        actor_id: actorId,
        action,
        metadata,
      });
  } catch (err) {
    loggingService.error('Failed to log activity', { error: err, dealId, action });
  }
}

export async function getActivities(dealId: string): Promise<{ data: DealActivity[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('deal_activities')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: new Error(error.message) };
    }

    return { data: data || [], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to get activities');
    return { data: [], error };
  }
}

// ============================================================
// Documents
// ============================================================

export async function uploadDocument(dealId: string, companyId: string, userId: string, docType: string, file: File): Promise<{ data: DealDocument | null; error: Error | null }> {
  try {
    const filePath = `deals/${dealId}/${docType}/${file.name}`;
    
    const { error: uploadError } = await supabase.storage
      .from('deal-documents')
      .upload(filePath, file);

    if (uploadError) {
      loggingService.error('Failed to upload document', { error: uploadError, dealId, docType });
      return { data: null, error: new Error(uploadError.message) };
    }

    const { data, error } = await supabase
      .from('deal_documents')
      .insert({
        deal_id: dealId,
        company_id: companyId,
        doc_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        uploaded_by: userId,
      })
      .select()
      .single();

    if (error) {
      loggingService.error('Failed to save document record', { error, dealId, docType });
      return { data: null, error: new Error(error.message) };
    }

    await logActivity(dealId, companyId, userId, 'document_uploaded', { doc_type: docType, file_name: file.name });
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to upload document');
    return { data: null, error };
  }
}

export async function getDocuments(dealId: string): Promise<{ data: DealDocument[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('deal_documents')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: new Error(error.message) };
    }

    return { data: data || [], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to get documents');
    return { data: [], error };
  }
}

// ============================================================
// Dashboard (using materialized views)
// ============================================================

export interface DashboardData {
  active_deals: number;
  new_today: number;
  stalled: number;
  avg_days_to_close: number;
  loan_pending: number;
  registration_pending: number;
  delivery_today: number;
  disbursement_pending: number;
  overdue: number;
  completed_this_month: number;
  revenue_this_month: number;
  pipeline_funnel: Array<{ stage: string; count: number; value: number }>;
  deals_by_advisor: Array<{ advisor: string; count: number }>;
}

export async function getDashboard(companyId: string): Promise<{ data: DashboardData | null; error: Error | null }> {
  try {
    // Get all active deals
    const { data: deals, error } = await supabase
      .from('deals')
      .select('stage, total_amount, sales_advisor_name, stage_entered_at, created_at, completed_at')
      .eq('company_id', companyId);

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const active = (deals || []).filter(d => d.stage !== 'completed');
    const completed = (deals || []).filter(d => d.stage === 'completed' && d.completed_at && d.completed_at >= monthStart);

    // Calculate metrics
    const activeDeals = active.length;
    const newToday = active.filter(d => d.created_at?.startsWith(today)).length;
    const stalled = active.filter(d => {
      const entered = new Date(d.stage_entered_at);
      const daysDiff = (now.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 7;
    }).length;

    const avgDaysToClose = completed.length > 0
      ? completed.reduce((sum, d) => {
          const created = new Date(d.created_at);
          const comp = new Date(d.completed_at!);
          return sum + (comp.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / completed.length
      : 0;

    const loanPending = active.filter(d => d.stage === 'loan_submission' || d.stage === 'lou').length;
    const registrationPending = active.filter(d => d.stage === 'registration').length;
    const deliveryToday = active.filter(d => d.stage === 'delivery').length;
    const disbursementPending = active.filter(d => d.stage === 'disbursement').length;
    const overdue = stalled; // Same as stalled for now
    const completedThisMonth = completed.length;
    const revenueThisMonth = completed.reduce((sum, d) => sum + (d.total_amount || 0), 0);

    // Pipeline funnel
    const pipelineFunnel = STAGE_ORDER
      .filter(s => s !== 'completed')
      .map(stage => {
        const stageDeals = active.filter(d => d.stage === stage);
        return {
          stage: getStageLabel(stage as DealStage),
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.total_amount || 0), 0),
        };
      });

    // Deals by advisor
    const advisorMap = new Map<string, number>();
    active.forEach(d => {
      const advisor = d.sales_advisor_name || 'Unassigned';
      advisorMap.set(advisor, (advisorMap.get(advisor) || 0) + 1);
    });
    const dealsByAdvisor = Array.from(advisorMap.entries())
      .map(([advisor, count]) => ({ advisor, count }))
      .sort((a, b) => b.count - a.count);

    return {
      data: {
        active_deals: activeDeals,
        new_today: newToday,
        stalled,
        avg_days_to_close: Math.round(avgDaysToClose * 10) / 10,
        loan_pending: loanPending,
        registration_pending: registrationPending,
        delivery_today: deliveryToday,
        disbursement_pending: disbursementPending,
        overdue,
        completed_this_month: completedThisMonth,
        revenue_this_month: revenueThisMonth,
        pipeline_funnel: pipelineFunnel,
        deals_by_advisor: dealsByAdvisor,
      },
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to get dashboard');
    return { data: null, error };
  }
}
