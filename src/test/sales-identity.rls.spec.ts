import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const live = process.env.RLS_E2E === '1' ? describe : describe.skip;
const options = { auth: { persistSession: false }, realtime: { transport: WebSocket as never } };

live('Employee-backed Sales targets and reports', () => {
  let admin: SupabaseClient;
  let actor: SupabaseClient;
  let other: SupabaseClient;
  let company = '';
  let otherCompany = '';
  let actorId = '';
  let original: Record<string, unknown>;
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const branch = `SI-${suffix}`;
  const branch2 = `S2-${suffix}`;
  const employee = crypto.randomUUID();
  const employee2 = crypto.randomUUID();
  const foreignEmployee = crypto.randomUUID();
  const advisor = crypto.randomUUID();
  const orders: string[] = [];
  const profiles: string[] = [];
  const vehicles: string[] = [];
  const commissionRules: string[] = [];
  const commissionRecords: string[] = [];
  const year = 2035;
  const month = 2;
  const target = (id: string, code = branch) => ({ company_id: company, employee_id: id,
    salesman_name: 'Untrusted label', branch_code: code, period_year: year, period_month: month,
    target_units: 10, target_revenue: 100 });
  async function insert(table: string, fields: Record<string, unknown>) {
    const result = await admin.from(table).insert(fields).select('id').single();
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    return String(result.data.id);
  }
  async function actuals(client = actor, companyId = company) {
    const { data, error } = await client.rpc('salesman_actuals', { p_company_id: companyId, p_year: year, p_month: month });
    expect(error).toBeNull();
    return data as Record<string, unknown>[];
  }
  async function report(extra = {}) {
    const { data, error } = await actor.rpc('auto_aging_report', { p_report_type: 'salesman_performance', p_model: suffix, ...extra });
    expect(error).toBeNull();
    return data as { rows: Record<string, unknown>[]; total_count: number };
  }

  beforeAll(async () => {
    const url = process.env.VITE_SUPABASE_URL!;
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
    actor = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, options);
    other = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, options);
    const a = await actor.auth.signInWithPassword({ email: process.env.RLS_USER_A_EMAIL!, password: process.env.RLS_USER_A_PASSWORD! });
    const b = await other.auth.signInWithPassword({ email: process.env.RLS_USER_B_EMAIL!, password: process.env.RLS_USER_B_PASSWORD! });
    if (a.error || b.error) throw new Error('Fixture sign in failed');
    actorId = a.data.user!.id;
    const pa = await admin.from('profiles').select('company_id,role,access_scope').eq('id', actorId).single();
    const pb = await admin.from('profiles').select('company_id').eq('id', b.data.user!.id).single();
    original = pa.data!;
    company = pa.data!.company_id;
    otherCompany = pb.data!.company_id;
    expect(company).not.toBe(otherCompany);
    const elevated = await admin.from('profiles').update({ role: 'manager', access_scope: 'company' }).eq('id', actorId);
    expect(elevated.error).toBeNull();
    await insert('branches', { company_id: company, code: branch, name: branch });
    await insert('branches', { company_id: company, code: branch2, name: branch2 });
    for (const [id, tenant, code] of [[employee, company, `A-${suffix}`], [employee2, company, `B-${suffix}`], [foreignEmployee, otherCompany, `C-${suffix}`]]) {
      await insert('employees', { id, company_id: tenant, name: 'Same display name', staff_code: code, primary_role: 'sales', status: 'active' });
    }
    await insert('sales_advisors', { id: advisor, company_id: company, code: `A-${suffix}`, name: 'Old source label' });
    for (const [code, date, deleted] of [[branch, '2035-02-28', false], [branch2, '2035-02-01', false], [branch, '2035-03-01', false], [branch, '2035-02-01', true]] as const) {
      orders.push(await insert('sales_orders', { company_id: company, order_no: crypto.randomUUID(), salesman_id: advisor,
        salesman_name: 'Old source label', branch_code: code, booking_date: date, selling_price: 50, model: suffix, order_status: 'delivered', is_deleted: deleted }));
    }
    orders.push(await insert('sales_orders', { company_id: company, order_no: crypto.randomUUID(), salesman_name: 'Same display name', branch_code: branch, booking_date: '2035-02-01', model: suffix }));
    // Account-backed Vehicle attribution is independent from legacy Advisor IDs.
    for (const id of [employee, employee2, foreignEmployee]) {
      const user = await admin.auth.admin.createUser({ email: `si-${id}@rls.test`, password: 'Test1234!', email_confirm: true });
      if (user.error) throw user.error;
      const profileId = user.data.user.id;
      profiles.push(profileId);
      const linked = await admin.from('profiles').update({ company_id: id === foreignEmployee ? otherCompany : company, employee_id: id }).eq('id', profileId);
      expect(linked.error).toBeNull();
    }
    for (const [profile, code] of [[profiles[0], branch], [profiles[0], branch], [profiles[0], branch2], [profiles[1], branch], [null, branch], [null, branch], [profiles[2], branch]] as const) {
      vehicles.push(await insert('vehicles', { company_id: company, chassis_no: crypto.randomUUID(), model: suffix,
        branch_code: code, salesman_id: profile, salesman_name: 'Same display name' }));
    }
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    if (commissionRecords.length) await admin.from('audit_logs').delete().eq('entity_type', 'commission_record').in('entity_id', commissionRecords);
    if (commissionRecords.length) await admin.from('commission_records').delete().in('id', commissionRecords);
    if (commissionRules.length) await admin.from('commission_rules').delete().in('id', commissionRules);
    await admin.from('salesman_targets').delete().eq('company_id', company).in('branch_code', [branch, branch2]);
    if (orders.length) await admin.from('sales_orders').delete().in('id', orders);
    if (vehicles.length) await admin.from('vehicles').delete().in('id', vehicles);
    for (const id of profiles) await admin.auth.admin.deleteUser(id);
    await admin.from('sales_advisors').delete().eq('id', advisor);
    await admin.from('employees').delete().in('id', [employee, employee2, foreignEmployee]);
    await admin.from('branches').delete().eq('company_id', company).in('code', [branch, branch2]);
    if (original) await admin.from('profiles').update(original).eq('id', actorId);
  });

  it.skipIf(!process.env.RLS_DB_CONTAINER)('executes the reconciliation summary with real company scoping', () => {
    const container = process.env.RLS_DB_CONTAINER!;
    // The SQL regression harness is restricted to the disposable readiness stack.
    expect(container.startsWith('supabase_db_ubs-readiness-')).toBe(true);
    const pack = readFileSync('scripts/business-core-identity-reconciliation.sql', 'utf8');
    const summary = pack.slice(0, pack.indexOf('-- 2.'));
    const counts = (scope?: string) => {
      const sql = scope ? summary.split('__COMPANY_ID__').join(scope.replace(/'/g, "''")) : summary;
      const output = execFileSync('docker', ['exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        input: `BEGIN READ ONLY; SET LOCAL statement_timeout = '10s'; ${sql} ROLLBACK;`, encoding: 'utf8',
      });
      return new Map(output.trim().split('\n').map(line => {
        const [key, count] = line.split('|');
        return [key, Number(count)];
      }));
    };
    const all = counts();
    const own = counts(company);
    const absent = counts(`absent-${suffix}`);
    expect(all.get('profiles_without_employee_link')).toBeGreaterThan(own.get('profiles_without_employee_link')!);
    expect(absent.size).toBe(all.size);
    expect([...absent.values()].every(count => count === 0)).toBe(true);
  });

  it('supports same-name Employees and branch/period uniqueness, deriving labels on the server', async () => {
    for (const row of [target(employee), target(employee2), target(employee, branch2)]) {
      const result = await actor.from('salesman_targets').upsert(row, { onConflict: 'company_id,employee_id,branch_code,period_year,period_month' }).select().single();
      expect(result.error).toBeNull();
      expect(result.data.salesman_name).toBe('Same display name');
    }
    const rows = await actuals();
    const own = rows.find(r => r.employee_id === employee && r.branch_code === branch)!;
    expect(own.total_deals).toBe(1);
    expect(own.closed_deals).toBe(1);
    expect(own.total_revenue).toBe(50);
    expect(own.target_units).toBe(10);
    expect(rows.find(r => r.employee_id === employee2)?.total_deals).toBe(0);
    expect(rows.find(r => r.employee_id === employee && r.branch_code === branch2)?.total_deals).toBe(1);
  });

  it('keeps name-only targets and orders unresolved even when a name matches', async () => {
    const result = await admin.from('salesman_targets').insert({ ...target(employee), employee_id: null, salesman_name: 'Same display name' });
    expect(result.error).toBeNull();
    const rows = await actuals();
    const unresolved = rows.filter(r => r.employee_id === null);
    expect(unresolved.some(r => String(r.identity_key).startsWith('target:') && r.total_deals === 0)).toBe(true);
    expect(unresolved.some(r => String(r.identity_key).startsWith('order:') && r.target_units === null)).toBe(true);
  });

  it('prefers canonical migrated Deal ownership over the legacy Advisor code', async () => {
    const sourceId = orders[0];
    await insert('deals', { id: sourceId, company_id: company, deal_no: `SI-${suffix}`, customer_name: 'Synthetic customer', sales_advisor_employee_id: employee2 });
    try {
      const rows = await actuals();
      expect(rows.find(r => r.employee_id === employee2)?.total_deals).toBe(1);
      expect(rows.find(r => r.employee_id === employee && r.branch_code === branch)?.total_deals).toBe(0);
    } finally {
      expect((await admin.from('deals').delete().eq('id', sourceId)).error).toBeNull();
    }
  });

  it('rejects cross-company identity, invalid branch, negative targets and clearing canonical identity', async () => {
    for (const row of [target(foreignEmployee), target(employee, 'nonexistent'), { ...target(employee), target_units: -1 }]) {
      const result = await actor.from('salesman_targets').insert(row);
      expect(result.error?.code).toBe('23514');
    }
    const clear = await actor.from('salesman_targets').update({ employee_id: null }).eq('employee_id', employee).eq('company_id', company);
    expect(clear.error?.code).toBe('23514');
  });

  it('keeps target identity through rename and concurrent upserts', async () => {
    expect((await admin.from('employees').update({ name: 'Renamed Employee' }).eq('id', employee)).error).toBeNull();
    const changes = await Promise.all([11,12].map(units => actor.from('salesman_targets').upsert({ ...target(employee), target_units: units }, { onConflict: 'company_id,employee_id,branch_code,period_year,period_month' })));
    expect(changes.every(r => r.error === null)).toBe(true);
    const rows = (await actuals()).filter(r => r.employee_id === employee && r.branch_code === branch);
    expect(rows).toHaveLength(1);
    expect(rows[0].salesman_name).toBe('Renamed Employee');
    expect([11,12]).toContain(rows[0].target_units);
  });

  it('does not expose or mutate another tenant through the new RPC or target table', async () => {
    expect(await actuals(other, company)).toEqual([]);
    const read = await other.from('salesman_targets').select('id').eq('company_id', company);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    expect((await other.from('salesman_targets').insert(target(employee))).error).not.toBeNull();
    const change = await other.from('salesman_targets').update({ target_units: 999 }).eq('company_id', company).select();
    expect(change.data).toEqual([]);
    const removed = await other.from('salesman_targets').delete().eq('company_id', company).select();
    expect(removed.data).toEqual([]);
  });

  it('groups Vehicle performance by Employee and branch, with one row per unresolved source', async () => {
    const result = await report();
    expect(result.total_count).toBe(6);
    expect(result.rows.reduce((total, r) => total + Number(r['Total Vehicles']), 0)).toBe(7);
    expect(result.rows.filter(r => r['Employee ID'] === employee)).toHaveLength(2);
    expect(result.rows.filter(r => r['Employee ID'] === employee2)).toHaveLength(1);
    expect(result.rows.filter(r => r['Employee ID'] === null)).toHaveLength(3);
    expect(result.rows.some(r => r['Employee ID'] === foreignEmployee)).toBe(false);
    expect(result.rows.find(r => r['Employee ID'] === employee)?.Salesman).toBe('Renamed Employee');
    const first = await report({ p_limit: 1, p_offset: 0 });
    const next = await report({ p_limit: 1, p_offset: 1 });
    expect(first.total_count).toBe(6);
    expect(first.rows[0]).not.toEqual(next.rows[0]);
    expect((await report({ p_branch: branch2 })).total_count).toBe(1);
    const foreign = await other.rpc('auto_aging_report', { p_report_type: 'salesman_performance', p_model: suffix });
    expect(foreign.data.rows).toEqual([]);
  });

  it('denies ordinary-user target writes while allowing manager deletion', async () => {
    expect((await admin.from('profiles').update({ role: 'creator_updater' }).eq('id', actorId)).error).toBeNull();
    expect((await actor.from('salesman_targets').insert({ ...target(employee), period_year: year + 1 })).error).not.toBeNull();
    expect((await admin.from('profiles').update({ role: 'manager' }).eq('id', actorId)).error).toBeNull();
    const result = await actor.from('salesman_targets').delete().eq('employee_id', employee2).eq('company_id', company).select();
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it('keeps Commission identities distinct when Employee names match and rejects cross-company links', async () => {
    expect((await admin.from('employees').update({ name: 'Same display name' }).eq('id', employee)).error).toBeNull();
    const first = await admin.from('commission_rules').insert({
      company_id: company, employee_id: employee, salesman_name: 'Untrusted label',
      rule_name: 'Commission ID fixture', amount: 100,
    }).select('id,employee_id,salesman_name').single();
    const second = await admin.from('commission_rules').insert({
      company_id: company, employee_id: employee2, salesman_name: 'Untrusted label',
      rule_name: 'Commission ID fixture', amount: 100,
    }).select('id,employee_id,salesman_name').single();
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    commissionRules.push(first.data!.id, second.data!.id);
    expect(first.data!.employee_id).toBe(employee);
    expect(second.data!.employee_id).toBe(employee2);
    expect(first.data!.salesman_name).toBe('Same display name');
    expect(second.data!.salesman_name).toBe('Same display name');

    const unresolved = await admin.from('commission_rules').insert({
      company_id: company, salesman_name: 'Same display name',
      rule_name: 'Legacy commission fixture', amount: 100,
    }).select('id,employee_id').single();
    expect(unresolved.error).toBeNull();
    commissionRules.push(unresolved.data!.id);
    expect(unresolved.data!.employee_id).toBeNull();

    const record = await admin.from('commission_records').insert({
      company_id: company, vehicle_id: vehicles[0], chassis_no: 'Test chassis',
      employee_id: employee, salesman_name: 'Untrusted label', rule_id: first.data!.id,
      amount: 100, period: '2035-02',
    }).select('id,employee_id,salesman_name').single();
    expect(record.error).toBeNull();
    commissionRecords.push(record.data!.id);
    expect(record.data!.salesman_name).toBe('Same display name');

    const legacyRecord = await admin.from('commission_records').insert({
      company_id: company, chassis_no: 'Legacy test chassis', salesman_name: 'Same display name',
      amount: 100, period: '2035-02',
    }).select('id,employee_id').single();
    expect(legacyRecord.error).toBeNull();
    commissionRecords.push(legacyRecord.data!.id);
    expect(legacyRecord.data!.employee_id).toBeNull();

    const wrongRule = await admin.from('commission_rules').insert({
      company_id: company, employee_id: foreignEmployee, rule_name: 'Wrong tenant', amount: 10,
    });
    const wrongRecord = await admin.from('commission_records').insert({
      company_id: company, employee_id: foreignEmployee, chassis_no: 'Wrong tenant',
      salesman_name: 'Untrusted label', amount: 10, period: '2035-02',
    });
    expect(wrongRule.error?.code).toBe('23514');
    expect(wrongRecord.error?.code).toBe('23514');

    const clear = await admin.from('commission_rules').update({ employee_id: null }).eq('id', first.data!.id);
    expect(clear.error?.code).toBe('23514');
    const foreignRead = await other.from('commission_rules').select('id').in('id', commissionRules);
    expect(foreignRead.data).toEqual([]);
    const foreignRecords = await other.from('commission_records').select('id').in('id', commissionRecords);
    expect(foreignRecords.data).toEqual([]);
  });

  it('calculates canonical earnings once, audits them and guards approval/payment transitions', async () => {
    expect((await admin.from('profiles').update({ role: 'company_admin' }).eq('id', actorId)).error).toBeNull();
    expect((await admin.from('vehicles').update({ delivery_date: '2035-02-10', bg_to_delivery: 10 }).eq('id', vehicles[1])).error).toBeNull();

    const first = await actor.rpc('calculate_commissions', { p_company_id: company, p_period: '2035-02' });
    expect(first.error).toBeNull();
    expect(first.data).toBe(1);
    const again = await actor.rpc('calculate_commissions', { p_company_id: company, p_period: '2035-02' });
    expect(again).toMatchObject({ data: 0, error: null });

    const created = await admin.from('commission_records').select('id,employee_id,calculation_key,source_snapshot,status,amount')
      .eq('company_id', company).eq('vehicle_id', vehicles[1]).eq('rule_id', commissionRules[0]).single();
    expect(created.error).toBeNull();
    commissionRecords.push(created.data!.id);
    expect(created.data).toMatchObject({ employee_id: employee, status: 'pending', amount: 100 });
    expect(created.data!.calculation_key).toBe(`${vehicles[1]}:${commissionRules[0]}`);
    expect(created.data!.source_snapshot).toMatchObject({ employee_id: employee, delivery_date: '2035-02-10' });

    const noDirectInsert = await actor.from('commission_records').insert({
      company_id: company, employee_id: employee, chassis_no: 'Forged', salesman_name: 'Forged',
      amount: 999, period: '2035-02',
    });
    expect(noDirectInsert.error).not.toBeNull();
    const directUpdate = await actor.from('commission_records').update({ status: 'paid' }).eq('id', created.data!.id).select('id');
    expect(directUpdate.data).toEqual([]);
    const changedAmount = await admin.from('commission_records').update({ amount: 999 }).eq('id', created.data!.id);
    expect(changedAmount.error?.code).toBe('23514');

    const approve = await actor.rpc('advance_commission_record', {
      p_company_id: company, p_record_id: created.data!.id, p_expected_status: 'pending', p_next_status: 'approved',
    });
    expect(approve.error).toBeNull();
    const stale = await actor.rpc('advance_commission_record', {
      p_company_id: company, p_record_id: created.data!.id, p_expected_status: 'pending', p_next_status: 'approved',
    });
    expect(stale.error?.code).toBe('PT409');
    const paid = await actor.rpc('advance_commission_record', {
      p_company_id: company, p_record_id: created.data!.id, p_expected_status: 'approved', p_next_status: 'paid',
    });
    expect(paid.error).toBeNull();
    const final = await admin.from('commission_records').select('status,amount').eq('id', created.data!.id).single();
    expect(final.data).toMatchObject({ status: 'paid', amount: 100 });
    const audit = await admin.from('audit_logs').select('action').eq('entity_type', 'commission_record').eq('entity_id', created.data!.id);
    expect(audit.data).toHaveLength(3);

    expect((await other.rpc('calculate_commissions', { p_company_id: company, p_period: '2035-02' })).error?.code).toBe('42501');
    expect((await actor.rpc('calculate_commissions', { p_company_id: company, p_period: '2035-13' })).error?.code).toBe('22023');
  });
});
