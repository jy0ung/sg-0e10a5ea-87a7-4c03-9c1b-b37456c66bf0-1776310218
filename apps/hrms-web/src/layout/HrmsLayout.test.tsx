import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HRMS_NAV_ROUTES } from '@flc/shell';
import type { AppRole, User } from '@/types';
import HrmsLayout from './HrmsLayout';
import { hrmsNavItems } from './navItems';

const mockUseAuth = vi.fn();
const mockUseHrmsAccess = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useHrmsAccess', () => ({
  useHrmsAccess: () => mockUseHrmsAccess(),
}));

vi.mock('@/services/hrmsService', () => ({
  listAppraisals: vi.fn(async () => ({ data: [], error: null })),
  listLeaveRequests: vi.fn(async () => ({ data: [], error: null })),
  listPayrollRuns: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}));

function makeUser(role: AppRole): User {
  return {
    id: 'user-1',
    email: 'hrms@example.com',
    name: 'HRMS Tester',
    role,
    companyId: 'company-1',
    accessScope: 'company',
  };
}

const ADMIN_ROLES: AppRole[] = ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'];
const SELF_SERVICE_ROUTES = new Set(['leave', 'approvals', 'appraisals', 'announcements', 'profile']);

function renderLayout(role: AppRole, initialPath = '/leave') {
  const user = makeUser(role);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockUseAuth.mockReturnValue({
    user,
    logout: vi.fn(),
    hasRole: (roles: AppRole[]) => role === 'super_admin' || roles.includes(role),
  });

  const isAdmin = ADMIN_ROLES.includes(role);
  mockUseHrmsAccess.mockReturnValue({
    canAccessRoute: (route: string) => isAdmin || SELF_SERVICE_ROUTES.has(route),
    primaryRoleLabel: isAdmin ? 'HR Manager' : 'Staff',
    loading: false,
    error: null,
    refresh: vi.fn(),
    roles: [],
    roleIds: [],
    roleCodes: [],
    roleNames: [],
    primaryRole: null,
    hasSelfServiceAccess: true,
    canApproveRequests: isAdmin,
    canAccessAttendance: isAdmin,
    canManageAttendance: isAdmin,
    canAccessEmployees: isAdmin,
    canManageEmployees: isAdmin,
    canAccessPayroll: isAdmin,
    canAccessSettings: isAdmin,
    canAccessAnnouncements: isAdmin,
    canManageAnnouncements: isAdmin,
    canAccessAppraisals: true,
    canViewPii: isAdmin,
    matchesApproverRole: () => false,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route element={<HrmsLayout />}>
            <Route path="*" element={<div>Route content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HrmsLayout', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseHrmsAccess.mockReset();
  });

  it('keeps navigation limited to HRMS registry routes', () => {
    expect(hrmsNavItems.map((item) => item.path)).toEqual(HRMS_NAV_ROUTES.map((item) => item.path));
    expect(hrmsNavItems.map((item) => item.label)).toEqual(HRMS_NAV_ROUTES.map((item) => item.label));
  });

  it('shows self-service navigation for an accounts user and hides admin-only items', () => {
    renderLayout('accounts');

    expect(screen.getByRole('link', { name: 'My Leave' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Approval Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Team Leave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Employee Directory' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Payroll' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'HRMS Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Approval Flows' })).not.toBeInTheDocument();
  });

  it('shows workforce and administration navigation for a company admin', () => {
    renderLayout('company_admin', '/settings');

    expect(screen.getByRole('link', { name: 'Employee Directory' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team Leave' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payroll' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'HRMS Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Approval Flows' })).not.toBeInTheDocument();
  });
});
