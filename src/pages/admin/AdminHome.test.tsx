import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: 'company_admin', flags: new Set<string>() }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: mocks.role, company_id: 'company-1' } }),
}));
vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: (code: string) => mocks.flags.has(code),
}));

import AdminHome from './AdminHome';

function renderPage() {
  return render(<MemoryRouter><AdminHome /></MemoryRouter>);
}

beforeEach(() => {
  mocks.role = 'company_admin';
  mocks.flags.clear();
});

describe('AdminHome', () => {
  it('shows company administration paths with a real System Health link', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Roles & Permissions' })).toHaveAttribute('href', '/admin/roles');
    expect(screen.getByRole('link', { name: 'System Health' })).toHaveAttribute('href', '/admin/health');
    expect(screen.queryByRole('link', { name: 'Backup & Recovery' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Webhook Outbox' })).not.toBeInTheDocument();
  });

  it('respects role and feature boundaries in the directory', () => {
    mocks.role = 'director';
    mocks.flags.add('phase3d.reconciliation-review-v2');
    renderPage();
    expect(screen.getByRole('link', { name: 'Reconciliation Queue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'System Health' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Roles & Permissions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Webhook Outbox' })).not.toBeInTheDocument();
  });
});
