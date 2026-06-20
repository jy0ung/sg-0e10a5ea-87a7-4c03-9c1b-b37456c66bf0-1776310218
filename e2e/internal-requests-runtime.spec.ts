import { expect, test, type Page } from '@playwright/test';
import { setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

const INTERNAL_REQUEST_ROUTES = [
  { path: '/portal', title: /welcome back/i },
  { path: '/portal/tickets/new', title: /new internal request|new request/i },
  { path: '/portal/tickets', title: /pending requests/i },
  { path: '/portal/tickets/completed', title: /completed requests/i },
  { path: '/portal/dashboard', title: /manager dashboard/i },
  { path: '/portal/queue', title: /pending \/ active requests/i },
  { path: '/portal/history', title: /completed requests/i },
  { path: '/portal/reports', title: /request reports|reports/i },
  { path: '/portal/announcements', title: /announcements/i },
  { path: '/portal/documents', title: /documents & forms/i },
  { path: '/portal/setup', title: /request operations setup|request setup/i },
] as const;

const CRASH_TEXT = /route error|failed to load route|input is not defined|something went wrong/i;

function ticketRow(overrides: Record<string, unknown>) {
  return {
    id: 'ticket-default',
    company_id: '00000000-0000-0000-0000-000000000099',
    subject: 'Request',
    category: 'general',
    subcategory: null,
    priority: 'medium',
    status: 'open',
    description: 'Request details.',
    requested_due_date: null,
    business_impact: null,
    desired_outcome: null,
    custom_fields: {},
    vso_number: null,
    submitted_by: '00000000-0000-0000-0000-000000000001',
    assigned_to: null,
    backup_owner_id: null,
    escalation_owner_id: null,
    responsible_queue: 'Unassigned',
    current_responsible_party: 'Owner',
    next_action: 'Owner to review request',
    status_changed_at: '2026-06-19T09:00:00.000Z',
    last_action_by: null,
    sla_status: 'on_track',
    sla_paused_at: null,
    sla_pause_duration_ms: 0,
    sla_breach_reason: null,
    assigned_at: null,
    first_response_due_at: null,
    resolution_due_at: null,
    first_responded_at: null,
    resolved_at: null,
    resolution_note: null,
    completion_category: null,
    completion_checklist_confirmed: false,
    completion_attachment_required: false,
    closure_confirmed: null,
    satisfaction_rating: null,
    closure_feedback: null,
    closed_at: null,
    reopen_count: 0,
    reopened_at: null,
    last_reopen_reason: null,
    previous_owner_id: null,
    created_at: '2026-06-19T09:00:00.000Z',
    updated_at: '2026-06-19T10:00:00.000Z',
    ...overrides,
  };
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (
      response.status() >= 400
      && (url.startsWith(SUPABASE_URL) || url.includes('localhost:3001'))
      && !url.includes('/favicon.ico')
    ) {
      failures.push(`response ${response.status()}: ${url}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    const reason = request.failure()?.errorText ?? 'unknown failure';
    if (
      !url.includes('/realtime/')
      && !reason.includes('ERR_ABORTED')
      && !reason.includes('NS_BINDING_ABORTED')
    ) {
      failures.push(`requestfailed ${reason}: ${url}`);
    }
  });

  return failures;
}

async function expectRouteStable(page: Page, title: RegExp, failures: string[]) {
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(failures).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
});

for (const route of INTERNAL_REQUEST_ROUTES) {
  test(`${route.path} renders and survives a direct refresh without runtime errors`, async ({ page }) => {
    const failures = collectRuntimeFailures(page);

    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await expectRouteStable(page, route.title, failures);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectRouteStable(page, route.title, failures);
  });
}

test('Internal Request sidebar exposes every module route and browser history remains stable', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/portal', { waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /welcome back/i, failures);

  for (const route of INTERNAL_REQUEST_ROUTES.slice(1)) {
    const link = page.locator(`a[href="${route.path}"]`).first();
    await expect(link).toBeVisible();
  }

  await page.locator('a[href="/portal/tickets/new"]').first().click();
  await expectRouteStable(page, /new internal request|new request/i, failures);
  await page.locator('a[href="/portal/queue"]').first().click();
  await expectRouteStable(page, /pending \/ active requests/i, failures);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /new internal request|new request/i, failures);
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /pending \/ active requests/i, failures);
});

test('Pending / Active Requests renders summary, filters, and empty request state', async ({ page }) => {
  const failures = collectRuntimeFailures(page);
  await page.goto('/portal/queue', { waitUntil: 'domcontentloaded' });

  await expectRouteStable(page, /pending \/ active requests/i, failures);
  await expect(page.getByText('Unassigned', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Pending Requester', { exact: true }).first()).toBeVisible();
  await expect(page.getByPlaceholder('Name this filter')).toBeVisible();
  await expect(page.getByText(/no requests in the queue yet|no requests match/i)).toBeVisible();
});

test('Pending and Completed pages keep Completed by Owner separate from Closed', async ({ page }) => {
  await page.route(`${SUPABASE_URL}/rest/v1/tickets*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        ticketRow({
          id: 'ticket-awaiting-close',
          subject: 'Awaiting requester confirmation',
          status: 'completed_by_owner',
          current_responsible_party: 'Requester',
          next_action: 'Requester to confirm and close',
        }),
        ticketRow({
          id: 'ticket-closed',
          subject: 'Requester closed request',
          status: 'closed',
          current_responsible_party: 'None',
          next_action: 'No further action',
          closed_at: '2026-06-19T11:00:00.000Z',
        }),
      ]),
    });
  });

  const failures = collectRuntimeFailures(page);
  await page.goto('/portal/tickets', { waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /pending requests/i, failures);
  await expect(page.getByText('Awaiting requester confirmation').first()).toBeVisible();
  await expect(page.getByText('Requester closed request')).toHaveCount(0);

  await page.goto('/portal/tickets/completed', { waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /completed requests/i, failures);
  await expect(page.getByText('Requester closed request').first()).toBeVisible();
  await expect(page.getByText('Awaiting requester confirmation')).toHaveCount(0);
});

test('Ticket Workspace preserves chat draft across browser tab focus changes', async ({ page, context }) => {
  await page.route(`${SUPABASE_URL}/rest/v1/tickets*`, (route) => {
    const accept = route.request().headers()['accept'] ?? '';
    const wantsSingle = accept.includes('pgrst.object');
    const workspaceTicket = ticketRow({
      id: 'ticket-focus',
      subject: 'Focus stability request',
      status: 'in_progress',
      description: 'Check that tab focus changes do not reload the workspace.',
      assigned_to: '00000000-0000-0000-0000-000000000001',
      assigned_to_name: 'Test Admin',
      responsible_queue: 'Owner',
      current_responsible_party: 'Owner',
      next_action: 'Owner to complete request',
      first_response_due_at: '2026-06-20T17:00:00.000Z',
      resolution_due_at: '2026-06-21T17:00:00.000Z',
    });
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wantsSingle ? workspaceTicket : [workspaceTicket]),
    });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/ticket_activities*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'activity-focus',
          ticket_id: 'ticket-focus',
          company_id: '00000000-0000-0000-0000-000000000099',
          actor_id: '00000000-0000-0000-0000-000000000001',
          actor_name: 'Test Admin',
          event_type: 'comment_added',
          message: 'Initial workspace message.',
          metadata: {},
          created_at: '2026-06-20T09:00:00.000Z',
        },
      ]),
    });
  });

  const failures = collectRuntimeFailures(page);
  await page.goto('/portal/tickets/ticket-focus?tab=chat', { waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /focus stability request/i, failures);

  const messageDraft = page.getByPlaceholder('Write a message');
  await expect(messageDraft).toBeVisible();
  await messageDraft.fill('Do not lose this draft');
  const workspaceUrl = page.url();

  const otherTab = await context.newPage();
  await otherTab.goto('about:blank');
  await otherTab.bringToFront();
  await page.bringToFront();
  await page.waitForTimeout(300);

  await expect(page).toHaveURL(workspaceUrl);
  await expect(messageDraft).toHaveValue('Do not lose this draft');
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  await otherTab.close();
  expect(failures).toEqual([]);
});

test('requester roles cannot access manager, queue, report, or setup routes', async ({ page }) => {
  const requesterProfile = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'requester@flc.test',
    name: 'Test Requester',
    role: 'portal_staff',
    company_id: '00000000-0000-0000-0000-000000000099',
    branch_id: null,
    avatar_url: null,
    access_scope: 'own',
  };
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    const wantsSingle = (route.request().headers()['accept'] ?? '').includes('pgrst.object');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wantsSingle ? requesterProfile : [requesterProfile]),
    });
  });

  const failures = collectRuntimeFailures(page);
  await page.goto('/portal/tickets', { waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /pending requests/i, failures);
  await expect(page.locator('a[href="/portal/queue"]')).toHaveCount(0);
  await expect(page.locator('a[href="/portal/setup"]')).toHaveCount(0);

  for (const path of ['/portal/dashboard', '/portal/queue', '/portal/history', '/portal/reports', '/portal/setup']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Access Restricted' })).toBeVisible();
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});

test('Pending Requests shows loading, recoverable error, and safe partial-data states', async ({ page }) => {
  let mode: 'slow' | 'error' | 'partial' = 'slow';
  await page.route(`${SUPABASE_URL}/rest/v1/tickets*`, async (route) => {
    if (mode === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 700));
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (mode === 'error') {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Temporary request service failure' }),
      });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        ticketRow({
          id: 'ticket-partial',
          subject: null,
          category: null,
          priority: null,
          status: null,
          description: null,
          custom_fields: null,
          responsible_queue: null,
          current_responsible_party: null,
          next_action: null,
          status_changed_at: null,
          created_at: null,
          updated_at: null,
        }),
      ]),
    });
  });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/portal/tickets', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.animate-pulse').first()).toBeVisible();
  await expect(page.getByText(/no requests yet/i)).toBeVisible();

  mode = 'error';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Unable to load requests')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

  mode = 'partial';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Untitled request').first()).toBeVisible();
  await expect(page.getByText(/uncategorized/i).first()).toBeVisible();
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('New Request category and subcategory interactions stay responsive and avoid duplicate loading', async ({ page }) => {
  let categoryRequests = 0;
  let subcategoryRequests = 0;
  let formFieldRequests = 0;

  await page.context().addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { __requestDraftWrites?: number }).__requestDraftWrites = 0;
    Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
      if (key.startsWith('flc.internal-request-draft:')) {
        const runtimeWindow = window as Window & { __requestDraftWrites?: number };
        runtimeWindow.__requestDraftWrites = (runtimeWindow.__requestDraftWrites ?? 0) + 1;
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.route(`${SUPABASE_URL}/rest/v1/request_categories*`, (route) => {
    if (route.request().url().includes('order=')) categoryRequests += 1;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'category-general',
          company_id: '00000000-0000-0000-0000-000000000099',
          category_key: 'general',
          label: 'General Support',
          description: 'General support description.',
          is_active: true,
          sort_order: 1,
          requires_approval: false,
          response_sla_hours: 8,
          resolution_sla_hours: 48,
        },
        {
          id: 'category-it',
          company_id: '00000000-0000-0000-0000-000000000099',
          category_key: 'it_access',
          label: 'IT Access',
          description: 'IT access category description.',
          is_active: true,
          sort_order: 2,
          requires_approval: false,
          response_sla_hours: 4,
          resolution_sla_hours: 24,
        },
      ]),
    });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/request_subcategories*`, (route) => {
    if (route.request().url().includes('order=')) subcategoryRequests += 1;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'subcategory-vpn',
          company_id: '00000000-0000-0000-0000-000000000099',
          category_key: 'it_access',
          subcategory_key: 'vpn',
          label: 'VPN Access',
          description: 'VPN access subcategory description.',
          is_active: true,
          sort_order: 1,
        },
      ]),
    });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/request_form_fields*`, (route) => {
    formFieldRequests += 1;
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const failures = collectRuntimeFailures(page);
  const startedAt = Date.now();
  await page.goto('/portal/tickets/new', { waitUntil: 'domcontentloaded' });
  await expectRouteStable(page, /new internal request|new request/i, failures);
  expect(Date.now() - startedAt).toBeLessThan(5_000);

  const title = page.getByLabel(/request title/i);
  await expect(title).toHaveAttribute('placeholder', 'Customer Name');
  await expect(page.getByLabel('Description')).toHaveValue('General support description.');

  const category = page.getByRole('combobox', { name: /^category/i });
  const categoryStartedAt = Date.now();
  await category.click();
  await page.getByRole('option', { name: 'IT Access' }).click();
  await expect(page.getByLabel('Description')).toHaveValue('IT access category description.');
  expect(Date.now() - categoryStartedAt).toBeLessThan(1_500);

  const subcategory = page.getByRole('combobox', { name: /^subcategory/i });
  const subcategoryStartedAt = Date.now();
  await subcategory.click();
  await page.getByRole('option', { name: 'VPN Access' }).click();
  await expect(page.getByLabel('Description')).toHaveValue('VPN access subcategory description.');
  await expect(page.getByRole('combobox').filter({ hasText: 'From subcategory' })).toBeVisible();
  expect(Date.now() - subcategoryStartedAt).toBeLessThan(1_500);

  await title.fill('Customer access request');
  await page.waitForTimeout(550);

  const draftWrites = await page.evaluate(
    () => (window as Window & { __requestDraftWrites?: number }).__requestDraftWrites ?? 0,
  );
  expect(draftWrites).toBeLessThanOrEqual(2);
  expect(categoryRequests).toBe(1);
  expect(subcategoryRequests).toBe(1);
  expect(formFieldRequests).toBeLessThanOrEqual(3);
  expect(failures).toEqual([]);
});
