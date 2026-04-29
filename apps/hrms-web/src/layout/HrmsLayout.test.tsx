import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRole, User } from '@/types';
import HrmsLayout from './HrmsLayout';
import { hrmsNavItems } from './navItems';

const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
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

function renderLayout(role: AppRole, initialPath = '/leave') {
  const user = makeUser(role);
  mockUseAuth.mockReturnValue({
    user,
    logout: vi.fn(),
    hasRole: (roles: AppRole[]) => role === 'super_admin' || roles.includes(role),
  });

  render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Routes>
        <Route element={<HrmsLayout />}>
          <Route path="*" element={<div>Route content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('HrmsLayout', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('keeps navigation limited to HRMS routes', () => {
    expect(hrmsNavItems.map((item) => item.path)).toEqual([
      '/leave',
      '/approvals',
      '/appraisals',
      '/announcements',
      '/profile',
      '/attendance',
      '/leave/calendar',
      '/employees',
      '/payroll',
      '/settings',
      '/approval-flows',
    ]);
  });

  it('shows self-service navigation for an accounts user and hides admin-only items', () => {
    renderLayout('accounts');

    expect(screen.getByRole('link', { name: 'Leave' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Employees' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Payroll' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Approval Flows' })).not.toBeInTheDocument();
  });

  it('shows workforce and administration navigation for a company admin', () => {
    renderLayout('company_admin', '/settings');

    expect(screen.getByRole('link', { name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payroll' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Approval Flows' })).toBeInTheDocument();
  });
});