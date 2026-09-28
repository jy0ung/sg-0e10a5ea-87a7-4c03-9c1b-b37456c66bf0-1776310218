import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  createWebhookEndpoint:  vi.fn(),
  updateWebhookEndpoint:  vi.fn(),
  rotateWebhookEndpointSecret: vi.fn(),
  requeueWebhookDelivery: vi.fn(),
}));

import WebhookOutbox from './WebhookOutbox';
import { createWebhookEndpoint, listWebhookEndpoints } from '@/services/webhookOutboxService';

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

  it('generates a signing key on the server and reveals it only after creation', async () => {
    useFeatureFlagMock.mockReturnValue(true);
    vi.mocked(listWebhookEndpoints).mockResolvedValue({ data: [], error: null });
    vi.mocked(createWebhookEndpoint).mockResolvedValue({
      id: 'ep-1', secret: 'new-one-time-key', error: null,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Register endpoint' }));
    const form = screen.getByRole('dialog');
    expect(within(form).queryByLabelText('HMAC secret')).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Receiver' } });
    fireEvent.change(within(form).getByLabelText('URL (HTTPS only)'), { target: { value: 'https://hooks.example.test/ubs' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Register endpoint' }));

    expect(await screen.findByLabelText('New signing key')).toHaveValue('new-one-time-key');
    expect(createWebhookEndpoint).toHaveBeenCalledWith({
      companyId: 'co-1', name: 'Receiver', url: 'https://hooks.example.test/ubs',
      eventTypes: [], active: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('New signing key')).not.toBeInTheDocument();
  });
});
