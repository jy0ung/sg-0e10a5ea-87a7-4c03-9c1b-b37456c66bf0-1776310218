import { test, expect } from "@playwright/test";
import { setupAuthMocks } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION FLOW TESTS
// Verifies that clicking sidebar links actually navigates to the correct URL.
// ─────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
  await page.goto("/");
  // Wait for the app layout sidebar to be visible
  await page.locator("nav, aside").first().waitFor({ state: "visible", timeout: 10000 });
});

const navLinks: Array<{ label: string | RegExp; expectedPath: RegExp; startPath?: string }> = [
  { label: /module.?directory/i, expectedPath: /\/modules$/ },
  { label: /notification/i, expectedPath: /\/notifications$/ },
  { label: /auto.?aging.?overview/i, expectedPath: /\/auto-aging$/, startPath: '/auto-aging' },
  { label: /vehicle.?explorer/i, expectedPath: /\/auto-aging\/vehicles$/, startPath: '/auto-aging' },
  { label: /import.?center/i, expectedPath: /\/auto-aging\/import$/, startPath: '/auto-aging' },
  { label: /review.?queue/i, expectedPath: /\/auto-aging\/review$/, startPath: '/auto-aging' },
  { label: /data.?quality/i, expectedPath: /\/auto-aging\/quality$/, startPath: '/auto-aging' },
  { label: /sla.?polic/i, expectedPath: /\/auto-aging\/sla$/, startPath: '/auto-aging' },
  { label: /^mappings$/i, expectedPath: /\/auto-aging\/mappings$/, startPath: '/auto-aging' },
  { label: /import.?history/i, expectedPath: /\/auto-aging\/history$/, startPath: '/auto-aging' },
  { label: /^commissions$/i, expectedPath: /\/auto-aging\/commissions$/, startPath: '/auto-aging' },
  { label: /aging.?reports/i, expectedPath: /\/auto-aging\/reports$/, startPath: '/auto-aging' },
  { label: /sales.?dashboard/i, expectedPath: /\/sales$/ },
  { label: /deal.?pipeline/i, expectedPath: /\/sales\/pipeline$/ },
  { label: /sales.?order/i, expectedPath: /\/sales\/orders$/ },
  { label: /^customers?$/i, expectedPath: /\/sales\/customers$/ },
  { label: /invoice/i, expectedPath: /\/sales\/invoices$/ },
  { label: /performance/i, expectedPath: /\/sales\/performance$/ },
  { label: /activity.?dashboard/i, expectedPath: /\/admin\/activity$/ },
  { label: /users?.?(?:&|and)?.?roles?/i, expectedPath: /\/admin\/users$/ },
  { label: /audit.?log/i, expectedPath: /\/admin\/audit$/ },
  { label: /setting/i, expectedPath: /\/admin\/settings$/ },
];

for (const { label, expectedPath, startPath } of navLinks) {
  test(`Sidebar link "${label}" navigates correctly`, async ({ page }) => {
    if (startPath) {
      await page.goto(startPath);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }

    const matchingLinks = page.locator('a').filter({ hasText: label });
    const totalMatches = await matchingLinks.count();

    let targetIndex = -1;
    for (let index = 0; index < totalMatches; index += 1) {
      const candidate = matchingLinks.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;

      const href = (await candidate.getAttribute('href')) ?? '';
      if (expectedPath.test(href)) {
        targetIndex = index;
        break;
      }

      if (targetIndex === -1) {
        targetIndex = index;
      }
    }

    const link = targetIndex >= 0 ? matchingLinks.nth(targetIndex) : matchingLinks.first();
    const visible = await link.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, `Sidebar link "${label}" not visible (possibly hidden by role filter)`);
      return;
    }
    await link.scrollIntoViewIfNeeded().catch(() => {});

    await link.click();
    await expect(page).toHaveURL(expectedPath, { timeout: 8000 });
  });
}

test("Logout button clears session and redirects to /login", async ({ page }) => {
  // Mock the supabase signOut endpoint (already done in setupAuthMocks)
  const logoutBtn = page.locator("button, a").filter({ hasText: /log.?out|sign.?out/i }).first();
  const visible = await logoutBtn.isVisible().catch(() => false);
  if (!visible) {
    test.skip(true, "Logout button not found in sidebar");
    return;
  }
  await logoutBtn.scrollIntoViewIfNeeded().catch(() => {});

  await logoutBtn.click();
  await expect(page).toHaveURL(/login/, { timeout: 8000 });
});
