import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config for READ-ONLY data extraction from the external
 * Proton CRM site (https://fookloi.net/proton).
 *
 * Design goals:
 *  - One worker, one page at a time — no parallel load on the remote server
 *  - Long timeouts to be patient with a PHP server behind a firewall
 *  - Completely isolated from the UBS app tests
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/proton-extract.spec.ts",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 120_000,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../playwright-report/proton-extract" }],
  ],

  use: {
    baseURL: "https://fookloi.net/proton/",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },

  outputDir: "../test-results/proton-extract-artifacts",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
