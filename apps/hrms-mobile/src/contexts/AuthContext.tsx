import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User }                            from '@supabase/supabase-js';
import { supabase }                                      from '@flc/supabase';
import type { Employee, AppRole, EmployeeStatus }        from '@flc/types';

interface AuthContextValue {
  session:  Session | null;
  user:     User | null;
  employee: Employee | null;
  loading:  boolean;
  signIn:   (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut:  () => Promise<void>;
  refreshEmployee: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_SELECT =
  'id, email, name, role, company_id, branch_id, status, staff_code, ic_no, contact_no, ' +
  'join_date, resign_date, avatar_url, employee_id, department_id, job_title_id, ' +
  'department:departments!profiles_department_id_fkey(name), job_title:job_titles!profiles_job_title_id_fkey(name)';
const DIRECTORY_EMPLOYEE_SELECT =
  'id, company_id, branch_id, manager_employee_id, primary_role, status, staff_code, name, ' +
  'work_email, personal_email, ic_no, contact_no, join_date, resign_date, avatar_url, ' +
  'department_id, job_title_id, department:departments!employees_department_id_fkey(name), ' +
  'job_title:job_titles!employees_job_title_id_fkey(name)';

function rowToDirectoryEmployee(row: Record<string, unknown>): Employee {
  return {
    id:             String(row.id ?? ''),
    email:          String(row.work_email ?? row.personal_email ?? ''),
    name:           String(row.name ?? ''),
    role:           (row.primary_role as AppRole) ?? 'analyst',
    companyId:      String(row.company_id ?? ''),
    branchId:       row.branch_id ? String(row.branch_id) : undefined,
    managerId:      row.manager_employee_id ? String(row.manager_employee_id) : undefined,
    staffCode:      row.staff_code ? String(row.staff_code) : undefined,
    icNo:           row.ic_no ? String(row.ic_no) : undefined,
    contactNo:      row.contact_no ? String(row.contact_no) : undefined,
    joinDate:       row.join_date ? String(row.join_date) : undefined,
    resignDate:     row.resign_date ? String(row.resign_date) : undefined,
    status:         (row.status as EmployeeStatus) ?? 'active',
    avatarUrl:      row.avatar_url ? String(row.avatar_url) : undefined,
    departmentId:   row.department_id ? String(row.department_id) : undefined,
    departmentName: row.department ? String((row.department as Record<string, unknown>)?.name ?? '') : undefined,
    jobTitleId:     row.job_title_id ? String(row.job_title_id) : undefined,
    jobTitleName:   row.job_title ? String((row.job_title as Record<string, unknown>)?.name ?? '') : undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,  setSession]  = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) void loadEmployee(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) void loadEmployee(session.user.id);
      else setEmployee(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadEmployee(userId: string) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();

    const profileRow = profileData as unknown as Record<string, unknown> | null;
    if (!profileRow) {
      setEmployee(null);
      return;
    }

    const linkedEmployeeId = profileRow.employee_id ? String(profileRow.employee_id) : null;
    if (linkedEmployeeId) {
      const { data: workforceRow, error: workforceError } = await supabase
        .from('employees')
        .select(DIRECTORY_EMPLOYEE_SELECT)
        .eq('id', linkedEmployeeId)
        .maybeSingle();

      if (!workforceError && workforceRow) {
        setEmployee(rowToDirectoryEmployee(workforceRow as unknown as Record<string, unknown>));
        return;
      }
    }

    setEmployee(null);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setEmployee(null);
  }

  async function refreshEmployee() {
    if (!session?.user?.id) return;
    await loadEmployee(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, employee, loading, signIn, signOut, refreshEmployee }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
