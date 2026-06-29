import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRole, BranchRecord } from '@/types';
import UserManagement from './UserManagement';

if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as typeof PointerEvent;
}
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

const authMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'admin-1',
    role: 'company_admin',
    company_id: 'company-1',
    companyId: 'company-1',
    branch_id: null,
  },
}));

const flcAuthMocks = vi.hoisted(() => ({
  deactivateUser: vi.fn(),
  deleteInvitedUser: vi.fn(),
  fetchRoleSections: vi.fn(),
  inviteUser: vi.fn(),
  listCompanyOptions: vi.fn(),
  listProfiles: vi.fn(),
  reactivateUser: vi.fn(),
  saveRoleSections: vi.fn(),
  updateProfile: vi.fn(),
}));

const masterDataMocks = vi.hoisted(() => ({
  getBranches: vi.fn(),
}));

const authServiceMocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}));

const platformServiceMocks = vi.hoisted(() => ({
  logPermissionChange: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authMocks.currentUser,
    hasRole: (roles: string[]) => roles.includes(authMocks.currentUser.role),
  }),
}));

vi.mock('@flc/auth', () => ({
  deactivateUser: flcAuthMocks.deactivateUser,
  deleteInvitedUser: flcAuthMocks.deleteInvitedUser,
  fetchRoleSections: flcAuthMocks.fetchRoleSections,
  inviteUser: flcAuthMocks.inviteUser,
  listCompanyOptions: flcAuthMocks.listCompanyOptions,
  listProfiles: flcAuthMocks.listProfiles,
  reactivateUser: flcAuthMocks.reactivateUser,
  saveRoleSections: flcAuthMocks.saveRoleSections,
  updateProfile: flcAuthMocks.updateProfile,
}));

vi.mock('@/services/masterDataService', () => ({
  getBranches: masterDataMocks.getBranches,
}));

vi.mock('@/services/authService', () => ({
  authService: authServiceMocks,
}));

vi.mock('@flc/platform-services', () => ({
  logPermissionChange: platformServiceMocks.logPermissionChange,
}));

vi.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<{
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    value?: string;
  }>({});

  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <SelectContext.Provider value={{ disabled, onValueChange, value }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const { value } = React.useContext(SelectContext);
      return <span>{value || placeholder}</span>;
    },
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { disabled, onValueChange, value } = React.useContext(SelectContext);
      return (
        <select
          disabled={disabled}
          value={value || ''}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
        >
          {children}
        </select>
      );
    },
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <option value={value}>{children}</option>
    ),
  };
});

vi.mock('@/components/ui/tabs', () => {
  const TabsContext = React.createContext<{
    onValueChange?: (value: string) => void;
    value?: string;
  }>({});

  return {
    Tabs: ({
      children,
      defaultValue,
      onValueChange,
      value,
    }: {
      children: React.ReactNode;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => {
      const [internalValue, setInternalValue] = React.useState(defaultValue);
      const currentValue = value ?? internalValue;
      const handleChange = (nextValue: string) => {
        setInternalValue(nextValue);
        onValueChange?.(nextValue);
      };

      return (
        <TabsContext.Provider value={{ onValueChange: handleChange, value: currentValue }}>
          <div>{children}</div>
        </TabsContext.Provider>
      );
    },
    TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
    TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const { onValueChange, value: currentValue } = React.useContext(TabsContext);
      return (
        <button
          aria-selected={currentValue === value}
          role="tab"
          type="button"
          onClick={() => onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const { value: currentValue } = React.useContext(TabsContext);
      return currentValue === value ? <div>{children}</div> : null;
    },
  };
});

vi.mock('@/components/admin/PermissionEditor', () => ({
  PermissionEditor: () => <div>Permission editor</div>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const branch: BranchRecord = {
  id: 'branch-1',
  code: 'KK',
  name: 'Kota Kinabalu',
  companyId: 'company-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function profile(overrides: Partial<Awaited<ReturnType<typeof flcAuthMocks.listProfiles>>['data'][number]> = {}) {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Manager',
    role: 'manager' as AppRole,
    company_id: 'company-1',
    branch_id: 'branch-1',
    employee_id: null,
    access_scope: 'branch',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    portal_access_only: false,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function chooseSelectOption(trigger: HTMLElement, optionName: string) {
  const option = within(trigger).getByRole('option', { name: optionName }) as HTMLOptionElement;
  fireEvent.change(trigger, { target: { value: option.value } });
}

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentUser = {
      id: 'admin-1',
      role: 'company_admin',
      company_id: 'company-1',
      companyId: 'company-1',
      branch_id: null,
    };
    flcAuthMocks.listProfiles.mockResolvedValue({
      data: [
        profile(),
        profile({
          id: 'user-2',
          email: 'bob@example.com',
          name: 'Bob Sales',
          role: 'sales',
          access_scope: 'self',
        }),
      ],
      error: null,
    });
    flcAuthMocks.listCompanyOptions.mockResolvedValue({
      data: [{ id: 'company-1', name: 'FLC Sabah' }],
      error: null,
    });
    flcAuthMocks.inviteUser.mockResolvedValue({
      error: null,
      inviteLink: 'http://localhost/signup?token=abc',
      emailDeliveryStatus: 'link_generated',
    });
    flcAuthMocks.updateProfile.mockResolvedValue({ error: null });
    platformServiceMocks.logPermissionChange.mockResolvedValue({ error: null });
    flcAuthMocks.fetchRoleSections.mockResolvedValue({ data: null, error: null });
    flcAuthMocks.saveRoleSections.mockResolvedValue({ error: null });
    masterDataMocks.getBranches.mockResolvedValue({ data: [branch], error: null });
    authServiceMocks.resetPassword.mockResolvedValue({ error: null });
  });

  it('renders the user list and filters it by search text', async () => {
    renderPage();

    expect(await screen.findByText('Alice Manager')).toBeInTheDocument();
    expect(screen.getByText('Bob Sales')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search users, roles, branches...'), {
      target: { value: 'alice' },
    });

    expect(screen.getByText('Alice Manager')).toBeInTheDocument();
    expect(screen.queryByText('Bob Sales')).not.toBeInTheDocument();
  });

  it('sends an invite with branch assignment for branch-required roles', async () => {
    renderPage();
    await screen.findByText('Alice Manager');

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('user@company.com'), {
      target: { value: 'new.user@example.com' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('John Doe'), {
      target: { value: 'New User' },
    });

    const branchSelect = within(dialog).getAllByRole('combobox')[1];
    await chooseSelectOption(branchSelect, 'Kota Kinabalu');

    const submit = within(dialog).getByRole('button', { name: /send invitation/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => {
      expect(flcAuthMocks.inviteUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'new.user@example.com',
        name: 'New User',
        role: 'creator_updater',
        companyId: 'company-1',
        branchId: 'branch-1',
      }));
    });
  });

  it('allows a super admin invite without branch assignment', async () => {
    authMocks.currentUser = {
      id: 'admin-1',
      role: 'super_admin',
      company_id: 'company-1',
      companyId: 'company-1',
      branch_id: null,
    };

    renderPage();
    await screen.findByText('Alice Manager');

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('user@company.com'), {
      target: { value: 'global.admin@example.com' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('John Doe'), {
      target: { value: 'Global Admin' },
    });

    const [roleSelect, companySelect] = within(dialog).getAllByRole('combobox');
    await chooseSelectOption(roleSelect, 'Super Admin');
    await chooseSelectOption(companySelect, 'FLC Sabah');

    expect(within(dialog).getByText('This global role is not tied to a branch.')).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: /send invitation/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => {
      expect(flcAuthMocks.inviteUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'global.admin@example.com',
        name: 'Global Admin',
        role: 'super_admin',
        companyId: 'company-1',
        branchId: null,
      }));
    });
  });

  it('saves portal role updates from the edit dialog', async () => {
    renderPage();
    await screen.findByText('Alice Manager');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const dialog = await screen.findByRole('dialog');
    const roleSelect = within(dialog).getAllByRole('combobox')[0];
    await chooseSelectOption(roleSelect, 'Portal Admin');

    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(flcAuthMocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
        id: 'user-1',
        name: 'Alice Manager',
        role: 'portal_admin',
        access_scope: 'company',
        branch_id: 'branch-1',
      }), expect.objectContaining({
        actorId: 'admin-1',
        companyId: 'company-1',
      }));
    });
    expect(platformServiceMocks.logPermissionChange).toHaveBeenCalledWith('admin-1', 'user-1', {
      role: { before: 'manager', after: 'portal_admin' },
      access_scope: { before: 'branch', after: 'company' },
    });
  });

  it('activates a pending global user without requiring branch assignment', async () => {
    authMocks.currentUser = {
      id: 'admin-1',
      role: 'super_admin',
      company_id: 'company-1',
      companyId: 'company-1',
      branch_id: null,
    };
    flcAuthMocks.listProfiles.mockResolvedValue({
      data: [
        profile({
          id: 'pending-super',
          email: 'pending.super@example.com',
          name: 'Pending Super',
          role: 'super_admin',
          company_id: null,
          branch_id: null,
          access_scope: 'global',
          status: 'pending',
        }),
      ],
      error: null,
    });

    renderPage();
    await screen.findByText('Pending activation');
    fireEvent.click(screen.getByRole('tab', { name: 'Pending (1)' }));
    await screen.findByText('Pending Super');
    fireEvent.click(screen.getByRole('button', { name: /activate/i }));

    await waitFor(() => {
      expect(flcAuthMocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
        id: 'pending-super',
        role: 'super_admin',
        company_id: 'company-1',
        access_scope: 'global',
        branch_id: null,
        status: 'active',
      }), expect.objectContaining({
        actorId: 'admin-1',
        allowCompanyAssignment: true,
        allowGlobalScope: true,
      }));
    });
  });
});
