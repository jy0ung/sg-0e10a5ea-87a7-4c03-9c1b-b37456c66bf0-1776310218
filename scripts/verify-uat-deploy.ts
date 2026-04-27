#!/usr/bin/env -S npx tsx
import { chromium } from 'playwright';

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
const loginRequired = ['1', 'true'].includes((readEnv('UAT_LOGIN_REQUIRED') ?? '').toLowerCase());
const maxFetchAttempts = parsePositiveInteger(readEnv('UAT_VERIFY_FETCH_ATTEMPTS'), 3);

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const match = html.match(/\/(assets\/index-[^"']+\.js)/);
  if (!match?.[1]) {
    throw new Error('Could not find hashed Vite index asset in HTML');
  }
  return new URL(`/${match[1]}`, targetUrl.origin);
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

await checkHealth();
await checkBundleSupabaseConfig();
await checkLoginFlow();

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`UAT verification failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}

console.info('UAT verification passed.');
