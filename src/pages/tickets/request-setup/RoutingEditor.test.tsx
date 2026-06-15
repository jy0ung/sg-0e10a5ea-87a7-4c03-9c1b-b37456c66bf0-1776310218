import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { RoutingEditor } from './RoutingEditor';
import { CONFLICT_RELOAD_MESSAGE } from './shared';
import { deleteRoutingRule, updateRoutingRule } from '@flc/internal-requests';

// Hoisted so the (hoisted) vi.mock factories below can reference them.
const { RULE, reload } = vi.hoisted(() => ({
  RULE: {
    id: 'rule-1',
    company_id: 'company-1',
    name: 'Sales → Alice',
    is_active: true,
    sort_order: 0,
    match_category: null,
    match_subcategory: null,
    match_submitter_role: null,
    match_priority: null,
    assign_to_user_id: 'user-99',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    created_by: null,
  },
  reload: vi.fn(),
}));

vi.mock('@/hooks/useRoutingRules', () => ({
  useRoutingRules: () => ({ rules: [RULE], loading: false, error: null, reload }),
}));
vi.mock('@/hooks/useRequestCategories', () => ({ useRequestCategories: () => ({ categories: [] }) }));
vi.mock('@/hooks/useRequestSubcategories', () => ({ useRequestSubcategories: () => ({ subcategories: [] }) }));
vi.mock('@flc/auth', () => ({ listProfiles: vi.fn().mockResolvedValue({ data: [] }) }));
vi.mock('@/config/rolePermissions', () => ({ ROLE_LABELS: { sales: 'Sales', manager: 'Manager' } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@flc/internal-requests', () => ({
  createRoutingRule: vi.fn(),
  updateRoutingRule: vi.fn(),
  deleteRoutingRule: vi.fn(),
  moveRoutingRule: vi.fn(),
}));

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RoutingEditor companyId="company-1" actorId="actor-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateRoutingRule).mockResolvedValue({ data: RULE as never, error: null });
  vi.mocked(deleteRoutingRule).mockResolvedValue({ error: null });
});

describe('RoutingEditor — destructive action confirmation', () => {
  it('does not delete immediately; requires confirming in the dialog', async () => {
    renderEditor();

    fireEvent.click(screen.getByLabelText('Delete Sales → Alice'));

    // Confirmation dialog is shown; nothing deleted yet.
    expect(await screen.findByText('Delete routing rule')).toBeInTheDocument();
    expect(deleteRoutingRule).not.toHaveBeenCalled();

    // Confirm → service called with the row's version token.
    fireEvent.click(screen.getByRole('button', { name: /delete rule/i }));
    await waitFor(() => {
      expect(deleteRoutingRule).toHaveBeenCalledWith(
        'rule-1',
        { actorId: 'actor-1', companyId: 'company-1' },
        '2026-05-01T00:00:00.000Z',
      );
    });
  });
});

describe('RoutingEditor — optimistic-lock conflict', () => {
  it('shows an inline reload banner when a save conflicts', async () => {
    vi.mocked(updateRoutingRule).mockResolvedValueOnce({
      data: null,
      error: CONFLICT_RELOAD_MESSAGE,
      conflict: true,
    });
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = await screen.findByLabelText('Rule name');
    fireEvent.change(nameInput, { target: { value: 'Sales → Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });
});
