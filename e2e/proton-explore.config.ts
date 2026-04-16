import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config for READ-ONLY exploration of the external
 * Proton CRM site (https://fookloi.net/proton).
 *
 * Completely isolated from the UBS app tests (e2e/playwright.config.ts /
 * playwright.config.ts). Nothing in this config touches localhost.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/proton-explore.spec.ts",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60_000,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../playwright-report/proton" }],
  ],

  use: {
    baseURL: "https://fookloi.net/proton/",
    headless: true,
    screenshot: "on",
    video: "retain-on-failure",
    // Give each navigation action a generous timeout for a remote PHP site
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  outputDir: "../test-results/proton-screenshots",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
