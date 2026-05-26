import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const useFeatureFlagMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: useFeatureFlagMock }));

vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => 'co-1' }));

vi.mock('@/services/webhookOutboxService', () => ({
  listWebhookEndpoints:   vi.fn().mockResolvedValue({ data: [], error: null }),
  listWebhookDeliveries:  vi.fn().mockResolvedValue({ data: [], error: null }),
  upsertWebhookEndpoint:  vi.fn(),
  requeueWebhookDelivery: vi.fn(),
}));

import WebhookOutbox from './WebhookOutbox';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WebhookOutbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WebhookOutbox page', () => {
  it('shows the feature-off banner when phase6.webhook-outbox is disabled', () => {
    useFeatureFlagMock.mockReturnValue(false);
    renderPage();
    expect(screen.getByTestId('webhook-outbox-feature-off')).toBeInTheDocument();
  });

  it('renders the endpoints empty state when the flag is on and there are no rows', async () => {
    useFeatureFlagMock.mockReturnValue(true);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No endpoints registered/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Register endpoint/i })).toBeInTheDocument();
    expect(screen.getByText(/No deliveries yet/i)).toBeInTheDocument();
  });
});
