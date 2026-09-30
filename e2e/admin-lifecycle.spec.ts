import { test, expect } from '@playwright/test';
import { setupAuthMocks } from './helpers/auth-mock';

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
});

test('tab visibility and token refresh preserve a dirty Profile; navigation still asks', async ({ page, context }) => {
  await page.goto('/profile');
  const name = page.getByLabel('Display Name');
  await expect(name).toBeVisible();
  await name.fill('Draft stays on this page');
  const before = await page.evaluate(() => {
    const trace = window.__flcLifecycleDiagnostics!;
    return { bootId: trace.bootId, events: trace.read() };
  });
  expect(before.events.some(event => event.type === 'form_dirty' && event.formId === 'my-profile' && event.dirty)).toBe(true);

  const otherTab = await context.newPage();
  await otherTab.goto('about:blank');
  await otherTab.bringToFront();
  await page.bringToFront();
  await otherTab.close();
  // Headless Chromium can keep both pages visible. Dispatch the browser event
  // as the deterministic equivalent after attempting an actual tab switch.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(name).toHaveValue('Draft stays on this page');

  await page.evaluate(async () => {
    const { supabase } = await import('/packages/supabase/src/client.ts');
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
  });
  await expect.poll(() => page.evaluate(() => window.__flcLifecycleDiagnostics!.read().some(event =>
    event.type === 'auth' && event.authEvent === 'TOKEN_REFRESHED' && event.sessionPresent,
  ))).toBe(true);
  await expect(name).toHaveValue('Draft stays on this page');
  await expect(page).toHaveURL(/\/profile$/);

  const after = await page.evaluate(() => ({ bootId: window.__flcLifecycleDiagnostics!.bootId, events: window.__flcLifecycleDiagnostics!.read() }));
  expect(after.bootId).toBe(before.bootId);
  for (const boundary of ['shell', 'profile']) {
    const firstMount = before.events.find(event => event.type === 'mount' && event.boundary === boundary)?.mountId;
    const lastMount = after.events.slice().reverse().find(event => event.type === 'mount' && event.boundary === boundary)?.mountId;
    expect(lastMount).toBe(firstMount);
    expect(after.events.some(event => event.type === 'unmount' && event.mountId === firstMount)).toBe(false);
  }
  expect(after.events.at(-1)?.dirtyFormIds).toContain('my-profile');
  expect(after.events.filter(event => event.type === 'visibility_change').length).toBeGreaterThan(
    before.events.filter(event => event.type === 'visibility_change').length,
  );
  expect(JSON.stringify(after.events)).not.toContain('Draft stays on this page');

  await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Security' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Unsaved changes');
  await page.getByRole('button', { name: 'Stay and save' }).click();
  await expect(name).toHaveValue('Draft stays on this page');
  await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Security' }).click();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/\/profile\/security$/);
  await page.getByRole('navigation', { name: 'My Account' }).getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/profile\/security$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/profile$/);
});

test('hard reload creates a new document boot with prior boot evidence', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByLabel('Display Name')).toBeVisible();
  const firstBoot = await page.evaluate(() => window.__flcLifecycleDiagnostics!.bootId);
  await page.reload();
  await expect(page.getByLabel('Display Name')).toBeVisible();
  const next = await page.evaluate(() => ({ bootId: window.__flcLifecycleDiagnostics!.bootId, events: window.__flcLifecycleDiagnostics!.read() }));
  expect(next.bootId).not.toBe(firstBoot);
  expect(next.events.find(event => event.type === 'document_boot' && event.bootId === next.bootId)).toMatchObject({
    previousBootId: firstBoot,
    navigationType: 'reload',
  });
});
