#!/usr/bin/env -S npx tsx
import { chromium, type Page } from 'playwright';
import { getProductionSmokeRoutes } from '@flc/shell';

const DEFAULT_MAIN_URL = 'https://ubs.protonfookloi.com';
const DEFAULT_HRMS_URL = 'https://hrms.protonfookloi.com';

type RouteCheck = {
  module: string;
  name: string;
  path: string;
};

type Issue = {
  type: string;
  detail: string;
};

type RouteResult = RouteCheck & {
  ok: boolean;
  finalUrl: string;
  issues: Issue[];
};

type GroupSummary = {
  total: number;
  passed: number;
  failed: RouteResult[];
};

const mainUrl = normalizeUrl(readEnv('PROD_URL') ?? DEFAULT_MAIN_URL);
const hrmsUrl = normalizeUrl(
  readEnv('PROD_HRMS_URL') ?? readEnv('PROD_EXPECTED_HRMS_APP_URL') ?? DEFAULT_HRMS_URL,
);
const loginEmail = readEnv('PROD_LOGIN_EMAIL');
const loginPassword = readEnv('PROD_LOGIN_PASSWORD');
const routeTimeoutMs = parsePositiveInteger(readEnv('PROD_SMOKE_ROUTE_TIMEOUT_MS'), 45_000);

const mainRoutes: RouteCheck[] = getProductionSmokeRoutes('main');
const hrmsRoutes: RouteCheck[] = getProductionSmokeRoutes('hrms');

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) return fallback;
  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requireCredentials(): { email: string; password: string } {
  if (!loginEmail || !loginPassword) {
    throw new Error('PROD_LOGIN_EMAIL and PROD_LOGIN_PASSWORD are required for production module smoke tests.');
  }
  return { email: loginEmail, password: loginPassword };
}

function isAuthBlockedUrl(url: URL): boolean {
  return url.pathname.includes('/login') || url.pathname.includes('/account-pending');
}

function sameOrigin(responseUrl: string, baseUrl: URL): boolean {
  try {
    return new URL(responseUrl).origin === baseUrl.origin;
  } catch {
    return false;
  }
}

function addUniqueIssue(issues: Issue[], issue: Issue): void {
  if (!issues.some((existing) => existing.type === issue.type && existing.detail === issue.detail)) {
    issues.push(issue);
  }
}

function findUiIssues(bodyText: string): Issue[] {
  const markers = [
    'Route Error',
    'An error occurred while loading this page',
    'Something went wrong',
    'Unauthorized Access',
    'Access denied',
    'HRMS is unavailable',
    'Page Not Found',
    // PageErrorState — surfaces when an RPC / table is missing from the
    // schema cache. Catches the get_role_home_kpis-class regression that
    // would otherwise pass smoke as a "rendered" page.
    'Unable to load data',
    'Platform configuration mismatch',
    'schema cache',
  ];

  return markers
    .filter((marker) => bodyText.includes(marker))
    .map((marker) => ({ type: 'ui', detail: marker }));
}

async function login(page: Page, baseUrl: URL, credentials: { email: string; password: string }, appName: string): Promise<void> {
  console.info(`LOGIN ${appName}: ${baseUrl.origin}`);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });

  await page.goto(new URL('/login', baseUrl.origin).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: routeTimeoutMs,
  });
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);

  try {
    await Promise.all([
      page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: routeTimeoutMs }),
      page.getByRole('button', { name: /^Sign In$/ }).click(),
    ]);
  } catch (_e) {
    const currentUrl = page.url();
    // Capture the auth error message displayed on the login form
    const formError = await page
      .locator('.text-destructive span, [role="alert"]')
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    const buttonDisabled = await page
      .getByRole('button', { name: /^Sign In$/ })
      .isDisabled()
      .catch(() => null);
    const details = [
      `URL: ${currentUrl}`,
      formError ? `Auth error: "${formError.trim()}"` : 'No form error detected — credentials may be correct but auth is slow or blocked',
      buttonDisabled != null ? `Sign In button disabled: ${buttonDisabled}` : null,
      consoleErrors.length > 0 ? `Console errors: ${consoleErrors.slice(0, 3).join('; ')}` : null,
    ].filter(Boolean).join(' | ');
    throw new Error(`${appName} login failed. ${details}`);
  }

  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);

  const currentUrl = new URL(page.url());
  if (isAuthBlockedUrl(currentUrl)) {
    throw new Error(`${appName} login ended at ${currentUrl.toString()}`);
  }

  console.info(`PASS login ${appName}: ${currentUrl.pathname}`);
}

async function smokeRoute(page: Page, baseUrl: URL, routeCheck: RouteCheck): Promise<RouteResult> {
  console.info(`CHECK ${routeCheck.module}: ${routeCheck.name} ${routeCheck.path}`);
  const issues: Issue[] = [];
  const consoleErrors: string[] = [];
  const onConsole = (msg: Parameters<Page['on']>[1]) => {
    if ('type' in msg && typeof msg.type === 'function' && msg.type() === 'error') {
      consoleErrors.push(msg.text().slice(0, 500));
    }
  };
  const onPageError = (error: Error) => addUniqueIssue(issues, { type: 'pageerror', detail: error.message });
  const onResponse = (response: Awaited<ReturnType<Page['waitForResponse']>>) => {
    const status = response.status();
    const request = response.request();
    const resourceType = request.resourceType();
    if (resourceType === 'document' && status >= 400) {
      addUniqueIssue(issues, { type: 'response', detail: `${status} document ${response.url()}` });
      return;
    }
    if (sameOrigin(response.url(), baseUrl) && status >= 500) {
      addUniqueIssue(issues, { type: 'response', detail: `${status} ${resourceType} ${response.url()}` });
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  let finalUrl = '';
  try {
    await page.goto(new URL(routeCheck.path, baseUrl.origin).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: routeTimeoutMs,
    });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    finalUrl = page.url();

    const currentUrl = new URL(finalUrl);
    if (isAuthBlockedUrl(currentUrl)) {
      addUniqueIssue(issues, { type: 'auth', detail: `redirected to ${currentUrl.pathname}` });
    }

    const bodyText = await page.locator('body').innerText({ timeout: 12_000 });
    if (!bodyText.trim()) {
      addUniqueIssue(issues, { type: 'ui', detail: 'empty page body' });
    }
    for (const issue of findUiIssues(bodyText)) addUniqueIssue(issues, issue);
    if (issues.length > 0) {
      const renderedError = await page
        .locator('.font-mono, [data-testid="route-error-detail"], [data-testid="app-error-detail"]')
        .first()
        .textContent({ timeout: 1_000 })
        .catch(() => null);
      if (renderedError?.trim()) {
        addUniqueIssue(issues, { type: 'ui-detail', detail: renderedError.trim().slice(0, 500) });
      }
      for (const consoleError of consoleErrors.slice(0, 3)) {
        addUniqueIssue(issues, { type: 'console', detail: consoleError });
      }
    }
  } catch (error) {
    addUniqueIssue(issues, { type: 'exception', detail: error instanceof Error ? error.message : String(error) });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }

  const result = {
    ...routeCheck,
    finalUrl,
    ok: issues.length === 0,
    issues: issues.slice(0, 8),
  };

  console.info(`${result.ok ? 'PASS' : 'FAIL'} ${routeCheck.module}: ${routeCheck.name}`);
  return result;
}

async function checkHrmsModuleRedirect(page: Page): Promise<RouteResult> {
  console.info('CHECK HRMS Launch: Module Directory Card /modules');
  const routeCheck = { module: 'HRMS Launch', name: 'Module Directory Card', path: '/modules' };
  const issues: Issue[] = [];
  let finalUrl = '';

  try {
    await page.goto(new URL('/modules', mainUrl.origin).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: routeTimeoutMs,
    });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    await page.getByRole('button', { name: /HRMS/i }).click({ timeout: 12_000 });
    await page.waitForURL((url) => url.origin === hrmsUrl.origin, { timeout: routeTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    finalUrl = page.url();

    const currentUrl = new URL(finalUrl);
    if (currentUrl.origin !== hrmsUrl.origin) {
      addUniqueIssue(issues, { type: 'redirect', detail: `expected ${hrmsUrl.origin}, got ${currentUrl.origin}` });
    }
    if (isAuthBlockedUrl(currentUrl)) {
      addUniqueIssue(issues, { type: 'auth', detail: `HRMS launch landed on ${currentUrl.pathname}` });
    }
  } catch (error) {
    addUniqueIssue(issues, { type: 'exception', detail: error instanceof Error ? error.message : String(error) });
    finalUrl = page.url();
  }

  const result = { ...routeCheck, finalUrl, ok: issues.length === 0, issues };
  console.info(`${result.ok ? 'PASS' : 'FAIL'} HRMS Launch: Module Directory Card`);
  return result;
}

function summarize(results: RouteResult[]): Map<string, GroupSummary> {
  const groups = new Map<string, GroupSummary>();
  for (const result of results) {
    const summary = groups.get(result.module) ?? { total: 0, passed: 0, failed: [] };
    summary.total += 1;
    if (result.ok) summary.passed += 1;
    else summary.failed.push(result);
    groups.set(result.module, summary);
  }
  return groups;
}

function printSummary(results: RouteResult[]): void {
  for (const [moduleName, summary] of summarize(results)) {
    const prefix = summary.passed === summary.total ? 'PASS' : 'FAIL';
    console.info(`${prefix} ${moduleName}: ${summary.passed}/${summary.total}`);
    for (const failedResult of summary.failed) {
      console.info(`  - ${failedResult.name} ${failedResult.path}`);
      if (failedResult.finalUrl) console.info(`    final: ${failedResult.finalUrl}`);
      for (const issue of failedResult.issues) {
        console.info(`    ${issue.type}: ${issue.detail}`);
      }
    }
  }
}

const credentials = requireCredentials();
const browser = await chromium.launch({ headless: true });
const results: RouteResult[] = [];

try {
  const mainContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mainPage = await mainContext.newPage();
  await login(mainPage, mainUrl, credentials, 'main app');
  for (const routeCheck of mainRoutes) {
    results.push(await smokeRoute(mainPage, mainUrl, routeCheck));
  }
  results.push(await checkHrmsModuleRedirect(mainPage));
  await mainContext.close();

  const hrmsContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const hrmsPage = await hrmsContext.newPage();
  await login(hrmsPage, hrmsUrl, credentials, 'HRMS');
  for (const routeCheck of hrmsRoutes) {
    results.push(await smokeRoute(hrmsPage, hrmsUrl, routeCheck));
  }
  await hrmsContext.close();
} finally {
  await browser.close();
}

printSummary(results);

const failed = results.filter((result) => !result.ok);
console.info(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length }, null, 2));
if (failed.length > 0) process.exit(1);
