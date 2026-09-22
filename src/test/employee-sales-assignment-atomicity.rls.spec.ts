import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const describeIfLive = process.env.RLS_E2E === '1' ? describe : describe.skip;
const password = 'Test1234!';

function options(storageKey: string): Parameters<typeof createClient>[2] {
  return {
    auth: { persistSession: false, storageKey },
    realtime: { transport: WebSocket as never },
  };
}

describeIfLive('Employee role and Sales Advisor assignment atomicity', () => {
  let admin: SupabaseClient;
  let actor: SupabaseClient;
  let actorId = '';
  let companyA = '';
  let companyB = '';
  let originalRole = '';
  let originalScope = '';
  let branchA = '';
  let branchB = '';
  let departmentA = '';
  let departmentB = '';
  let jobTitleA = '';
  let jobTitleB = '';
  let managerA = '';
  let managerB = '';

  const employeeIds: string[] = [];

  const rpcCreate = async (
    employeeId: string,
    changes: Record<string, unknown>,
  ) => actor.rpc('mutate_employee_with_assignments', {
    p_company_id: companyA,
    p_employee_id: employeeId,
    p_create: true,
    p_changes: changes,
  });

  const rpcUpdate = async (
    employeeId: string,
    changes: Record<string, unknown>,
  ) => actor.rpc('mutate_employee_with_assignments', {
    p_company_id: companyA,
    p_employee_id: employeeId,
    p_create: false,
    p_changes: changes,
  });

  const trackId = () => {
    const id = crypto.randomUUID();
    employeeIds.push(id);
    return id;
  };

  async function fetchSalesAssignment(employeeId: string) {
    return admin
      .from('employee_module_assignments')
      .select('company_id, active, is_primary, effective_to')
      .eq('employee_id', employeeId)
      .eq('module_key', 'sales')
      .eq('assignment_role', 'sales_advisor')
      .maybeSingle();
  }

  beforeAll(async () => {
    const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!url || !anonKey || !serviceKey) {
      throw new Error('Live Employee assignment tests require Supabase URL, anon key, and service-role key.');
    }

    admin = createClient(url, serviceKey, options('employee-assignment-admin'));
    actor = createClient(url, anonKey, options('employee-assignment-actor'));
    const other = createClient(url, anonKey, options('employee-assignment-other'));

    const actorSignIn = await actor.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? password,
    });
    if (actorSignIn.error || !actorSignIn.data.user) {
      throw new Error(`Failed to sign in company A actor: ${actorSignIn.error?.message}`);
    }
    actorId = actorSignIn.data.user.id;

    const otherSignIn = await other.auth.signInWithPassword({
      email: process.env.RLS_USER_B_EMAIL ?? 'b@rls.test',
      password: process.env.RLS_USER_B_PASSWORD ?? password,
    });
    if (otherSignIn.error || !otherSignIn.data.user) {
      throw new Error(`Failed to sign in company B actor: ${otherSignIn.error?.message}`);
    }

    const actorProfile = await admin
      .from('profiles')
      .select('company_id, role, access_scope')
      .eq('id', actorId)
      .single();
    if (actorProfile.error || !actorProfile.data?.company_id) {
      throw new Error(`Company A Profile unavailable: ${actorProfile.error?.message}`);
    }

    const otherProfile = await admin
      .from('profiles')
      .select('company_id')
      .eq('id', otherSignIn.data.user.id)
      .single();
    if (otherProfile.error || !otherProfile.data?.company_id) {
      throw new Error(`Company B Profile unavailable: ${otherProfile.error?.message}`);
    }

    companyA = String(actorProfile.data.company_id);
    companyB = String(otherProfile.data.company_id);
    originalRole = String(actorProfile.data.role ?? 'creator_updater');
    originalScope = String(actorProfile.data.access_scope ?? 'self');
    if (companyA === companyB) throw new Error('Employee assignment test requires two companies.');

    const elevate = await admin
      .from('profiles')
      .update({ role: 'manager', access_scope: 'company' })
      .eq('id', actorId);
    if (elevate.error) throw new Error(`Failed to elevate test actor: ${elevate.error.message}`);

    await actor.auth.signOut({ scope: 'local' });
    const reSignIn = await actor.auth.signInWithPassword({
      email: process.env.RLS_USER_A_EMAIL ?? 'a@rls.test',
      password: process.env.RLS_USER_A_PASSWORD ?? password,
    });
    if (reSignIn.error) throw new Error(`Failed to refresh test actor session: ${reSignIn.error.message}`);

    const suffix = crypto.randomUUID().slice(0, 8);
    const branchRows = await Promise.all([
      admin.from('branches').insert({
        company_id: companyA,
        code: `AT-A-${suffix}`,
        name: `Atomic A ${suffix}`,
      }).select('id').single(),
      admin.from('branches').insert({
        company_id: companyB,
        code: `AT-B-${suffix}`,
        name: `Atomic B ${suffix}`,
      }).select('id').single(),
    ]);
    if (branchRows.some(result => result.error || !result.data?.id)) {
      throw new Error('Failed to create Branch fixtures.');
    }
    branchA = String(branchRows[0].data!.id);
    branchB = String(branchRows[1].data!.id);

    const departmentRows = await Promise.all([
      admin.from('departments').insert({
        company_id: companyA,
        name: `Atomic A ${suffix}`,
      }).select('id').single(),
      admin.from('departments').insert({
        company_id: companyB,
        name: `Atomic B ${suffix}`,
      }).select('id').single(),
    ]);
    if (departmentRows.some(result => result.error || !result.data?.id)) {
      throw new Error('Failed to create Department fixtures.');
    }
    departmentA = String(departmentRows[0].data!.id);
    departmentB = String(departmentRows[1].data!.id);

    const jobTitleRows = await Promise.all([
      admin.from('job_titles').insert({
        company_id: companyA,
        name: `Atomic A ${suffix}`,
        department_id: departmentA,
      }).select('id').single(),
      admin.from('job_titles').insert({
        company_id: companyB,
        name: `Atomic B ${suffix}`,
        department_id: departmentB,
      }).select('id').single(),
    ]);
    if (jobTitleRows.some(result => result.error || !result.data?.id)) {
      throw new Error('Failed to create Job Title fixtures.');
    }
    jobTitleA = String(jobTitleRows[0].data!.id);
    jobTitleB = String(jobTitleRows[1].data!.id);

    const managerRows = await Promise.all([
      admin.from('employees').insert({
        company_id: companyA,
        name: `Atomic Manager A ${suffix}`,
        primary_role: 'manager',
        status: 'active',
      }).select('id').single(),
      admin.from('employees').insert({
        company_id: companyB,
        name: `Atomic Manager B ${suffix}`,
        primary_role: 'manager',
        status: 'active',
      }).select('id').single(),
    ]);
    if (managerRows.some(result => result.error || !result.data?.id)) {
      throw new Error('Failed to create Manager fixtures.');
    }
    managerA = String(managerRows[0].data!.id);
    managerB = String(managerRows[1].data!.id);
    employeeIds.push(managerA, managerB);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;

    if (employeeIds.length > 0) {
      await admin.from('employee_module_assignments').delete().in('employee_id', employeeIds);
      await admin.from('employees').delete().in('id', employeeIds);
    }

    if (jobTitleA || jobTitleB) {
      await admin.from('job_titles').delete().in('id', [jobTitleA, jobTitleB].filter(Boolean));
    }
    if (departmentA || departmentB) {
      await admin.from('departments').delete().in('id', [departmentA, departmentB].filter(Boolean));
    }
    if (branchA || branchB) {
      await admin.from('branches').delete().in('id', [branchA, branchB].filter(Boolean));
    }

    if (actorId) {
      await admin
        .from('profiles')
        .update({ role: originalRole, access_scope: originalScope })
        .eq('id', actorId);
    }
  }, 60_000);

  it('creates a Sales Employee with one active canonical Sales Advisor assignment', async () => {
    const employeeId = trackId();
    const result = await rpcCreate(employeeId, {
      name: 'Atomic Sales Create',
      primary_role: 'sales',
      branch_id: branchA,
      manager_employee_id: managerA,
      department_id: departmentA,
      job_title_id: jobTitleA,
      staff_code: `ASC-${crypto.randomUUID().slice(0, 8)}`,
      status: 'active',
    });

    expect(result.error).toBeNull();

    const employee = await admin
      .from('employees')
      .select('company_id, primary_role, branch_id, manager_employee_id, department_id, job_title_id')
      .eq('id', employeeId)
      .single();
    expect(employee.error).toBeNull();
    expect(employee.data).toMatchObject({
      company_id: companyA,
      primary_role: 'sales',
      branch_id: branchA,
      manager_employee_id: managerA,
      department_id: departmentA,
      job_title_id: jobTitleA,
    });

    const assignment = await fetchSalesAssignment(employeeId);
    expect(assignment.error).toBeNull();
    expect(assignment.data).toMatchObject({
      company_id: companyA,
      active: true,
      is_primary: true,
      effective_to: null,
    });
  });

  it('creates a non-Sales Employee without a Sales Advisor assignment', async () => {
    const employeeId = trackId();
    const result = await rpcCreate(employeeId, {
      name: 'Atomic Non Sales Create',
      primary_role: 'manager',
      status: 'active',
    });

    expect(result.error).toBeNull();

    const assignment = await fetchSalesAssignment(employeeId);
    expect(assignment.error).toBeNull();
    expect(assignment.data).toBeNull();
  });

  it('activates the Sales Advisor assignment in the same transaction when role changes to sales', async () => {
    const employeeId = trackId();
    expect((await rpcCreate(employeeId, {
      name: 'Atomic Promote',
      primary_role: 'manager',
      status: 'active',
    })).error).toBeNull();

    const update = await rpcUpdate(employeeId, { primary_role: 'sales' });
    expect(update.error).toBeNull();

    const employee = await admin.from('employees').select('primary_role').eq('id', employeeId).single();
    expect(employee.data?.primary_role).toBe('sales');

    const assignment = await fetchSalesAssignment(employeeId);
    expect(assignment.data).toMatchObject({ active: true, is_primary: true });
  });

  it('deactivates the Sales Advisor assignment in the same transaction when role leaves sales', async () => {
    const employeeId = trackId();
    expect((await rpcCreate(employeeId, {
      name: 'Atomic Demote',
      primary_role: 'sales',
      status: 'active',
    })).error).toBeNull();

    const update = await rpcUpdate(employeeId, { primary_role: 'manager' });
    expect(update.error).toBeNull();

    const employee = await admin.from('employees').select('primary_role').eq('id', employeeId).single();
    expect(employee.data?.primary_role).toBe('manager');

    const assignment = await fetchSalesAssignment(employeeId);
    expect(assignment.data?.active).toBe(false);
    expect(assignment.data?.is_primary).toBe(false);
    expect(assignment.data?.effective_to).not.toBeNull();
  });

  it('rolls back the Employee role when the assignment mutation fails after the Employee update', async () => {
    const employeeId = trackId();
    const seed = await admin.from('employees').insert({
      id: employeeId,
      company_id: companyA,
      name: 'Atomic Rollback',
      primary_role: 'manager',
      status: 'active',
    });
    expect(seed.error).toBeNull();

    const conflictingAssignment = await admin.from('employee_module_assignments').insert({
      company_id: companyB,
      employee_id: employeeId,
      module_key: 'sales',
      assignment_role: 'sales_advisor',
      is_primary: true,
      active: true,
      source: 'manual',
    });
    expect(conflictingAssignment.error).toBeNull();

    const update = await rpcUpdate(employeeId, { primary_role: 'sales' });
    expect(update.error).not.toBeNull();

    const employee = await admin.from('employees').select('primary_role').eq('id', employeeId).single();
    expect(employee.data?.primary_role).toBe('manager');

    const assignment = await fetchSalesAssignment(employeeId);
    expect(assignment.data?.company_id).toBe(companyB);
  });

  it('keeps the existing Sales Advisor creation command compatible and atomic', async () => {
    const result = await actor.rpc('create_sales_advisor_employee', {
      p_company_id: companyA,
      p_branch_id: branchA,
      p_staff_code: `LEG-${crypto.randomUUID().slice(0, 8)}`,
      p_name: 'Existing Sales Advisor Command',
      p_work_email: null,
      p_ic_no: null,
      p_contact_no: null,
      p_join_date: null,
    });

    expect(result.error).toBeNull();
    const employeeId = String(result.data);
    employeeIds.push(employeeId);

    const employee = await admin.from('employees').select('primary_role').eq('id', employeeId).single();
    expect(employee.data?.primary_role).toBe('sales');

    const assignment = await fetchSalesAssignment(employeeId);
    expect(assignment.data).toMatchObject({
      company_id: companyA,
      active: true,
      is_primary: true,
    });
  });

  it('rejects cross-company Branch, manager, Department, and Job Title references without creating an Employee', async () => {
    const attempts: Array<Record<string, unknown>> = [
      { branch_id: branchB },
      { manager_employee_id: managerB },
      { department_id: departmentB },
      { job_title_id: jobTitleB },
    ];

    for (const [index, extra] of attempts.entries()) {
      const employeeId = trackId();
      const result = await rpcCreate(employeeId, {
        name: `Cross Company ${index}`,
        primary_role: 'manager',
        status: 'active',
        ...extra,
      });

      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe('23514');

      const employee = await admin
        .from('employees')
        .select('id')
        .eq('id', employeeId)
        .maybeSingle();
      expect(employee.data).toBeNull();
    }
  });
});
