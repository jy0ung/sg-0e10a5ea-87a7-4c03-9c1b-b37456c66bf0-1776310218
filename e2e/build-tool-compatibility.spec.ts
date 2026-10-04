/** Owned synthetic API/auth fixtures. This is CSS/interaction evidence, not live DB acceptance. */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MOCK_PROFILE, MOCK_USER, SUPABASE_URL, setupAuthMocks } from './helpers/auth-mock';

const evidence = process.env.SB_EVIDENCE_DIR!;
const reference = process.env.SB_REFERENCE_DIR;
const sourceControl = process.env.SB_SOURCE_CONTROL_DIR;
const capture = process.env.SB_CAPTURE_BASELINE === '1';
if (!capture && !reference) throw new Error('Candidate requires SB_REFERENCE_DIR; never silently bless new snapshots');
const basePort = Number(process.env.SB_PORT_BASE ?? 3190);
const company = MOCK_PROFILE.company_id;
const employeeId = '10000000-0000-4000-8000-000000000001';
const fixtureProfile = { ...MOCK_PROFILE, status: 'active', employee_id: employeeId, created_at: '2026-01-01T00:00:00Z' };
const employees = Array.from({ length: 12 }, (_, i) => ({
  id: i === 0 ? employeeId : `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  company_id: company, name: `Casey Employee ${String(i + 1).padStart(2, '0')}`,
  staff_code: `CSS${i + 1}`, work_email: `css${i + 1}@example.test`, personal_email: null,
  primary_role: i === 0 ? 'super_admin' : 'sales', status: 'active', contact_no: '0123456789',
  join_date: '2026-01-01', branch_id: null, department: { name: 'People Operations' }, job_title: { name: 'Advisor' },
}));
const profiles = [fixtureProfile, ...employees.slice(1).map(e => ({
  ...fixtureProfile, id: e.id, name: e.name, email: e.work_email, role: 'sales', access_scope: 'self', employee_id: e.id,
}))];
const properties = [
  'color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'outline-color', 'outline-width', 'outline-style', 'outline-offset', 'font-family', 'font-size',
  'font-weight', 'line-height', 'letter-spacing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap', 'display', 'position',
  'overflow-x', 'overflow-y', 'z-index', 'opacity', 'text-align', 'vertical-align', 'white-space', 'cursor',
];

async function fixtures(page: Page, dark: boolean) {
  // Deny all external traffic first; specific synthetic API handlers below override it.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    return route.abort();
  });
  await setupAuthMocks(page);
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: MOCK_USER.id, aud: 'authenticated', role: 'authenticated', exp: 9999999999 })).toString('base64url')}.fakesignature`;
  const session = { access_token: token, token_type: 'bearer', expires_in: 9999999, expires_at: 9999999999, refresh_token: 'fake-refresh-token', user: MOCK_USER };
  await page.addInitScript(({ dark, session, user }) => {
    localStorage.setItem('flc.hrms.auth.session', JSON.stringify(session));
    localStorage.setItem('flc.hrms.auth.session-user', JSON.stringify({ user }));
    localStorage.setItem('flc-ui-theme', dark ? 'dark' : 'light');
    localStorage.setItem('flc-hrms-theme', dark ? 'dark' : 'light');
    const applyMobileClass = () => document.documentElement.classList.toggle('dark', dark);
    if (document.documentElement) applyMobileClass();
    else document.addEventListener('DOMContentLoaded', applyMobileClass, { once: true });
  }, { dark, session, user: MOCK_USER });
  await page.clock.setFixedTime(new Date('2026-10-04T04:00:00Z'));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').at(-1);
    const single = (route.request().headers().accept ?? '').includes('pgrst.object');
    let rows: unknown[] = [];
    if (table === 'profiles') rows = url.searchParams.has('id') ? [fixtureProfile] : profiles;
    if (table === 'employees') rows = url.searchParams.has('id') ? [employees[0]] : employees;
    if (table === 'companies') rows = [{ id: company, name: 'CSS Fixture Company', code: 'CSS' }];
    if (table === 'module_settings') rows = [{ company_id: company, module_id: 'hrms', is_active: true }];
    if (table === 'leave_types') rows = [{ id: employeeId, name: 'Annual Leave', days_per_year: 20, requires_balance: false }];
    if (table === 'leave_requests' && route.request().method() === 'POST') rows = [{ id: employeeId, ...route.request().postDataJSON() }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) });
  });
}

async function record(page: Page, name: string, engine: string) {
  await page.mouse.move(0, 0); // neutral hover state even when a portal covers the prior click target
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100); // let hover invalidation enqueue its transitions before finishing them
  // Finish finite CSS animations before BOTH style capture and screenshots.
  // A fixed sleep captured intermediate WebKit frames under CPU contention.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.finish();
    }
  });
  await page.waitForTimeout(50);
  const folder = path.join(evidence, engine);
  mkdirSync(folder, { recursive: true });
  const styles = await page.locator('body').evaluate((body, properties) => {
    const nodes = [body, ...Array.from(body.querySelectorAll('*'))].filter(el => {
      const tag = el.tagName.toLowerCase();
      return !['script', 'style', 'link', 'svg', 'path', 'circle', 'line', 'rect', 'polyline'].includes(tag);
    });
    return nodes.map((el, index) => {
      const style = getComputedStyle(el); const box = el.getBoundingClientRect();
      return { index, tag: el.tagName, classes: el.className, text: (el.textContent ?? '').slice(0, 100),
        rect: [box.x, box.y, box.width, box.height].map(n => Math.round(n * 100) / 100),
        styles: Object.fromEntries(properties.map(p => [p, style.getPropertyValue(p)])) };
    });
  }, properties);
  writeFileSync(path.join(folder, `${name}.json`), JSON.stringify(styles, null, 2));
  const screenshot = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: false });
  writeFileSync(path.join(folder, `${name}.png`), screenshot);
  if (!capture) {
    const baseline = JSON.parse(readFileSync(path.join(reference!, engine, `${name}.json`), 'utf8'));
    const changes: unknown[] = [];
    for (let i = 0; i < Math.max(styles.length, baseline.length); i++) {
      const before = baseline[i], after = styles[i];
      if (!before || !after || before.tag !== after.tag || before.text !== after.text) { changes.push({ index: i, before, after }); continue; }
      for (const property of properties) if (before.styles[property] !== after.styles[property]) changes.push({ index: i, tag: after.tag, classes: after.classes, property, before: before.styles[property], after: after.styles[property] });
      if (JSON.stringify(before.rect) !== JSON.stringify(after.rect)) changes.push({ index: i, property: 'rect', before: before.rect, after: after.rect });
    }
    writeFileSync(path.join(folder, `${name}.changes.json`), JSON.stringify(changes, null, 2));
    // Preserve every raw difference. Resolve only equivalent color serialization and
    // zero-area/transparent shadow bookkeeping; never exempt geometry or visible paint.
    const controlled = sourceControl && name.startsWith('hrms-web-')
      ? JSON.parse(readFileSync(path.join(sourceControl, engine, `${name}.json`), 'utf8')) : null;
    const reviewed = await page.evaluate(({ changes, controlled }) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const color = (value: string) => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].join(',');
      };
      const shadow = (value: string) => {
        if (value === 'none') return [];
        return value.split(/,(?![^()]*\))/).flatMap(part => {
          const match = part.match(/rgba?\([^)]+\)|oklab\([^)]+\)|color\([^)]+\)/);
          const dimensions = part.replace(match?.[0] ?? '', '').match(/-?[\d.]+px/g) ?? [];
          const paint = color(match?.[0] ?? 'transparent');
          if (paint.endsWith(',0') || dimensions.every(n => parseFloat(n) === 0)) return [];
          return [{ inset: part.includes('inset'), dimensions, paint }];
        });
      };
      return changes.map(item => {
        const change = item as { index: number; property?: string; before?: string; after?: string };
        let explanation: string | null = null;
        if (change.property?.endsWith('color') && typeof change.before === 'string' && typeof change.after === 'string' && color(change.before) === color(change.after)) explanation = 'Same canvas sRGB/alpha paint; modern CSS color serialization differs.';
        const families = (value: string) => value.split(',').map(family => family.trim().replace(/^(['"])(.*)\1$/, '$2')).join(',');
        if (change.property === 'font-family' && families(change.before!) === families(change.after!)) explanation = 'Identical ordered font fallback chain; optimizer omits optional family-name quotes.';
        if (change.property === 'box-shadow'  && JSON.stringify(shadow(change.before!)) === JSON.stringify(shadow(change.after!))) explanation = 'Same visible shadow stack; extra transparent/zero-area Tailwind 4 bookkeeping shadows.';
        const expected = controlled?.[change.index]?.styles[change.property ?? ''];
        if (!explanation && expected && change.property?.endsWith('color') && color(expected) === color(change.after!)) explanation = 'Source-only Tailwind 3 control reproduces the restored shared-source paint; equivalent CSS color serialization.';
        if (!explanation && expected && change.property === 'box-shadow' && JSON.stringify(shadow(expected)) === JSON.stringify(shadow(change.after!))) explanation = 'Source-only Tailwind 3 control reproduces the restored shared-source visible shadow stack.';
        return { ...change, explanation };
      });
    }, { changes, controlled });
    writeFileSync(path.join(folder, `${name}.reviewed.json`), JSON.stringify(reviewed, null, 2));
    // A source-only Tailwind 3 control isolates the pre-existing HRMS missing
    // shared-package scan. Preserve the original baseline and every raw delta;
    // accept this explicit source correction only when the unchanged v3 compiler
    // independently produces the exact candidate value for that property/node.
    const finalReview = reviewed.map(item => {
      const change = item as { index: number; property?: string; after?: unknown; explanation: string | null };
      const node = controlled?.[change.index];
      const expected = change.property === 'rect' ? node?.rect : node?.styles[change.property ?? ''];
      if (!change.explanation && node && !change.property && JSON.stringify(node) === JSON.stringify(change.after)) {
        return { ...change, explanation: 'Exact DOM/style node independently reproduced by source-only Tailwind 3 control (restored Select scroll affordance / following hidden Radix node).' };
      }
      if (!change.explanation && node && change.property && JSON.stringify(expected) === JSON.stringify(change.after)) {
        return { ...change, explanation: 'Shared-package scanning restoration: exact value independently reproduced by source-only Tailwind 3 control.' };
      }
      return change;
    });
    writeFileSync(path.join(folder, `${name}.reviewed.json`), JSON.stringify(finalReview, null, 2));
    const unexplained = finalReview.filter(change => !change.explanation);
    writeFileSync(path.join(folder, `${name}.unexplained.json`), JSON.stringify(unexplained, null, 2));
    expect.soft(unexplained.length, `Review every changed property in ${name}.reviewed.json`).toBe(0);
    // Same host/engine/font fixtures. A 0.1 YIQ threshold allows tiny
    // edge rasterization changes (reviewed raw Chromium probe: <=11/255 channel delta,
    // identical geometry/paint styles); zero pixels may exceed that threshold.
    // No candidate snapshot creation/rebaselining is allowed by the config.
    if (controlled) {
      // Pixel equality is against the independently reconstructed source-only
      // control, never a newly blessed candidate. Original before/after PNGs stay.
      expect.soft(screenshot).toMatchSnapshot(`${name}-source-control.png`, { threshold: 0.1, maxDiffPixels: 0 });
    } else {
      expect.soft(screenshot).toMatchSnapshot(`${name}.png`, { threshold: 0.1, maxDiffPixels: 0 });
    }
  }
}

for (const app of ['ubs', 'hrms-web', 'hrms-mobile'] as const) {
  for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    for (const dark of [false, true]) {
      test(`${app} ${size} ${dark ? 'dark' : 'light'} real screens, forms and keyboard interaction`, async ({ page, browser, browserName }) => {
        await page.setViewportSize({ width, height });
        await fixtures(page, dark);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const origin = `http://127.0.0.1:${basePort + ['ubs', 'hrms-web', 'hrms-mobile'].indexOf(app) + 1}`;
        const name = `${app}-${size}-${dark ? 'dark' : 'light'}`;
        if (app === 'ubs') {
          await page.goto(`${origin}/admin/users`);
          await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
          await expect(page.getByText('Casey Employee 02', { exact: true })).toBeVisible();
          await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /light/);
          const filter = page.getByPlaceholder('Search users, roles, branches...');
          await filter.fill('Casey');
          await expect(page.getByRole('table').getByRole('row')).toHaveCount(12);
          await record(page, `${name}-table`, browserName);
          await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
          await expect(page.getByRole('dialog')).toBeVisible();
          const input = page.getByRole('dialog').getByRole('textbox').first();
          await input.fill(''); await input.press('Tab');
          await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
          await input.focus();
          await record(page, `${name}-form`, browserName);
          await input.fill('Edited CSS Fixture');
          await expect(page.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await page.goto(`${origin}/profile`);
          await page.getByLabel('Display Name').fill('CSS unsaved fixture');
          await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Security' }).click();
          await expect(page.getByRole('alertdialog')).toContainText('Unsaved changes');
          await record(page, `${name}-overlay`, browserName);
          await page.getByRole('button', { name: 'Stay and save' }).click();
          await expect(page.getByLabel('Display Name')).toHaveValue('CSS unsaved fixture');
          await page.emulateMedia({ reducedMotion: 'reduce' });
          expect(await page.locator('.motion-safe\\:animate-fade-in').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
        } else if (app === 'hrms-web') {
          await page.goto(`${origin}/employees`);
          await expect(page.getByRole('heading', { name: 'Employee Directory', exact: true })).toBeVisible();
          await expect(page.getByText('Casey Employee 02', { exact: true })).toBeVisible();
          await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /light/);
          await page.getByPlaceholder('Code, name, email…').fill('Casey');
          await record(page, `${name}-table`, browserName);
          await page.getByRole('button', { name: 'New Employee' }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await page.getByLabel('Full Name *', { exact: true }).fill('CSS Draft Employee');
          await page.getByLabel('Staff Code *', { exact: true }).focus();
          await record(page, `${name}-form`, browserName);
          await page.getByRole('dialog').getByRole('combobox').first().focus();
          await page.keyboard.press('Space');
          await expect(page.getByRole('listbox')).toBeVisible();
          await record(page, `${name}-overlay`, browserName);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('listbox')).toHaveCount(0);
          const cancel = page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true });
          await cancel.focus(); await cancel.press('Enter');
          await expect(page.getByRole('dialog')).toHaveCount(0);
        } else {
          await page.goto(`${origin}/profile`);
          await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
          await record(page, `${name}-profile`, browserName);
          const contact = page.getByLabel('Contact No');
          await contact.fill('0123456780'); await contact.focus();
          await expect(page.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
          await record(page, `${name}-focus`, browserName);
          await page.goto(`${origin}/leave`);
          await page.getByRole('button', { name: 'Submit Request' }).click();
          await expect(page.getByText('Select a leave type', { exact: false })).toBeVisible();
          await record(page, `${name}-validation`, browserName);
          await page.getByLabel('Leave Type').selectOption(employeeId);
          await page.getByLabel('Start Date').fill('2026-10-06');
          await page.getByLabel('End Date').fill('2026-10-06');
          await page.getByRole('button', { name: 'Submit Request' }).click();
          await expect(page.getByText('Leave request submitted successfully!')).toBeVisible();
        }
        expect(errors, 'No unhandled browser JavaScript errors').toEqual([]);
        mkdirSync(path.join(evidence, browserName), { recursive: true });
        writeFileSync(path.join(evidence, browserName, `${name}-engine.json`), JSON.stringify({ browserName, version: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), renderedTheme: await page.locator('html').getAttribute('class'), viewport: { width, height }, app, dark, server: process.env.SB_SERVER ?? 'dev', fixture: 'mocked auth/API, all external requests blocked' }, null, 2));
      });
    }
  }
}

if (process.env.SB_SERVER !== 'preview') test('actual shared UI consumers retain overrides, state variants, focus and animation', async ({ page, browserName }) => {
  await fixtures(page, false);
  await page.goto(`http://127.0.0.1:${basePort + 1}/e2e/fixtures/build-tools.html`);
  await expect(page.getByTestId('sibling-spacing').getByText('First visible sibling')).toHaveCSS('margin-top', '16px');
  await expect(page.getByTestId('sibling-spacing').getByText('Second visible sibling')).toHaveCSS('margin-top', '24px');
  const button = page.getByRole('button', { name: 'Class overrides' });
  await expect(button).toHaveCSS('padding-left', '24px');
  await expect(button).toHaveCSS('font-size', '18px');
  await expect(button).toHaveCSS('height', '40px');
  await expect(page.getByRole('button', { name: 'Disabled fixture' })).toBeDisabled();
  await button.click();
  const input = page.getByRole('textbox', { name: 'Required fixture input' });
  expect(await input.evaluate(el => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
  await input.fill('Owned fixture'); await input.press('Tab');
  await expect(button).toBeFocused(); await button.press('Enter');
  await expect(page.locator('form')).toHaveAttribute('data-submitted', 'true');
  await page.getByRole('tab', { name: 'Second tab' }).click();
  await expect(page.getByRole('tabpanel')).toHaveText('Second panel');
  await page.getByRole('button', { name: 'Expandable details' }).click();
  await expect(page.getByRole('button', { name: 'Expandable details' })).toHaveAttribute('data-state', 'open');
  await expect(page.getByText('Accordion content', { exact: true })).toBeVisible();
  await record(page, 'shared-ui-open-state', browserName);
  await input.focus();
  await record(page, 'shared-ui-focus', browserName);
  await page.getByRole('button', { name: 'Open popover' }).click();
  await expect(page.getByText('Positioned popover', { exact: true })).toBeVisible();
  await record(page, 'shared-ui-popover', browserName);
  await page.keyboard.press('Escape');
  const dialogTrigger = page.getByRole('button', { name: 'Open fixture dialog' });
  await dialogTrigger.click();
  await expect(page.getByRole('dialog')).toHaveCSS('position', 'fixed');
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'enter');
  await page.getByRole('textbox', { name: 'Dialog input' }).press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialogTrigger).toBeFocused();
  await page.emulateMedia({ forcedColors: 'active' });
  await input.focus();
  await expect(input).toHaveCSS('outline-style', 'solid');
  await expect(input).toHaveCSS('outline-width', '2px');
  await expect(input).toHaveCSS('outline-offset', '2px');
});
