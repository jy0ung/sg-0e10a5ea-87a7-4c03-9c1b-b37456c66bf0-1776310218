/** Offline characterization only. Never imported by application/runtime code. */
import { createHash } from 'node:crypto';

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
export const hash = (value: unknown): string => createHash('sha256').update(stableJson(value)).digest('hex');
export const normalizeKey = (value: string | null | undefined): string | null => value?.trim().toUpperCase() || null;

export interface SourceOccurrence {
  company: string;
  chassis: string | null;
  engine: string | null;
  outlet: string;
  source: string;
  table: string;
  snapshot: string;
  row: number;
  canonicalMatch: string | null;
}
export interface IdentityException {
  kind: 'DUPLICATE_RAW_OCCURRENCE' | 'SAME_VEHICLE_OBSERVED_TWICE' | 'CONFLICTING_VEHICLE_IDENTITY' | 'INVALID_INCOMPLETE_SOURCE' | 'NO_CANONICAL_MATCH';
  key: string;
  outlets: string[];
  occurrenceKeys: string[];
  scope: 'within-outlet' | 'cross-outlet';
}
export const occurrenceKey = (row: SourceOccurrence): string => stableJson([row.company, row.source, row.table, row.snapshot, row.row]);
export const canonicalIdentityKey = (row: SourceOccurrence): string | null => {
  const chassis = normalizeKey(row.chassis);
  return chassis ? stableJson([row.company, chassis]) : null;
};

export function analyzeIdentity(input: readonly SourceOccurrence[]) {
  const normalized = input.map(row => ({ ...row, chassis: normalizeKey(row.chassis), engine: normalizeKey(row.engine) }))
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b), 'en'));
  const byOccurrence = new Map<string, SourceOccurrence[]>();
  const byVehicle = new Map<string, SourceOccurrence[]>();
  const exceptions: IdentityException[] = [];
  const issue = (kind: IdentityException['kind'], key: string, rows: SourceOccurrence[]) => {
    const outlets = [...new Set(rows.map(row => row.outlet))].sort();
    exceptions.push({ kind, key, outlets, occurrenceKeys: [...new Set(rows.map(occurrenceKey))].sort(), scope: outlets.length > 1 ? 'cross-outlet' : 'within-outlet' });
  };
  for (const row of normalized) {
    const key = occurrenceKey(row);
    byOccurrence.set(key, [...(byOccurrence.get(key) ?? []), row]);
  }
  const conflicted = new Set<string>();
  for (const [key, rows] of byOccurrence) {
    const variants = new Set(rows.map(stableJson));
    if (variants.size > 1) {
      issue('CONFLICTING_VEHICLE_IDENTITY', key, rows);
      rows.forEach(row => { const identity = canonicalIdentityKey(row); if (identity) conflicted.add(identity); });
    } else if (rows.length > 1) issue('DUPLICATE_RAW_OCCURRENCE', key, rows);
    // Every occurrence remains in normalized; identical transport replays count once for identity analysis.
    for (const row of new Map(rows.map(item => [stableJson(item), item])).values()) {
      const identity = canonicalIdentityKey(row);
      if (!identity || !row.company.trim() || !row.outlet.trim() || !row.source.trim() || !row.table.trim() || !row.snapshot.trim() || !Number.isSafeInteger(row.row) || row.row < 1) {
        issue('INVALID_INCOMPLETE_SOURCE', key, [row]);
        if (identity) conflicted.add(identity);
        continue;
      }
      byVehicle.set(identity, [...(byVehicle.get(identity) ?? []), row]);
    }
  }
  for (const [key, rows] of byVehicle) {
    const engines = new Set(rows.map(row => row.engine).filter(Boolean));
    const matches = new Set(rows.map(row => row.canonicalMatch).filter(Boolean));
    if (engines.size > 1 || matches.size > 1) {
      conflicted.add(key);
      issue('CONFLICTING_VEHICLE_IDENTITY', key, rows);
    } else if (rows.length > 1) issue('SAME_VEHICLE_OBSERVED_TWICE', key, rows);
    if (rows.some(row => !row.canonicalMatch)) issue('NO_CANONICAL_MATCH', key, rows.filter(row => !row.canonicalMatch));
  }
  // These are observed identity groups, not approved canonical vehicle writes.
  const identities = [...byVehicle].map(([key, rows]) => ({
    key, blocked: conflicted.has(key), canonicalMatch: conflicted.has(key) ? null : rows.find(row => row.canonicalMatch)?.canonicalMatch ?? null,
    occurrenceKeys: [...new Set(rows.map(occurrenceKey))].sort(), outlets: [...new Set(rows.map(row => row.outlet))].sort(),
  })).sort((a, b) => a.key.localeCompare(b.key, 'en'));
  // One canonical UUID claimed by multiple chassis is also a conflict, not a merge.
  const targets = new Map<string, typeof identities>();
  for (const identity of identities) if (identity.canonicalMatch) {
    const key = stableJson([JSON.parse(identity.key)[0], identity.canonicalMatch]);
    targets.set(key, [...(targets.get(key) ?? []), identity]);
  }
  for (const [key, groups] of targets) if (groups.length > 1) {
    groups.forEach(group => { group.blocked = true; group.canonicalMatch = null; });
    issue('CONFLICTING_VEHICLE_IDENTITY', key, groups.flatMap(group => byVehicle.get(group.key) ?? []));
  }
  exceptions.sort((a, b) => stableJson(a).localeCompare(stableJson(b), 'en'));
  return { normalized, identities, exceptions };
}

export interface OutletObservation {
  outlet: string;
  mappedOutlet: string;
  checkedAt: string;
  checkStatus: 'OK' | 'NO_CHANGE' | 'FAILED';
  observedHash: string;
  observedRows: number;
  publishedAt: string | null;
  publishedHash: string | null;
  publishedRows: number | null;
  explicitlyEmpty: boolean;
}
export interface CoveragePolicy { now: string; maxCheckAgeMs: number }
export function coverage(expected: readonly string[], input: readonly OutletObservation[], policy: CoveragePolicy) {
  const now = Date.parse(policy.now);
  if (!Number.isFinite(now) || !Number.isFinite(policy.maxCheckAgeMs) || policy.maxCheckAgeMs < 0 || new Set(expected).size !== expected.length) throw new Error('Invalid explicit coverage policy');
  const issues: { outlet: string; reason: string }[] = [];
  for (const outlet of [...expected].sort()) {
    const observations = input.filter(row => row.outlet === outlet);
    if (!observations.length) { issues.push({ outlet, reason: 'MISSING_OUTLET' }); continue; }
    if (observations.length !== 1) { issues.push({ outlet, reason: 'DUPLICATE_OBSERVATION' }); continue; }
    const row = observations[0];
    const check = Date.parse(row.checkedAt);
    const published = row.publishedAt === null ? NaN : Date.parse(row.publishedAt);
    const add = (reason: string) => issues.push({ outlet, reason });
    if (row.mappedOutlet !== outlet) add('OUTLET_MAPPING_MISMATCH');
    if (row.checkStatus !== 'OK' && row.checkStatus !== 'NO_CHANGE') add('UNSUCCESSFUL_CHECK');
    if (!Number.isFinite(check) || check > now) add('INVALID_CHECK_TIME');
    else if (now - check > policy.maxCheckAgeMs) add('STALE_CHECK');
    if (!Number.isSafeInteger(row.observedRows) || row.observedRows < 0) add('INVALID_ROW_COUNT');
    if (row.observedRows === 0 && !row.explicitlyEmpty) add('UNCONFIRMED_EMPTY_OUTLET');
    if (!row.observedHash || !row.publishedHash || !Number.isFinite(published) || published > check) add('UNVERIFIED_PUBLICATION');
    if (row.observedHash !== row.publishedHash) add('SOURCE_CHANGE_NOT_PUBLISHED');
    if (row.observedRows !== row.publishedRows) add('PARTIAL_PUBLICATION');
  }
  for (const row of input) if (!expected.includes(row.outlet)) issues.push({ outlet: row.outlet, reason: 'UNEXPECTED_OUTLET' });
  issues.sort((a, b) => stableJson(a).localeCompare(stableJson(b), 'en'));
  return { complete: issues.length === 0, issues, policy: { ...policy } };
}
export function replay(rows: readonly SourceOccurrence[], expected: readonly string[], observations: readonly OutletObservation[], policy: CoveragePolicy) {
  const identity = analyzeIdentity(rows);
  const result = { ...identity, coverage: coverage(expected, observations, policy) };
  return { ...result, hash: hash(result) };
}
export function compareIdentityStates(before: readonly SourceOccurrence[], after: readonly SourceOccurrence[]) {
  const a = new Set(analyzeIdentity(before).identities.map(row => row.key));
  const b = new Set(analyzeIdentity(after).identities.map(row => row.key));
  return { added: [...b].filter(key => !a.has(key)).sort(), removed: [...a].filter(key => !b.has(key)).sort(), retained: [...b].filter(key => a.has(key)).sort() };
}
