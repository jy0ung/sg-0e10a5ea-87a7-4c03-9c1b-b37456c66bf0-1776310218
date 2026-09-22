import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/main-deploy.yml'),
  'utf8',
);
const deployScript = readFileSync(
  resolve(process.cwd(), 'scripts/deploy-image.sh'),
  'utf8',
);

describe('production deploy workflow safety boundary', () => {
  it('requires an explicit manual dispatch instead of auto-deploying after CI', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('workflow_run:');
  });

  it('installs Chromium whenever production verification runs', () => {
    expect(workflow).toMatch(
      /- name: Install Playwright Chromium for production verification\n\s+run: npx playwright install --with-deps chromium/,
    );
    expect(workflow).not.toMatch(
      /Install Playwright Chromium for production verification\n\s+if:/,
    );
  });

  it('only requires credentialed browser login when the credential precheck passed', () => {
    expect(workflow).toContain(
      "PROD_LOGIN_REQUIRED: ${{ steps.login.outputs.enabled == 'true' && '1' || '0' }}",
    );
  });

  it('ships and requires a migration manifest before production promotion', () => {
    expect(workflow).toContain('Build release migration manifest');
    expect(workflow).toContain('scripts/verify-migration-ledger.sh');
    expect(workflow).toContain("VERIFY_MIGRATION_LEDGER='1'");
    expect(workflow).toContain("MIGRATION_MANIFEST='/tmp/flc-release-migrations.txt'");
  });

  it('verifies migration compatibility before touching the existing application container', () => {
    const ledgerCheck = deployScript.indexOf('Verifying release migrations against production DB ledger');
    const stopExisting = deployScript.indexOf('Stopping existing $CONTAINER_NAME');

    expect(ledgerCheck).toBeGreaterThan(-1);
    expect(stopExisting).toBeGreaterThan(-1);
    expect(ledgerCheck).toBeLessThan(stopExisting);
  });
});
