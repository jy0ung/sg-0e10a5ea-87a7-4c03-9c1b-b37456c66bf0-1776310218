import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDedicatedHrmsWorkspacePath,
  isHrmsWorkspacePath,
} from './hrmsWorkspace';

describe('HRMS workspace launcher helpers', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_HRMS_APP_URL', '');
  });

  it('detects main-app HRMS paths', () => {
    expect(isHrmsWorkspacePath('/hrms')).toBe(true);
    expect(isHrmsWorkspacePath('/hrms/leave')).toBe(true);
    expect(isHrmsWorkspacePath('/sales')).toBe(false);
  });

  it('normalizes the dedicated workspace root', () => {
    expect(getDedicatedHrmsWorkspacePath('/hrms')).toBe('/hrms/');
    expect(getDedicatedHrmsWorkspacePath('/hrms/')).toBe('/hrms/');
  });

  it('preserves direct dedicated workspace routes', () => {
    expect(getDedicatedHrmsWorkspacePath('/hrms/employees')).toBe('/hrms/employees');
    expect(getDedicatedHrmsWorkspacePath('/hrms/approvals')).toBe('/hrms/approvals');
  });

  it('maps legacy main-app HRMS routes to dedicated workspace routes', () => {
    expect(getDedicatedHrmsWorkspacePath('/hrms/admin')).toBe('/hrms/settings');
    expect(getDedicatedHrmsWorkspacePath('/hrms/leave-calendar', '?view=team', '#month')).toBe('/hrms/leave/calendar?view=team#month');
  });

  it('builds absolute HRMS subdomain links when configured', () => {
    expect(getDedicatedHrmsWorkspacePath('/hrms/admin', '', '', 'https://hrms.protonfookloi.com')).toBe('https://hrms.protonfookloi.com/settings');
    expect(getDedicatedHrmsWorkspacePath('/hrms/leave-calendar', '?view=team', '#month', 'https://hrms.protonfookloi.com')).toBe('https://hrms.protonfookloi.com/leave/calendar?view=team#month');
  });

  it('uses the configured HRMS app URL by default', () => {
    vi.stubEnv('VITE_HRMS_APP_URL', 'https://hrms.protonfookloi.com');
    expect(getDedicatedHrmsWorkspacePath('/hrms/admin')).toBe('https://hrms.protonfookloi.com/settings');
  });

  it('keeps configured path prefixes for mounted HRMS deployments', () => {
    expect(getDedicatedHrmsWorkspacePath('/hrms/admin', '', '', 'https://uat.protonfookloi.com/hrms/')).toBe('https://uat.protonfookloi.com/hrms/settings');
  });
});