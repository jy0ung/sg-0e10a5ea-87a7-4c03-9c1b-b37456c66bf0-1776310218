import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import full from './fixtures/legacy-identities.json';
import edges from './fixtures/identity-edge-cases.json';
import incidents from './fixtures/incidents.json';
import manifest from '../../../artifacts/dmsv3-migration-safety-pr-2026-10-04/FIXTURE_MANIFEST.json';
import { analyzeIdentity, canonicalIdentityKey, compareIdentityStates, coverage, hash, normalizeKey, occurrenceKey, replay, type OutletObservation, type SourceOccurrence } from './identity-coverage';

const sourceRows: SourceOccurrence[] = full.rows.map(tuple => {
  const [chassis, outlet, stage, row] = tuple;
  if (typeof chassis !== 'string' || typeof outlet !== 'string' || typeof stage !== 'number' || typeof row !== 'number') throw new Error('Invalid frozen source tuple');
  return { ...full.defaults, chassis, outlet, table: `outlet-${outlet}:S${stage}`, row };
});
const outlets = Object.keys(full.outletOccurrenceCounts).sort();
const policy = { now: incidents.validationAt, maxCheckAgeMs: 60 * 60 * 1000 };
// 60 minutes is injected solely to test the historical claim, not approved future production policy.
const observation = (outlet: string): OutletObservation => ({
  outlet, mappedOutlet: outlet, checkedAt: policy.now, checkStatus: 'OK', observedHash: 'snapshot-hash', observedRows: 10,
  publishedAt: '2026-08-20T00:00:00+08:00', publishedHash: 'snapshot-hash', publishedRows: 10, explicitlyEmpty: false,
});
const observations = () => outlets.map(observation);
const edge = (label: string): SourceOccurrence => ({ ...edges.cases.find(row => row.label === label)!.row });
const kinds = (rows: SourceOccurrence[]) => analyzeIdentity(rows).exceptions.map(row => row.kind);

describe('frozen identity population and source lineage', () => {
  it('verifies every frozen fixture byte hash', () => {
    for (const fixture of manifest.fixtures) {
      const bytes = readFileSync(resolve(process.cwd(), fixture.path));
      expect(createHash('sha256').update(bytes).digest('hex'), fixture.path).toBe(fixture.sha256);
    }
  });
  it('preserves all 1,341 occurrences and 1,337 distinct identities across seven outlets', () => {
    const result = analyzeIdentity(sourceRows);
    expect(result.normalized).toHaveLength(1341);
    expect(result.identities).toHaveLength(1337);
    expect(outlets).toHaveLength(7);
    expect(new Set(sourceRows.map(occurrenceKey)).size).toBe(1341);
    expect(Object.fromEntries(outlets.map(outlet => [outlet, sourceRows.filter(row => row.outlet === outlet).length]))).toEqual(manifest.fullPopulation.outletOccurrenceCounts);
    expect(result.identities.every(row => row.canonicalMatch === null)).toBe(true);
  });
  it.each(full.lduDuplicateIdentities)('retains both source rows for historical LDU duplicate %s', chassis => {
    const rows = sourceRows.filter(row => row.chassis === chassis);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.outlet === 'LDU')).toBe(true);
    expect(new Set(rows.map(occurrenceKey)).size).toBe(2);
    const result = analyzeIdentity(rows);
    expect(result.identities).toHaveLength(1);
    expect(result.exceptions).toContainEqual(expect.objectContaining({ kind: 'SAME_VEHICLE_OBSERVED_TWICE', scope: 'within-outlet' }));
    expect(result.exceptions.some(row => row.kind === 'DUPLICATE_RAW_OCCURRENCE')).toBe(false);
  });
  it('finds exactly four duplicate identity groups, without treating 1,341 rows as 1,341 vehicles', () => {
    expect(analyzeIdentity(sourceRows).exceptions.filter(row => row.kind === 'SAME_VEHICLE_OBSERVED_TWICE')).toHaveLength(4);
  });
  it('normalizes case/outer whitespace without erasing punctuation or internal whitespace', () => {
    expect(normalizeKey(' abc-123 ')).toBe('ABC-123');
    expect(normalizeKey('abc 123')).not.toBe(normalizeKey('abc123'));
    expect(normalizeKey('abc-123')).not.toBe(normalizeKey('abc123'));
  });
  it.each(['blank-chassis', 'missing-chassis'])('rejects %s as incomplete without assigning a vehicle', label => {
    const result = analyzeIdentity([edge(label)]);
    expect(result.identities).toHaveLength(0);
    expect(result.exceptions[0].kind).toBe('INVALID_INCOMPLETE_SOURCE');
  });
  it('separates repeated transport occurrence from two independent observations', () => {
    const row = edge('normalized-chassis');
    expect(kinds([row, { ...row }])).toContain('DUPLICATE_RAW_OCCURRENCE');
    expect(kinds([row, { ...row }])).not.toContain('SAME_VEHICLE_OBSERVED_TWICE');
    expect(kinds([row, edge('same-vehicle-distinct-row')])).toContain('SAME_VEHICLE_OBSERVED_TWICE');
    expect(occurrenceKey(row)).not.toBe(occurrenceKey(edge('same-vehicle-distinct-row')));
    expect(canonicalIdentityKey(row)).toBe(canonicalIdentityKey(edge('same-vehicle-distinct-row')));
  });
  it('preserves both outlet lineages for a vehicle observed across outlets', () => {
    const result = analyzeIdentity([edge('normalized-chassis'), edge('cross-outlet-same-vehicle')]);
    expect(result.identities[0].outlets).toEqual(['LDU', 'TWU']);
    expect(result.exceptions).toContainEqual(expect.objectContaining({ kind: 'SAME_VEHICLE_OBSERVED_TWICE', scope: 'cross-outlet' }));
  });
  it.each([
    ['conflicting-engine', 'conflicting-engine-second'],
    ['conflicting-canonical-target', 'conflicting-canonical-target-second'],
    ['normalized-chassis', 'same-lineage-conflicting-payload'],
  ])('blocks conflicting evidence %s / %s instead of merging', (a, b) => {
    const result = analyzeIdentity([edge(a), edge(b)]);
    expect(result.exceptions.some(row => row.kind === 'CONFLICTING_VEHICLE_IDENTITY')).toBe(true);
    expect(result.identities.every(row => row.blocked && row.canonicalMatch === null)).toBe(true);
  });
  it('blocks two chassis claiming the same canonical target', () => {
    const row = { ...edge('normalized-chassis'), canonicalMatch: 'CANONICAL-ONE' };
    const result = analyzeIdentity([row, { ...row, row: 100, chassis: 'ANOTHER-CHASSIS' }]);
    expect(result.identities.every(identity => identity.blocked)).toBe(true);
  });
  it('keeps companies distinct even when their source chassis strings match', () => {
    const row = edge('normalized-chassis');
    expect(analyzeIdentity([row, { ...row, company: 'OTHER-COMPANY' }]).identities).toHaveLength(2);
  });
  it('keeps unmatched source evidence without inventing a canonical vehicle', () => {
    const result = analyzeIdentity([edge('no-canonical-match')]);
    expect(result.identities[0].canonicalMatch).toBeNull();
    expect(result.exceptions[0].kind).toBe('NO_CANONICAL_MATCH');
  });
  it('reports identity differences independently of raw row repetition', () => {
    const row = edge('normalized-chassis');
    expect(compareIdentityStates([row], [row, { ...row, row: 99 }])).toEqual({ added: [], removed: [], retained: [canonicalIdentityKey(row)] });
    const diff = compareIdentityStates([row], [{ ...row, chassis: 'REPLACEMENT' }]);
    expect(diff.added).toHaveLength(1); expect(diff.removed).toHaveLength(1);
  });
});

describe('coverage based on explicit business evidence', () => {
  it('accepts seven recently checked outlets even with old unchanged publication dates', () => {
    expect(coverage(outlets, observations(), policy).complete).toBe(true);
  });
  it.each(outlets)('requires the expected outlet %s', outlet => {
    expect(coverage(outlets, observations().filter(row => row.outlet !== outlet), policy).issues).toContainEqual({ outlet, reason: 'MISSING_OUTLET' });
  });
  it.each([
    ['TWU', incidents.checks.TWU, 3577], ['LDU', incidents.checks.LDU, 3540],
  ] as const)('does not label historical %s check stale at %s (%i seconds)', (outlet, checkedAt, seconds) => {
    expect(Date.parse(policy.now) - Date.parse(checkedAt)).toBe(seconds * 1000);
    const rows = observations().map(row => row.outlet === outlet ? { ...row, checkedAt, checkStatus: 'NO_CHANGE' as const } : row);
    expect(incidents.legacyDeclaredStale).toContain(outlet);
    expect(coverage(outlets, rows, policy).complete).toBe(true);
    expect(coverage(outlets, rows, { ...policy, maxCheckAgeMs: 30 * 60 * 1000 }).issues).toContainEqual({ outlet, reason: 'STALE_CHECK' });
  });
  it.each([
    [{ checkedAt: '2026-08-22T23:00:00+08:00' }, 'STALE_CHECK'],
    [{ checkedAt: 'invalid' }, 'INVALID_CHECK_TIME'],
    [{ checkedAt: '2026-08-24T00:00:00+08:00' }, 'INVALID_CHECK_TIME'],
    [{ observedHash: 'changed-source' }, 'SOURCE_CHANGE_NOT_PUBLISHED'],
    [{ observedRows: 11 }, 'PARTIAL_PUBLICATION'],
    [{ mappedOutlet: 'LDU' }, 'OUTLET_MAPPING_MISMATCH'],
    [{ observedRows: 0, publishedRows: 0 }, 'UNCONFIRMED_EMPTY_OUTLET'],
    [{ publishedAt: null, publishedHash: null }, 'UNVERIFIED_PUBLICATION'],
    [{ observedRows: -1 }, 'INVALID_ROW_COUNT'],
  ])('rejects outlet evidence %j with %s', (changes, reason) => {
    const rows = observations().map(row => row.outlet === 'TWU' ? { ...row, ...changes } : row);
    expect(coverage(outlets, rows, policy).issues).toContainEqual({ outlet: 'TWU', reason });
  });
  it('accepts a declared empty outlet only when the empty snapshot was also published', () => {
    const rows = observations().map(row => row.outlet === 'TWU' ? { ...row, observedRows: 0, publishedRows: 0, explicitlyEmpty: true } : row);
    expect(coverage(outlets, rows, policy).complete).toBe(true);
  });
  it('does not make an old snapshot fresh merely because a failed check occurred recently', () => {
    const rows = observations().map(row => row.outlet === 'TWU' ? { ...row, checkStatus: 'FAILED' as const } : row);
    expect(coverage(outlets, rows, policy).issues).toContainEqual({ outlet: 'TWU', reason: 'UNSUCCESSFUL_CHECK' });
  });
  it('rejects duplicate observations and unexpected outlet mappings', () => {
    const result = coverage(outlets, [...observations(), observation('TWU'), observation('UNKNOWN')], policy);
    expect(result.issues).toContainEqual({ outlet: 'TWU', reason: 'DUPLICATE_OBSERVATION' });
    expect(result.issues).toContainEqual({ outlet: 'UNKNOWN', reason: 'UNEXPECTED_OUTLET' });
  });
  it('requires valid injected time and threshold rather than reading the wall clock', () => {
    expect(() => coverage(outlets, observations(), { now: 'bad', maxCheckAgeMs: 1 })).toThrow();
    expect(() => coverage(outlets, observations(), { ...policy, maxCheckAgeMs: NaN })).toThrow();
  });
});

describe('offline deterministic replay', () => {
  it('replays the full population twice and under reversal/permutation with identical outputs and hashes', () => {
    const first = replay(sourceRows, outlets, observations(), policy);
    const second = replay(sourceRows, outlets, observations(), policy);
    const reverse = replay([...sourceRows].reverse(), [...outlets].reverse(), observations().reverse(), policy);
    const rotated = replay([...sourceRows.slice(600), ...sourceRows.slice(0, 600)], outlets, observations(), policy);
    expect(second).toEqual(first); expect(reverse).toEqual(first); expect(rotated).toEqual(first);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set([first.hash, second.hash, reverse.hash, rotated.hash]).size).toBe(1);
  });
  it('includes negative-case exceptions and coverage changes in the replay hash', () => {
    const rows = edges.cases.map(row => row.row);
    const first = replay(rows, outlets, observations(), policy);
    expect(replay([...rows].reverse(), outlets, observations().reverse(), policy)).toEqual(first);
    expect(replay(rows, outlets, observations().slice(1), policy).hash).not.toBe(first.hash);
    expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 }));
  });
  it('does not share mutable output with the input or future runs', () => {
    const input = [edge('normalized-chassis')];
    const first = replay(input, outlets, observations(), policy);
    first.normalized[0].chassis = 'MUTATED';
    expect(input[0].chassis).toBe(' EDGE-VEHICLE ');
    expect(replay(input, outlets, observations(), policy).normalized[0].chassis).toBe('EDGE-VEHICLE');
  });
});
