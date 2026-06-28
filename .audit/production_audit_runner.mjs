import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.AUDIT_BASE || 'https://ubs.protonfookloi.com';
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('AUDIT_EMAIL and AUDIT_PASSWORD are required');

const OUT = process.env.AUDIT_OUT || '/tmp/prod-webapp-audit-20260625';
await fs.mkdir(path.join(OUT, 'screenshots'), { recursive: true });

const samples = {
  deal: 'a3111304-bf9b-426a-99e7-284803ce7ec1',
  ticket: '9f3748d5-6f83-4b9e-a03a-e7bad91ec030',
  vehicle: 'PL1BT3SRRRB341114',
  customer: 'f78846e0-671e-4619-a253-19bb2b6eac63',
  purchaseInvoice: 'ca3b19a2-3983-41eb-b255-314bb27bcd81',
};

const routes = [
  ['Platform', '/', 'Home root'],
  ['Platform', '/home', 'Home'],
  ['Platform', '/modules', 'Modules'],
  ['Platform', '/inbox', 'Inbox'],
  ['Platform', '/notifications', 'Notifications'],
  ['Platform', '/not-a-real-route-audit', '404/Not Found'],

  ['Portal', '/portal', 'Portal landing'],
  ['Portal', '/portal/tickets/new', 'New request'],
  ['Portal', '/portal/tickets', 'My tickets'],
  ['Portal', '/portal/tickets/completed', 'Completed tickets'],
  ['Portal', `/portal/tickets/${samples.ticket}`, 'Ticket workspace'],
  ['Portal', '/portal/dashboard', 'Manager dashboard'],
  ['Portal', '/portal/queue', 'Request queue'],
  ['Portal', '/portal/history', 'Request history'],
  ['Portal', '/portal/reports', 'Request reports'],
  ['Portal', '/portal/setup', 'Request setup'],
  ['Portal', '/portal/announcements', 'Portal announcements'],
  ['Portal', '/portal/documents', 'Portal documents'],

  ['Auto Aging', '/auto-aging', 'Auto Aging dashboard'],
  ['Auto Aging', '/auto-aging/vehicles', 'Vehicle explorer'],
  ['Auto Aging', `/auto-aging/vehicles/${encodeURIComponent(samples.vehicle)}`, 'Vehicle detail'],
  ['Auto Aging', `/auto-aging/lifecycle/${encodeURIComponent(samples.vehicle)}`, 'Vehicle lifecycle'],
  ['Auto Aging', '/auto-aging/import', 'Import'],
  ['Auto Aging', '/auto-aging/review', 'Review'],
  ['Auto Aging', '/auto-aging/history', 'History'],
  ['Auto Aging', '/auto-aging/quality', 'Quality'],
  ['Auto Aging', '/auto-aging/sla', 'SLA'],
  ['Auto Aging', '/auto-aging/mappings', 'Mappings'],
  ['Auto Aging', '/auto-aging/commissions', 'Commissions'],
  ['Auto Aging', '/auto-aging/reports', 'Reports'],

  ['Sales', '/sales', 'Sales overview'],
  ['Sales', '/sales/pipeline', 'Deal pipeline'],
  ['Sales', '/sales/deals', 'Deals list'],
  ['Sales', '/sales/deals/new', 'New deal'],
  ['Sales', `/sales/deals/${samples.deal}`, 'Deal detail'],
  ['Sales', '/sales/orders', 'Legacy sales orders redirect'],
  ['Sales', '/sales/lead-intake', 'Lead intake'],
  ['Sales', '/sales/performance', 'Performance'],
  ['Sales', '/sales/margin', 'Margin'],
  ['Sales', '/sales/invoices', 'Invoices'],
  ['Sales', '/sales/customers', 'Customers'],
  ['Sales', `/sales/customers/${samples.customer}`, 'Customer detail'],
  ['Sales', '/sales/dealer-invoices', 'Dealer invoices'],
  ['Sales', '/sales/verify-or', 'Verify OR'],
  ['Sales', '/sales/outstanding', 'Outstanding legacy'],
  ['Sales', '/sales/outstanding-new', 'Outstanding deals'],
  ['Sales', '/sales/advisors', 'Sales advisors'],

  ['Inventory', '/inventory/stock', 'Stock'],
  ['Inventory', '/inventory/chassis-filter', 'Chassis filter'],
  ['Inventory', '/inventory/transfers', 'Transfers'],
  ['Inventory', '/inventory/chassis', 'Chassis movement'],

  ['Purchasing', '/purchasing/invoices', 'Purchase invoices'],
  ['Purchasing', `/purchasing/invoices/${samples.purchaseInvoice}`, 'Purchase invoice detail'],
  ['Purchasing', '/purchasing/orders', 'Purchase orders'],
  ['Purchasing', '/purchasing/orders/new', 'New purchase order'],
  ['Purchasing', '/purchasing/grn', 'GRN list'],
  ['Purchasing', '/purchasing/grn/new', 'New GRN'],
  ['Purchasing', '/purchasing/three-way-match', 'Three-way match'],

  ['Finance', '/accounts/chart', 'Chart of accounts'],
  ['Finance', '/accounts/periods', 'Accounting periods'],
  ['Finance', '/accounts/trial-balance', 'Trial balance'],
  ['Finance', '/accounts/profit-loss', 'Profit/loss'],
  ['Finance', '/accounts/balance-sheet', 'Balance sheet'],
  ['Finance', '/accounts/aging-by-branch', 'Aging by branch'],
  ['Finance', '/accounts/cash-position', 'Cash position'],
  ['Finance', '/accounts/period-close', 'Period close'],
  ['Finance', '/accounts/journal', 'Journal'],

  ['Reports', '/reports', 'Reports center'],
  ['HRMS', '/hrms', 'HRMS redirect/entry'],

  ['Admin', '/admin/activity', 'Activity'],
  ['Admin', '/admin/kpi-studio', 'KPI studio'],
  ['Admin', '/admin/dms-sync', 'DMS sync'],
  ['Admin', '/admin/reconciliation', 'Reconciliation'],
  ['Admin', '/admin/audit', 'Audit'],
  ['Admin', '/admin/webhooks', 'Webhooks'],
  ['Admin', '/admin/users', 'Users'],
  ['Admin', '/admin/user-groups', 'User groups'],
  ['Admin', '/admin/role-permissions', 'Role permissions'],
  ['Admin', '/admin/branches', 'Branches'],
  ['Admin', '/admin/master-data', 'Master data'],
  ['Admin', '/admin/suppliers', 'Suppliers'],
  ['Admin', '/admin/dealers', 'Dealers'],
  ['Admin', '/admin/settings', 'Settings'],
  ['Admin', '/admin/health', 'System health'],
];

function slug(s) {
  return s.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'root';
}

function classifyConsole(msg) {
  const text = msg.text();
  if (msg.type() === 'error') return true;
  return /failed|error|exception|undefined|chunk|cannot read|not found/i.test(text) && !/favicon/i.test(text);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !String(url).includes('/login'), { timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
}

async function auditRoute(page, route, opts = {}) {
  const [module, routePath, name] = route;
  const url = `${BASE}${routePath}`;
  const evidence = { module, path: routePath, name, url, status: 'unknown', loadMs: null, finalUrl: null, title: '', issues: [], console: [], pageErrors: [], failedRequests: [], screenshot: null, mainText: '' };
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];

  const onConsole = msg => { if (classifyConsole(msg)) consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 500) }); };
  const onPageError = err => pageErrors.push(String(err.stack || err.message || err).slice(0, 1000));
  const onResponse = res => {
    const request = res.request();
    const u = res.url();
    const status = res.status();
    if (status >= 400 && /ubs\.protonfookloi\.com|supabase|\/rest\/v1|\/rpc|\/functions\/v1|\/storage\/v1/.test(u) && !/favicon|source-map|\.map$/.test(u)) {
      failedRequests.push({ status, method: request.method(), url: u.replace(BASE, '').slice(0, 500) });
    }
  };
  const onRequestFailed = req => {
    const u = req.url();
    if (!/favicon|analytics|sentry|\.map$/.test(u)) failedRequests.push({ status: 'FAILED', method: req.method(), url: u.replace(BASE, '').slice(0, 500), failure: req.failure()?.errorText });
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const start = Date.now();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(opts.mobile ? 700 : 350);
    evidence.loadMs = Date.now() - start;
    evidence.finalUrl = page.url();
    evidence.title = await page.title();
    const bodyText = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    const mainText = (await page.locator('main').innerText({ timeout: 2500 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    evidence.mainText = mainText.slice(0, 600);

    if (!response || response.status() >= 400) evidence.issues.push(`Document status ${response?.status() ?? 'none'}`);
    if (/sign in/i.test(bodyText) && !routePath.includes('/login')) evidence.issues.push('Unexpected login screen/auth redirect');
    if (bodyText.length < 80) evidence.issues.push(`Very little body text (${bodyText.length} chars)`);
    if (/Something went wrong|Application error|Error boundary|Cannot read properties|undefined is not|ChunkLoadError|Failed to fetch dynamically imported module/i.test(bodyText)) evidence.issues.push('Visible runtime/error-boundary text');
    if (/not found|page not found|404/i.test(bodyText) && routePath !== '/not-a-real-route-audit') evidence.issues.push('Visible not-found text on registered route');
    if (evidence.loadMs > 10000) evidence.issues.push(`Severe slow load ${evidence.loadMs}ms`);
    else if (evidence.loadMs > 5000) evidence.issues.push(`Slow load ${evidence.loadMs}ms`);

    if (routePath === '/sales/orders' && !evidence.finalUrl.includes('/sales/deals')) evidence.issues.push('Legacy Sales Orders did not redirect to Deals');

    evidence.console = consoleMessages;
    evidence.pageErrors = pageErrors;
    evidence.failedRequests = failedRequests;
    if (consoleMessages.length) evidence.issues.push(`${consoleMessages.length} critical console message(s)`);
    if (pageErrors.length) evidence.issues.push(`${pageErrors.length} page error(s)`);
    if (failedRequests.length) evidence.issues.push(`${failedRequests.length} failed/4xx/5xx request(s)`);
    evidence.status = evidence.issues.length ? 'issue' : 'ok';
  } catch (err) {
    evidence.status = 'crash';
    evidence.issues.push(`Navigation exception: ${String(err.message || err).slice(0, 500)}`);
  }

  if (evidence.status !== 'ok') {
    const file = path.join(OUT, 'screenshots', `${opts.mobile ? 'mobile-' : ''}${slug(routePath)}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    evidence.screenshot = file;
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  page.off('requestfailed', onRequestFailed);
  return evidence;
}

async function draftPersistenceAudit(page) {
  const result = { name: 'Portal new request draft persistence/tab switch', status: 'unknown', issues: [], details: {} };
  try {
    await page.goto(`${BASE}/portal/tickets/new`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const before = await page.locator('body').innerText().catch(() => '');
    const input = page.locator('input, textarea').first();
    if (!(await input.count())) {
      result.status = 'skipped';
      result.issues.push('No input/textarea available on New Request page');
      result.details.body = before.slice(0, 500);
      return result;
    }
    const marker = `AUDIT-20260625 draft ${Date.now()}`;
    await input.fill(marker);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => {});
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const after = await page.locator('body').innerText().catch(() => '');
    const values = await page.locator('input, textarea').evaluateAll(nodes => nodes.map(n => n.value));
    result.details.values = values.slice(0, 5);
    if (!values.some(v => v.includes(marker)) && !after.includes(marker)) {
      result.status = 'issue';
      result.issues.push('Draft input did not persist after route away/back');
    } else {
      result.status = 'ok';
    }
  } catch (err) {
    result.status = 'crash';
    result.issues.push(String(err.message || err).slice(0, 500));
  }
  if (result.status !== 'ok') {
    const file = path.join(OUT, 'screenshots', 'workflow-draft-persistence.png');
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    result.screenshot = file;
  }
  return result;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await login(page);

const results = [];
for (const route of routes) {
  const res = await auditRoute(page, route);
  results.push(res);
  console.log(`${res.status.toUpperCase()} ${route[1]} ${res.loadMs ?? '-'}ms ${res.issues.join('; ')}`);
}

// Reload/back/forward checks on critical routes
const navChecks = [];
for (const route of routes.filter(r => ['/', '/portal/tickets', `/portal/tickets/${samples.ticket}`, '/sales/deals', `/sales/deals/${samples.deal}`, '/reports', '/admin/health'].includes(r[1]))) {
  const check = { path: route[1], status: 'ok', issues: [] };
  try {
    await page.goto(`${BASE}${route[1]}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (/Something went wrong|Application error|Sign In/i.test(text)) check.issues.push('Reload/back/forward led to error/auth state');
  } catch (err) {
    check.status = 'crash';
    check.issues.push(String(err.message || err).slice(0, 500));
  }
  if (check.issues.length) check.status = 'issue';
  navChecks.push(check);
}

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
const mobilePage = await mobileContext.newPage();
await login(mobilePage);
const mobileRoutes = routes.filter(r => ['/', '/portal/tickets/new', '/portal/tickets', '/sales/deals', `/sales/deals/${samples.deal}`, '/auto-aging/vehicles', '/reports', '/admin/users'].includes(r[1]));
const mobileResults = [];
for (const route of mobileRoutes) mobileResults.push(await auditRoute(mobilePage, route, { mobile: true }));

const workflowResults = [await draftPersistenceAudit(page)];

const summary = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  samples,
  totals: {
    routes: results.length,
    routeIssues: results.filter(r => r.status !== 'ok').length,
    crashes: results.filter(r => r.status === 'crash').length,
    mobileRoutes: mobileResults.length,
    mobileIssues: mobileResults.filter(r => r.status !== 'ok').length,
    navChecks: navChecks.length,
    navIssues: navChecks.filter(r => r.status !== 'ok').length,
    workflows: workflowResults.length,
    workflowIssues: workflowResults.filter(r => r.status !== 'ok').length,
  },
  results,
  navChecks,
  mobileResults,
  workflowResults,
};

await fs.writeFile(path.join(OUT, 'audit-results.json'), JSON.stringify(summary, null, 2));
const issueRows = [...results, ...mobileResults.map(r => ({ ...r, path: `mobile:${r.path}` })), ...workflowResults]
  .filter(r => r.status !== 'ok')
  .map(r => `| ${r.status} | ${r.module || 'Workflow'} | ${r.path || r.name} | ${(r.issues || []).join('<br>')} | ${r.screenshot ? `\`${r.screenshot}\`` : ''} |`)
  .join('\n');
const md = `# Production WebApp Audit Results\n\nGenerated: ${summary.generatedAt}\n\n## Summary\n\n\`\`\`json\n${JSON.stringify(summary.totals, null, 2)}\n\`\`\`\n\n## Issues\n\n| Status | Module | Route/Workflow | Issues | Screenshot |\n|---|---|---|---|---|\n${issueRows || '| ok | all | all audited routes | No issues detected | |'}\n`;
await fs.writeFile(path.join(OUT, 'audit-results.md'), md);
await browser.close();
console.log(`AUDIT_RESULTS ${path.join(OUT, 'audit-results.json')} ${path.join(OUT, 'audit-results.md')}`);
