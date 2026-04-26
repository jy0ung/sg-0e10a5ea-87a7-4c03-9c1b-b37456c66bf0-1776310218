import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupAuthMocks } from "./helpers/auth-mock";

async function expectNoSeriousA11yViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const seriousViolations = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
    }));

  expect(seriousViolations).toEqual([]);
}

test.describe("accessibility smoke", () => {
  test.describe.configure({ timeout: 120_000 });

  test("public routes have no serious axe violations", async ({ page }) => {
    for (const path of ["/welcome", "/login"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectNoSeriousA11yViolations(page);
    }
  });

  test("critical authenticated routes have no serious axe violations", async ({ page }) => {
    await setupAuthMocks(page);

    for (const path of [
      "/",
      "/modules",
      "/notifications",
      "/auto-aging/vehicles",
      "/sales/customers",
      "/inventory/transfers",
      "/purchasing/invoices",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("text=Route Error")).toHaveCount(0);
      await expectNoSeriousA11yViolations(page);
    }
  });
});
