/**
 * Leave Quota Service — web app layer
 *
 * Provides:
 *  - CRUD operations for leave_quota_rules (GM/Admin only, enforced by RLS).
 *  - checkLeaveQuotaAvailability() — used by the Leave Request form to show
 *    quota status before the employee submits.
 *
 * Backend enforcement is also performed inside
 * packages/hrms-services/src/leave/leaveService.ts::createLeaveRequest(),
 * which throws if quota is exceeded.  The service-layer check provides
 * defence-in-depth above the RLS policies.
 *
 * Priority when multiple rules match an employee for a date:
 *   1. branch + department  (most specific)
 *   2. department only
 *   3. branch only
 *   4. company-wide (no branch, no department)
 * If specificity is equal, the stricter (lower) max_requests wins.
 */

import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaveQuotaRulePeriodType = 'daily' | 'weekly' | 'monthly' | 'date_range';

export interface LeaveQuotaRule {
  id: string;
  companyId: string;
  ruleName: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  branchId: string | null;
  branchName?: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  periodType: LeaveQuotaRulePeriodType;
  effectiveFrom: string;
  effectiveTo: string | null;
  maxRequests: number;
  countPending: boolean;
  halfDayWeight: number;
  isActive: boolean;
  remarks: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveQuotaRuleInput {
  ruleName: string;
  leaveTypeId: string;
  branchId?: string | null;
  departmentId?: string | null;
  periodType: LeaveQuotaRulePeriodType;
  effectiveFrom: string;
  effectiveTo?: string | null;
  maxRequests: number;
  countPending: boolean;
  halfDayWeight: number;
  isActive: boolean;
  remarks?: string | null;
}

export interface LeaveQuotaAvailability {
  /** True if at least one quota rule applies to this employee + leave type. */
  hasRule: boolean;
  /** True if any day in the requested range is already over quota. */
  isQuotaFull: boolean;
  /** True if any day has exactly 1 slot remaining after this request. */
  isQuotaNearlyFull: boolean;
  /** Remaining slots on the most-restrictive day (Infinity if no rule). */
  available: number;
  /** Current usage on the most-restrictive day. */
  used: number;
  /** Quota limit from the matched rule. */
  max: number;
  /** Name of the matching quota rule, or null. */
  ruleName: string | null;
  /** Calendar dates that are over quota. */
  blockedDates: string[];
  /** Human-readable message (warning or block message), or null. */
  message: string | null;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function isoDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(isoDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Higher value = more specific scope = higher priority. */
function ruleSpecificity(rule: LeaveQuotaRule): number {
  if (rule.branchId && rule.departmentId) return 4;
  if (rule.departmentId) return 3;
  if (rule.branchId) return 2;
  return 1;
}

function isDateInRule(dateStr: string, rule: LeaveQuotaRule): boolean {
  if (dateStr < rule.effectiveFrom) return false;
  if (rule.effectiveTo && dateStr > rule.effectiveTo) return false;
  return true;
}

function getWindowRange(
  dateStr: string,
  rule: LeaveQuotaRule,
): { windowStart: string; windowEnd: string } {
  switch (rule.periodType) {
    case 'daily':
      return { windowStart: dateStr, windowEnd: dateStr };

    case 'weekly': {
      const d = parseIsoDate(dateStr);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday = week start
      const monday = new Date(d.getTime() + diff * 86400000);
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      return { windowStart: isoDateStr(monday), windowEnd: isoDateStr(sunday) };
    }

    case 'monthly': {
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(5, 7), 10);
      const lastDay = new Date(year, month, 0).getDate();
      return {
        windowStart: `${dateStr.slice(0, 7)}-01`,
        windowEnd:   `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
      };
    }

    case 'date_range':
      return {
        windowStart: rule.effectiveFrom,
        windowEnd:   rule.effectiveTo ?? '9999-12-31',
      };
  }
}

function getWindowKey(
  dateStr: string,
  rule: LeaveQuotaRule,
): string {
  const { windowStart, windowEnd } = getWindowRange(dateStr, rule);
  return `${rule.id}|${windowStart}|${windowEnd}`;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToRule(r: Record<string, unknown>): LeaveQuotaRule {
  return {
    id:             String(r.id),
    companyId:      String(r.company_id),
    ruleName:       String(r.rule_name),
    leaveTypeId:    String(r.leave_type_id),
    leaveTypeName:  (r.leave_types as Record<string, unknown> | null)?.name
      ? String((r.leave_types as Record<string, unknown>).name)
      : undefined,
    branchId:       r.branch_id    ? String(r.branch_id)    : null,
    branchName:     null, // resolved separately
    departmentId:   r.department_id ? String(r.department_id) : null,
    departmentName: (r.department as Record<string, unknown> | null)?.name
      ? String((r.department as Record<string, unknown>).name)
      : null,
    periodType:     (r.period_type  as LeaveQuotaRulePeriodType) ?? 'daily',
    effectiveFrom:  String(r.effective_from),
    effectiveTo:    r.effective_to  ? String(r.effective_to)  : null,
    maxRequests:    Number(r.max_requests   ?? 1),
    countPending:   Boolean(r.count_pending ?? true),
    halfDayWeight:  Number(r.half_day_weight ?? 0.5),
    isActive:       Boolean(r.is_active),
    remarks:        r.remarks ? String(r.remarks) : null,
    createdBy:      r.created_by ? String(r.created_by) : null,
    createdAt:      String(r.created_at),
    updatedAt:      String(r.updated_at),
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Lists leave quota rules for a company. Optionally filter by active/leaveType. */
export async function listLeaveQuotaRules(
  companyId: string,
  opts?: { activeOnly?: boolean; leaveTypeId?: string },
): Promise<{ data: LeaveQuotaRule[]; error: string | null }> {
  try {
    let q = untypedSupabase
      .from('leave_quota_rules')
      .select('*, leave_types(name), department:departments(name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (opts?.activeOnly)   q = q.eq('is_active', true);
    if (opts?.leaveTypeId)  q = q.eq('leave_type_id', opts.leaveTypeId);

    const { data, error } = await q;
    if (error) return { data: [], error: error.message };

    // Resolve branch names in one supplemental query (branch_id is text, not FK).
    const branchIds = [
      ...new Set(
        (data as Record<string, unknown>[])
          .map(r => r.branch_id)
          .filter(Boolean) as string[],
      ),
    ];
    const branchNameMap = new Map<string, string>();
    if (branchIds.length) {
      const { data: branches } = await untypedSupabase
        .from('branches')
        .select('id, code, name')
        .in('id', branchIds);
      for (const b of (branches ?? []) as Record<string, unknown>[]) {
        branchNameMap.set(String(b.id),   String(b.name));
        branchNameMap.set(String(b.code), String(b.name));
      }
    }

    return {
      data: (data as Record<string, unknown>[]).map(r => {
        const rule = rowToRule(r);
        if (rule.branchId) rule.branchName = branchNameMap.get(rule.branchId) ?? rule.branchId;
        return rule;
      }),
      error: null,
    };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed to load quota rules.' };
  }
}

/** Creates a new leave quota rule. Returns the created record. */
export async function createLeaveQuotaRule(
  companyId: string,
  actorId: string,
  input: CreateLeaveQuotaRuleInput,
): Promise<{ data: LeaveQuotaRule | null; error: string | null }> {
  try {
    const { data, error } = await untypedSupabase
      .from('leave_quota_rules')
      .insert({
        company_id:      companyId,
        rule_name:       input.ruleName,
        leave_type_id:   input.leaveTypeId,
        branch_id:       input.branchId     ?? null,
        department_id:   input.departmentId  ?? null,
        period_type:     input.periodType,
        effective_from:  input.effectiveFrom,
        effective_to:    input.effectiveTo   ?? null,
        max_requests:    input.maxRequests,
        count_pending:   input.countPending,
        half_day_weight: input.halfDayWeight,
        is_active:       input.isActive,
        remarks:         input.remarks       ?? null,
        created_by:      actorId,
        updated_by:      actorId,
      })
      .select('*')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: rowToRule(data as Record<string, unknown>), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed to create quota rule.' };
  }
}

/** Updates fields on an existing quota rule. Only provided fields are changed. */
export async function updateLeaveQuotaRule(
  companyId: string,
  ruleId: string,
  actorId: string,
  input: Partial<CreateLeaveQuotaRuleInput>,
): Promise<{ error: string | null }> {
  try {
    const patch: Record<string, unknown> = {
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };
    if (input.ruleName      !== undefined) patch.rule_name       = input.ruleName;
    if (input.leaveTypeId   !== undefined) patch.leave_type_id   = input.leaveTypeId;
    if (input.branchId      !== undefined) patch.branch_id       = input.branchId      ?? null;
    if (input.departmentId  !== undefined) patch.department_id   = input.departmentId  ?? null;
    if (input.periodType    !== undefined) patch.period_type     = input.periodType;
    if (input.effectiveFrom !== undefined) patch.effective_from  = input.effectiveFrom;
    if (input.effectiveTo   !== undefined) patch.effective_to    = input.effectiveTo   ?? null;
    if (input.maxRequests   !== undefined) patch.max_requests    = input.maxRequests;
    if (input.countPending  !== undefined) patch.count_pending   = input.countPending;
    if (input.halfDayWeight !== undefined) patch.half_day_weight = input.halfDayWeight;
    if (input.isActive      !== undefined) patch.is_active       = input.isActive;
    if (input.remarks       !== undefined) patch.remarks         = input.remarks       ?? null;

    const { error } = await untypedSupabase
      .from('leave_quota_rules')
      .update(patch)
      .eq('id', ruleId)
      .eq('company_id', companyId);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update quota rule.' };
  }
}

/** Toggles the active status of a quota rule (prefer over hard delete). */
export async function toggleLeaveQuotaRule(
  companyId: string,
  ruleId: string,
  actorId: string,
  isActive: boolean,
): Promise<{ error: string | null }> {
  return updateLeaveQuotaRule(companyId, ruleId, actorId, { isActive });
}

/** Permanently removes a quota rule. Prefer toggleLeaveQuotaRule for audit trails. */
export async function deleteLeaveQuotaRule(
  companyId: string,
  ruleId: string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await untypedSupabase
      .from('leave_quota_rules')
      .delete()
      .eq('id', ruleId)
      .eq('company_id', companyId);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to delete quota rule.' };
  }
}

// ─── Quota Availability Check ─────────────────────────────────────────────────

/**
 * Checks quota availability for a proposed leave request.
 *
 * Returns the availability across the most-restrictive matching rule for
 * every day in the requested date range.  Used by the Leave Request form to
 * show quota warnings before the employee submits.
 *
 * On any unexpected error the function returns a "no rule" state so that
 * form submission is never accidentally blocked by a transient error.
 */
export async function checkLeaveQuotaAvailability(
  companyId:  string,
  employeeId: string,
  leaveTypeId: string,
  startDate:  string,
  endDate:    string,
  dayPart:    'full_day' | 'half_day_morning' | 'half_day_afternoon',
  opts?: { excludeRequestId?: string },
): Promise<LeaveQuotaAvailability> {
  const noRule: LeaveQuotaAvailability = {
    hasRule: false, isQuotaFull: false, isQuotaNearlyFull: false,
    available: Infinity, used: 0, max: 0,
    ruleName: null, blockedDates: [], message: null,
  };

  try {
    // ── 1. Employee scope ────────────────────────────────────────────────────
    const { data: empRow } = await untypedSupabase
      .from('employees')
      .select('branch_id, department_id')
      .eq('id', employeeId)
      .maybeSingle();

    const empBranchId: string | null = empRow?.branch_id    ? String(empRow.branch_id)    : null;
    const empDeptId:   string | null = empRow?.department_id ? String(empRow.department_id) : null;

    // ── 2. Active quota rules for this leave type ────────────────────────────
    const { data: rules, error: rulesErr } = await listLeaveQuotaRules(companyId, {
      activeOnly: true, leaveTypeId,
    });
    if (rulesErr || !rules.length) return noRule;

    // ── 3. Filter rules that apply to this employee's scope ──────────────────
    const matchingRules = rules.filter(r => {
      if (r.branchId     && r.branchId     !== empBranchId) return false;
      if (r.departmentId && r.departmentId !== empDeptId)   return false;
      return true;
    });
    if (!matchingRules.length) return noRule;

    // ── 4. Map each date to the best applicable rule and its quota window ────
    const effectiveEnd = dayPart === 'full_day' ? endDate : startDate;
    const dates = eachDate(startDate, effectiveEnd);

    // windowKey → { rule, windowStart, windowEnd }
    type WindowMeta = { rule: LeaveQuotaRule; windowStart: string; windowEnd: string };
    const windowMap = new Map<string, WindowMeta>();
    const dateToWindowKey = new Map<string, string>();

    for (const date of dates) {
      const covering = matchingRules
        .filter(r => isDateInRule(date, r))
        // Sort: more specific first; tie-break on stricter (lower) max_requests
        .sort((a, b) => {
          const sd = ruleSpecificity(b) - ruleSpecificity(a);
          return sd !== 0 ? sd : a.maxRequests - b.maxRequests;
        });
      if (!covering.length) continue;

      const best = covering[0];
      const wk = getWindowKey(date, best);
      dateToWindowKey.set(date, wk);
      if (!windowMap.has(wk)) {
        windowMap.set(wk, { rule: best, ...getWindowRange(date, best) });
      }
    }
    if (!windowMap.size) return noRule;

    // ── 5. Fetch existing leave requests for all relevant windows ────────────
    const allStarts = [...windowMap.values()].map(w => w.windowStart);
    const allEnds   = [...windowMap.values()].map(w => w.windowEnd);
    const overallStart = allStarts.reduce((a, b) => (a < b ? a : b));
    const overallEnd   = allEnds.reduce((a, b)   => (a > b ? a : b));

    const anyCountsPending = [...windowMap.values()].some(w => w.rule.countPending);
    const statuses = ['approved', ...(anyCountsPending ? ['pending'] : [])];

    let existingQ = untypedSupabase
      .from('leave_requests')
      .select('id, start_date, end_date, day_part, employee_id, status')
      .eq('company_id', companyId)
      .eq('leave_type_id', leaveTypeId)
      .in('status', statuses)
      .lte('start_date', overallEnd)
      .gte('end_date', overallStart);
    if (opts?.excludeRequestId) {
      existingQ = existingQ.neq('id', opts.excludeRequestId);
    }

    const { data: existingLeaves } = await existingQ;

    // ── 6. Fetch branch/dept for all employees on those leaves ───────────────
    const leaveEmpIds = [
      ...new Set(
        (existingLeaves ?? []).map((l: Record<string, unknown>) => String(l.employee_id)),
      ),
    ];
    const empScopeMap = new Map<string, { branchId: string | null; deptId: string | null }>();
    if (leaveEmpIds.length) {
      const { data: empRows } = await untypedSupabase
        .from('employees')
        .select('id, branch_id, department_id')
        .in('id', leaveEmpIds);
      for (const e of (empRows ?? []) as Record<string, unknown>[]) {
        empScopeMap.set(String(e.id), {
          branchId: e.branch_id    ? String(e.branch_id)    : null,
          deptId:   e.department_id ? String(e.department_id) : null,
        });
      }
    }

    // ── 7. Compute usage per window ──────────────────────────────────────────
    const windowUsage = new Map<string, number>();

    for (const [wk, { rule, windowStart, windowEnd }] of windowMap.entries()) {
      const relevantStatuses = rule.countPending
        ? ['approved', 'pending']
        : ['approved'];

      let usage = 0;
      for (const leave of (existingLeaves ?? []) as Record<string, unknown>[]) {
        if (!relevantStatuses.includes(String(leave.status ?? ''))) continue;

        const ls = String(leave.start_date ?? '');
        const le = String(leave.end_date   ?? '');
        if (ls > windowEnd || le < windowStart) continue;

        // Scope filter
        const leaveEmpId = String(leave.employee_id ?? '');
        const scope = empScopeMap.get(leaveEmpId);
        if (rule.branchId     && scope?.branchId !== rule.branchId)     continue;
        if (rule.departmentId && scope?.deptId   !== rule.departmentId) continue;

        const ldp = String(leave.day_part ?? 'full_day');
        usage += ldp === 'full_day' ? 1.0 : rule.halfDayWeight;
      }
      windowUsage.set(wk, usage);
    }

    // ── 8. Evaluate worst-case availability across all dates ─────────────────
    const newContrib = dayPart === 'full_day' ? 1.0 : 0.5;

    let worstAvailable  = Infinity;
    let worstUsed       = 0;
    let worstMax        = 0;
    let worstRuleName: string | null = null;
    const blockedDates: string[] = [];

    for (const date of dates) {
      const wk = dateToWindowKey.get(date);
      if (!wk) continue;
      const meta = windowMap.get(wk);
      if (!meta) continue;

      const usage     = windowUsage.get(wk) ?? 0;
      const available = Math.max(0, meta.rule.maxRequests - usage);
      if (available < newContrib) blockedDates.push(date);

      if (available < worstAvailable) {
        worstAvailable = available;
        worstUsed      = usage;
        worstMax       = meta.rule.maxRequests;
        worstRuleName  = meta.rule.ruleName;
      }
    }

    if (worstAvailable === Infinity) return noRule; // no date was covered

    const isQuotaFull       = blockedDates.length > 0;
    const isQuotaNearlyFull = !isQuotaFull && worstAvailable > 0 && worstAvailable <= 1;

    let message: string | null = null;
    if (isQuotaFull) {
      const dLabel = blockedDates.length === 1
        ? blockedDates[0]
        : `${blockedDates.length} date(s) in this range`;
      message = `Leave quota is full for ${dLabel}. Please select another date or contact HR/GM.`;
    } else if (isQuotaNearlyFull) {
      message = `Only ${worstAvailable} leave slot${worstAvailable === 1 ? '' : 's'} remaining for this period.`;
    }

    return {
      hasRule: true,
      isQuotaFull,
      isQuotaNearlyFull,
      available: worstAvailable,
      used: worstUsed,
      max: worstMax,
      ruleName: worstRuleName,
      blockedDates,
      message,
    };
  } catch (e) {
    // Do not block submission on transient errors; log for diagnostics.
    console.error('[leaveQuotaService] checkLeaveQuotaAvailability error:', e);
    return noRule;
  }
}
