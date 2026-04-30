#!/usr/bin/env -S npx tsx
import { chromium, type Page } from 'playwright';

const DEFAULT_UAT_URL = 'https://uat.protonfookloi.com';
const DEFAULT_FORBIDDEN_PATTERNS = [
  'http://127.0.0.1:54321',
  'http://localhost:54321',
  'http://192.168.',
];

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

const targetUrl = normalizeUrl(readEnv('UAT_URL') ?? DEFAULT_UAT_URL);
const expectedSupabaseUrl = normalizeUrl(readEnv('UAT_EXPECTED_SUPABASE_URL') ?? targetUrl.origin);
const healthUrl = normalizeUrl(readEnv('UAT_HEALTH_URL') ?? `${targetUrl.origin}/healthz`);
const forbiddenPatterns = (readEnv('UAT_FORBIDDEN_SUPABASE_PATTERNS') ?? DEFAULT_FORBIDDEN_PATTERNS.join(','))
  .split(',')
  .map((pattern) => pattern.trim())
  .filter(Boolean);
const loginEmail = readEnv('UAT_LOGIN_EMAIL');
const loginPassword = readEnv('UAT_LOGIN_PASSWORD');
const maxFetchAttempts = parsePositiveInteger(readEnv('UAT_VERIFY_FETCH_ATTEMPTS'), 3);
const appMode = readEnv('UAT_APP') ?? 'main';
const runningInGitHubActions = readEnv('GITHUB_ACTIONS') === 'true';
const loginRequired = parseLoginRequired(readEnv('UAT_LOGIN_REQUIRED'), appMode, runningInGitHubActions);

const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@flc.test',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { name: 'Test Admin' },
};

const MOCK_PROFILE = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  name: 'Test Admin',
  role: 'super_admin',
  company_id: '00000000-0000-0000-0000-000000000099',
  branch_id: null,
  avatar_url: null,
  access_scope: 'global',
};

const results: CheckResult[] = [];

function normalizeUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseLoginRequired(rawValue: string | undefined, mode: string, runningInCi: boolean): boolean {
  if (!rawValue) {
    return mode === 'main' && runningInCi;
  }

  return ['1', 'true'].includes(rawValue.toLowerCase());
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fakeBearerToken(): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({
    sub: MOCK_USER.id,
    aud: 'authenticated',
    exp: 9999999999,
    iat: 1700000000,
    role: 'authenticated',
    email: MOCK_USER.email,
  }));
  return `${header}.${payload}.fakesignature`;
}

function buildFakeSession() {
  return {
    access_token: fakeBearerToken(),
    token_type: 'bearer',
    expires_in: 9999999,
    expires_at: 9999999999,
    refresh_token: 'fake-refresh-token',
    user: MOCK_USER,
  };
}

async function fetchText(url: URL): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url.toString()} returned HTTP ${response.status}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < maxFetchAttempts) {
        await wait(500 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function addResult(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const prefix = ok ? 'PASS' : 'FAIL';
  console.info(`${prefix} ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name: string, error: unknown) {
  addResult(name, false, error instanceof Error ? error.message : String(error));
}

async function checkHealth() {
  const name = 'health endpoint';
  try {
    const body = (await fetchText(healthUrl)).trim();
    addResult(name, body === 'ok', `${healthUrl.toString()} returned ${JSON.stringify(body)}`);
  } catch (error) {
    fail(name, error);
  }
}

function resolveAssetUrl(html: string): URL {
  const match = html.match(/<script[^>]+src=["']([^"']*assets\/index-[^"']+\.js)["']/);
  if (!match?.[1]) {
    throw new Error('Could not find hashed Vite index asset in HTML');
  }
  return new URL(match[1], targetUrl);
}

async function checkBundleSupabaseConfig() {
  const name = 'bundle Supabase URL';
  try {
    const html = await fetchText(targetUrl);
    const assetUrl = resolveAssetUrl(html);
    const bundle = await fetchText(assetUrl);

    const expected = expectedSupabaseUrl.origin;
    const hasExpected = bundle.includes(expected);
    const forbiddenHits = forbiddenPatterns.filter((pattern) => bundle.includes(pattern));

    if (!hasExpected) {
      addResult(name, false, `expected ${expected} in ${assetUrl.pathname}`);
      return;
    }

    if (forbiddenHits.length > 0) {
      addResult(name, false, `found forbidden pattern(s): ${forbiddenHits.join(', ')}`);
      return;
    }

    addResult(name, true, `${assetUrl.pathname} uses ${expected}`);
  } catch (error) {
    fail(name, error);
  }
}

async function checkLoginFlow() {
  const name = 'browser login flow';
  if (!loginEmail || !loginPassword) {
    addResult(name, !loginRequired, loginRequired ? 'missing UAT_LOGIN_EMAIL/UAT_LOGIN_PASSWORD' : 'skipped; no credentials provided');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(new URL('/login', targetUrl.origin).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.fill('#email', loginEmail);
    await page.fill('#password', loginPassword);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForFunction(
      () => Boolean(window.localStorage.getItem('flc.auth.session')),
      null,
      { timeout: 10_000 },
    );

    const sessionStored = await page.evaluate(() => Boolean(window.localStorage.getItem('flc.auth.session')));
    const errorVisible = await page
      .locator('text=/incorrect email or password|invalid login credentials|unable to connect/i')
      .count();
    addResult(name, sessionStored && errorVisible === 0, `redirected to ${new URL(page.url()).pathname}`);
  } catch (error) {
    fail(name, error);
  } finally {
    await browser.close();
  }
}

async function setupHrmsBrowserMocks(page: Page) {
  const supabaseOrigin = expectedSupabaseUrl.origin;
  const fakeSession = buildFakeSession();

  await page.context().addInitScript(
    ({ session, user }) => {
      localStorage.setItem('flc.auth.session', JSON.stringify(session));
      localStorage.setItem('flc.auth.session-user', JSON.stringify({ user }));
    },
    { session: fakeSession, user: MOCK_USER },
  );

  await page.route(`${supabaseOrigin}/auth/v1/logout*`, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(`${supabaseOrigin}/auth/v1/token*`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fakeSession),
  }));
  await page.route(`${supabaseOrigin}/auth/v1/user`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MOCK_USER),
  }));
  await page.route(`${supabaseOrigin}/realtime/**`, (route) => route.abort());
  await page.route(`${supabaseOrigin}/rest/v1/**`, (route) => {
    if (route.request().method() === 'GET') {
      const accept = route.request().headers().accept ?? '';
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: accept.includes('pgrst.object') ? 'null' : '[]',
      });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`${supabaseOrigin}/rest/v1/profiles*`, (route) => {
    const accept = route.request().headers().accept ?? '';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: accept.includes('pgrst.object') ? JSON.stringify(MOCK_PROFILE) : JSON.stringify([MOCK_PROFILE]),
    });
  });
  await page.route(`${supabaseOrigin}/rest/v1/module_settings*`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'module-setting-hrms',
      company_id: MOCK_PROFILE.company_id,
      module_id: 'hrms',
      is_active: true,
      updated_at: '2026-04-29T00:00:00.000Z',
      updated_by: MOCK_PROFILE.id,
    }]),
  }));
}

async function checkHrmsWebShell() {
  const name = 'HRMS web shell smoke';
  if (appMode !== 'hrms-web') {
    addResult(name, true, `skipped for app mode ${JSON.stringify(appMode)}`);
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await setupHrmsBrowserMocks(page);

    await page.goto(new URL('/', targetUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL((url) => url.pathname.endsWith('/leave'), { timeout: 20_000 });
    await page.getByText('FLC HRMS').first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('HRMS-only access').waitFor({ state: 'visible', timeout: 10_000 });

    await page.goto(new URL('/admin', targetUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL((url) => url.pathname.endsWith('/settings'), { timeout: 20_000 });
    await page.getByText('FLC HRMS').first().waitFor({ state: 'visible', timeout: 10_000 });

    await page.goto(new URL('/leave-calendar?view=team#month', targetUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL((url) => url.pathname.endsWith('/leave/calendar') && url.search === '?view=team' && url.hash === '#month', { timeout: 20_000 });
    await page.getByText('FLC HRMS').first().waitFor({ state: 'visible', timeout: 10_000 });

    addResult(name, true, `validated ${targetUrl.origin}`);
  } catch (error) {
    fail(name, error);
  } finally {
    await browser.close();
  }
}

await checkHealth();
await checkBundleSupabaseConfig();
await checkLoginFlow();
await checkHrmsWebShell();

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`UAT verification failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}

console.info('UAT verification passed.');
