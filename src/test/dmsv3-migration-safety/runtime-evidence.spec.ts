import { describe, expect, it } from 'vitest';
import unknownRuntime from './fixtures/runtime-unknown.json';
import legacy from '../../../artifacts/dmsv3-migration-safety-pr-2026-10-04/LEGACY_STOCK_EVIDENCE.json';
import { legacyEvidenceSchema, requireEvidenceUse, runtimeEvidenceSchema } from './runtime-evidence';

const stamp = { capturedAt: '2026-10-04T18:38:14+08:00', evidenceRef: 'synthetic/census.json' };
const verified = <T,>(value: T) => ({ ...stamp, status: 'VERIFIED', value });
const unknown = { status: 'UNKNOWN', reason: 'Not observed' };
const trigger = { handler: 'syntheticRefresh', eventSource: 'CLOCK', cadence: verified('every 15 minutes'), creator: unknown, lastExecution: verified({ at: stamp.capturedAt, result: 'OK' }) };

describe('read-only runtime evidence certification', () => {
  it('represents the uncertified legacy executor without asserting an empty trigger inventory', () => {
    const result = runtimeEvidenceSchema.parse(unknownRuntime);
    expect(result.triggerInventory.status).toBe('UNKNOWN');
    expect(result.effectiveProperties.status).toBe('ACCESS DENIED');
  });
  it('accepts a verified project/deployment/code/property/trigger evidence chain', () => {
    const sample = { ...unknownRuntime, projectId: verified('SYNTHETIC-PROJECT'), deploymentId: verified('SYNTHETIC-DEPLOYMENT'), deploymentVersion: verified(12), boundContainer: verified('SYNTHETIC-CONTAINER'), codeFingerprint: verified('a'.repeat(64)), effectiveProperties: verified([{ name: 'OUTLET_MAPPING', fingerprint: 'b'.repeat(64) }]), triggerInventory: verified([trigger]) };
    expect(runtimeEvidenceSchema.safeParse(sample).success).toBe(true);
  });
  it('represents source-only handlers separately from installed runtime evidence', () => {
    const sample = { ...unknownRuntime, triggerInventory: { ...stamp, status: 'CODE ONLY', value: [trigger] } };
    expect(runtimeEvidenceSchema.parse(sample).triggerInventory.status).toBe('CODE ONLY');
  });
  it('accepts certified trigger absence only with a complete, attributed census', () => {
    const sample = { ...unknownRuntime, triggerInventory: { ...stamp, status: 'NOT INSTALLED', censusComplete: true } };
    expect(runtimeEvidenceSchema.safeParse(sample).success).toBe(true);
    expect(runtimeEvidenceSchema.safeParse({ ...sample, triggerInventory: { status: 'NOT INSTALLED' } }).success).toBe(false);
    expect(runtimeEvidenceSchema.safeParse({ ...sample, triggerInventory: { ...stamp, status: 'NOT INSTALLED', censusComplete: false } }).success).toBe(false);
  });
  it.each(['UNKNOWN', 'ACCESS DENIED'])('does not accept a value disguised as %s evidence', status => {
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, deploymentId: { status, reason: 'No access', value: 'ASSUMED' } }).success).toBe(false);
  });
  it('rejects an empty VERIFIED trigger list and an assumed cadence', () => {
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, triggerInventory: verified([]) }).success).toBe(false);
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, triggerInventory: verified([{ ...trigger, cadence: 'guessed' }]) }).success).toBe(false);
  });
  it('rejects verified evidence without provenance and malformed code fingerprints', () => {
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, deploymentVersion: { status: 'VERIFIED', value: 1 } }).success).toBe(false);
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, codeFingerprint: verified('not-a-hash') }).success).toBe(false);
  });
  it('rejects secret property values instead of storing them beside fingerprints', () => {
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, effectiveProperties: verified([{ name: 'SECRET_ALIAS', fingerprint: 'b'.repeat(64), value: 'FORBIDDEN-CREDENTIAL' }]) }).success).toBe(false);
    expect(runtimeEvidenceSchema.safeParse({ ...unknownRuntime, credentials: 'FORBIDDEN' }).success).toBe(false);
  });
});

describe('forensic stock evidence boundary', () => {
  it('validates populations, stale dates, anomalies and Strategy 4 without claiming current stock', () => {
    expect(legacyEvidenceSchema.parse(legacy).authoritativeCurrentStock).toBe(false);
    expect(requireEvidenceUse(legacy, 'offline-characterization').populations.distinctChassis).toBe(1337);
  });
  it('rejects using the manifest as live stock', () => {
    expect(() => requireEvidenceUse(legacy, 'live-stock')).toThrow('Forensic evidence');
    expect(legacyEvidenceSchema.safeParse({ ...legacy, authoritativeCurrentStock: true }).success).toBe(false);
    expect(legacyEvidenceSchema.safeParse({ ...legacy, allowedUse: 'LIVE_STOCK' }).success).toBe(false);
  });
  it('rejects turning unresolved executor or replay safety into certified assertions', () => {
    expect(legacyEvidenceSchema.safeParse({ ...legacy, liveExecutor: 'VERIFIED' }).success).toBe(false);
    expect(legacyEvidenceSchema.safeParse({ ...legacy, legacyFullReplaySafe: true }).success).toBe(false);
  });
});
