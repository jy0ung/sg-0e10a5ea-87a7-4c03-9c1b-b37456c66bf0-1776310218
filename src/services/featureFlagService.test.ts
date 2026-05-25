import { describe, expect, it } from 'vitest';
import {
  isFlagOnForUser,
  resolveFlag,
  stableRolloutBucket,
  type FeatureFlagRow,
} from './featureFlagService';

function row(
  override: Partial<FeatureFlagRow> & Pick<FeatureFlagRow, 'code' | 'enabled'>,
): FeatureFlagRow {
  return {
    id: 'row-' + override.code,
    company_id: null,
    rollout_pct: 100,
    description: null,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...override,
  };
}

describe('resolveFlag', () => {
  it('returns default when no row exists', () => {
    const r = resolveFlag([], 'phase3b.gl-reports', 'comp-1', false);
    expect(r).toEqual({ code: 'phase3b.gl-reports', enabled: false, rolloutPct: 100, source: 'default' });
  });

  it('returns the global row when no company row exists', () => {
    const rows = [row({ code: 'phase3b.gl-reports', enabled: true })];
    const r = resolveFlag(rows, 'phase3b.gl-reports', 'comp-1', false);
    expect(r.enabled).toBe(true);
    expect(r.source).toBe('global');
  });

  it('prefers the company row over the global row', () => {
    const rows = [
      row({ code: 'phase3b.gl-reports', enabled: false }),
      row({ code: 'phase3b.gl-reports', enabled: true, company_id: 'comp-1' }),
    ];
    const r = resolveFlag(rows, 'phase3b.gl-reports', 'comp-1', false);
    expect(r.enabled).toBe(true);
    expect(r.source).toBe('company');
  });

  it('ignores a row belonging to a different company', () => {
    const rows = [row({ code: 'phase3b.gl-reports', enabled: true, company_id: 'comp-other' })];
    const r = resolveFlag(rows, 'phase3b.gl-reports', 'comp-1', true);
    expect(r.enabled).toBe(true);
    expect(r.source).toBe('default');
  });
});

describe('stableRolloutBucket', () => {
  it('is deterministic for the same input', () => {
    const a = stableRolloutBucket('user-1', 'phase3b.gl-reports');
    const b = stableRolloutBucket('user-1', 'phase3b.gl-reports');
    expect(a).toBe(b);
  });

  it('returns a value in [0, 100)', () => {
    for (let i = 0; i < 200; i++) {
      const b = stableRolloutBucket(`user-${i}`, 'phase3b.gl-reports');
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });
});

describe('isFlagOnForUser', () => {
  it('returns false when disabled regardless of rollout', () => {
    const r = isFlagOnForUser(
      { code: 'phase3b.gl-reports', enabled: false, rolloutPct: 100, source: 'global' },
      'user-1',
    );
    expect(r).toBe(false);
  });

  it('returns true when enabled at 100%', () => {
    const r = isFlagOnForUser(
      { code: 'phase3b.gl-reports', enabled: true, rolloutPct: 100, source: 'global' },
      'user-1',
    );
    expect(r).toBe(true);
  });

  it('returns false when enabled at 0%', () => {
    const r = isFlagOnForUser(
      { code: 'phase3b.gl-reports', enabled: true, rolloutPct: 0, source: 'global' },
      'user-1',
    );
    expect(r).toBe(false);
  });

  it('partitions users by stable bucket at 50% rollout', () => {
    const flag = { code: 'phase3b.gl-reports', enabled: true, rolloutPct: 50, source: 'global' as const };
    const decisions = new Array(500).fill(0).map((_, i) => isFlagOnForUser(flag, `user-${i}`));
    const onCount = decisions.filter(Boolean).length;
    // Expect roughly half. Allow wide tolerance for hash distribution.
    expect(onCount).toBeGreaterThan(150);
    expect(onCount).toBeLessThan(350);
  });

  it('returns false for anonymous users on partial rollouts', () => {
    const r = isFlagOnForUser(
      { code: 'phase3b.gl-reports', enabled: true, rolloutPct: 50, source: 'global' },
      null,
    );
    expect(r).toBe(false);
  });
});
