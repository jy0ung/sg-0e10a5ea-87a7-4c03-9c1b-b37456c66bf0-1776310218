import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/main-deploy.yml'),
  'utf8',
);

describe('production deploy workflow safety boundary', () => {
  it('requires an explicit manual dispatch instead of auto-deploying after CI', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('workflow_run:');
  });

  it('installs Chromium whenever production verification runs', () => {
    const installStep = [
      '- name: Install Playwright Chromium for production verification',
      'run: npx playwright install --with-deps chromium',
    ].join('\n');

    expect(workflow).toContain(installStep);
    expect(workflow).not.toMatch(
      /Install Playwright Chromium for production verification\n\s+if:/,
    );
  });

  it('only requires credentialed browser login when the credential precheck passed', () => {
    expect(workflow).toContain(
      "PROD_LOGIN_REQUIRED: ${{ steps.login.outputs.enabled == 'true' && '1' || '0' }}",
    );
  });
});
