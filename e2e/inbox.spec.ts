import { expect, test, type Page, type Route } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test.describe.configure({ timeout: 90_000 });

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function setupInboxMocks(page: Page, opts: {
  featureEnabled?: boolean;
  notifications?: unknown[];
  tickets?: unknown[];
} = {}) {
  const { featureEnabled = true, notifications, tickets } = opts;
  await setupAuthMocks(page);

  await page.route(`${SUPABASE_URL}/rest/v1/feature_flags*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, [
        {
          id: 'flag-4a', company_id: null, code: 'phase4.unified-inbox',
          enabled: featureEnabled, rollout_pct: featureEnabled ? 100 : 0,
          description: null, created_at: '2026-05-25T00:00:00Z', updated_at: '2026-05-25T00:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/notifications*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, notifications ?? [
        {
          id: 'notif-1', user_id: MOCK_PROFILE.id,
          title: 'Welcome to the unified inbox',
          message: 'Approvals, reconciliation, requests, and alerts now live in one place.',
          type: 'info', read: false, created_at: '2026-05-26T08:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  await page.route(`${SUPABASE_URL}/rest/v1/tickets*`, async route => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, tickets ?? [
        {
          id: 'ticket-1', company_id: MOCK_PROFILE.company_id,
          subject: 'Provision VPN access', category: 'access', subcategory: 'vpn',
          priority: 'high', status: 'open', description: 'Need access for new joiner.',
          requested_due_date: null, business_impact: null, desired_outcome: null,
          custom_fields: {}, vso_number: null,
          submitted_by: MOCK_PROFILE.id, assigned_to: null, assigned_at: null,
          first_response_due_at: null, resolution_due_at: null, first_responded_at: null,
          resolved_at: null, resolution_note: null,
          created_at: '2026-05-26T07:00:00Z', updated_at: '2026-05-26T07:00:00Z',
        },
      ]);
      return;
    }
    await fulfillJson(route, {});
  });

  // Empty HRMS sources; the unified inbox should still render.
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/leave_requests*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/payroll_runs*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/appraisals*`, async route => {
    await fulfillJson(route, []);
  });
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, async route => {
    await fulfillJson(route, []);
  });
}

test.describe('Unified Inbox', () => {
  test('shows feature-off banner when phase4.unified-inbox is disabled', async ({ page }) => {
    await setupInboxMocks(page, { featureEnabled: false });
    await page.goto('/inbox');

    await expect(page.getByTestId('inbox-feature-off')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/feature not available/i)).toBeVisible();
  });

  test('renders the unified list with notifications and tickets', async ({ page }) => {
    await setupInboxMocks(page);
    await page.goto('/inbox');

    await expect(page.getByTestId('inbox-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Welcome to the unified inbox')).toBeVisible();
    await expect(page.getByText('Provision VPN access')).toBeVisible();
  });

  test('filter chips scope the list by source', async ({ page }) => {
    await setupInboxMocks(page);
    await page.goto('/inbox');

    await page.getByTestId('inbox-filter-ticket').click();
    await expect(page.getByText('Provision VPN access')).toBeVisible();
    await expect(page.getByText('Welcome to the unified inbox')).not.toBeVisible();

    await page.getByTestId('inbox-filter-notification').click();
    await expect(page.getByText('Welcome to the unified inbox')).toBeVisible();
    await expect(page.getByText('Provision VPN access')).not.toBeVisible();
  });

  test('shows empty state when no items load', async ({ page }) => {
    await setupInboxMocks(page, { notifications: [], tickets: [] });
    await page.goto('/inbox');

    await expect(page.getByText(/nothing in your inbox/i)).toBeVisible({ timeout: 30_000 });
  });
});
