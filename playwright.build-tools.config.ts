import { defineConfig } from '@playwright/test';
import path from 'node:path';

// This suite never accepts credentials or an external production endpoint.
const safeEnvironment = {
  VITE_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'ci_placeholder_anon_key_do_not_use_in_production',
  VITE_HRMS_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
  VITE_HRMS_SUPABASE_ANON_KEY: 'ci_placeholder_anon_key_do_not_use_in_production',
  VITE_HRMS_APP_URL: 'https://hrms.example.test',
};
Object.assign(process.env, safeEnvironment);
const preview = process.env.SB_SERVER === 'preview';
const basePort = Number(process.env.SB_PORT_BASE ?? 3190);
const evidence = process.env.SB_EVIDENCE_DIR;
if (!evidence) throw new Error('SB_EVIDENCE_DIR must name an owned evidence directory');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'build-tool-compatibility.spec.ts',
  workers: 1,
  retries: 0,
  updateSnapshots: 'none',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: path.join(evidence, 'test-results'),
  use: { timezoneId: 'Asia/Kuala_Lumpur', locale: 'en-MY', serviceWorkers: 'block', screenshot: 'only-on-failure', actionTimeout: 10_000 },
  snapshotPathTemplate: `${process.env.SB_REFERENCE_DIR ?? evidence}/{projectName}/{arg}{ext}`,
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({
    name: browserName,
    use: { browserName: browserName as 'chromium' | 'firefox' | 'webkit' },
  })),
  webServer: ['', '--workspace @flc/hrms-web', '--workspace hrms-mobile'].map((workspace, index) => ({
    command: `npm run ${preview ? 'preview' : 'dev'} ${workspace} -- --host 127.0.0.1 --port ${basePort + index + 1} --strictPort`,
    url: `http://127.0.0.1:${basePort + index + 1}`,
    env: safeEnvironment,
    reuseExistingServer: false,
    timeout: 120_000,
  })),
});
