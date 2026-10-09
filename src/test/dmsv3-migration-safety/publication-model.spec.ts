import { describe, expect, it } from 'vitest';
import incidents from './fixtures/incidents.json';
import { PublicationModel } from './publication-model';

const bookingRows = Array.from({ length: incidents.booking.retainedKeys }, (_, i) => `BOOKING-FIXTURE-${i + 1}`);
function staged(rows = ['VEHICLE-A', 'VEHICLE-B']) {
  const model = new PublicationModel(bookingRows);
  const lease = model.acquire('OWNER-A', 1000, 1000);
  model.begin('CANDIDATE-A', lease, 1001);
  model.stage('CANDIDATE-A', lease, rows, 1002);
  return { model, lease };
}

describe('future publication boundary: characterization, not a database implementation', () => {
  it('keeps 1,880 last-good Booking keys while candidate rows are private', () => {
    const { model } = staged();
    expect(model.getPublished().rows).toHaveLength(1880);
    expect(model.getPublished().version).toBe(1);
    expect(model.inspect('CANDIDATE-A').rows).toEqual(['VEHICLE-A', 'VEHICLE-B']);
  });
  it('rejects publication before validation', () => {
    const { model, lease } = staged();
    expect(() => model.publish('CANDIDATE-A', lease, 1003)).toThrow('Unvalidated');
    expect(model.getPublished().rows).toHaveLength(1880);
  });
  it('changes the visible version and complete rows together only after validation', () => {
    const { model, lease } = staged();
    model.validate('CANDIDATE-A', lease, true, 1003);
    expect(model.getPublished().rows).toHaveLength(1880);
    model.publish('CANDIDATE-A', lease, 1004);
    expect(model.getPublished()).toEqual({ version: 2, rows: ['VEHICLE-A', 'VEHICLE-B'] });
    expect(() => model.stage('CANDIDATE-A', lease, ['OVERWRITE'], 1005)).toThrow();
  });
  it.each([false, true])('retains last-good state when business validation=%s or duplicate rows fail', valid => {
    const { model, lease } = staged(valid ? ['DUPLICATE', 'DUPLICATE'] : ['ONE']);
    const old = model.getPublished();
    model.validate('CANDIDATE-A', lease, valid, 1003);
    expect(model.inspect('CANDIDATE-A').status).toBe('FAILED');
    expect(() => model.publish('CANDIDATE-A', lease, 1004)).toThrow();
    expect(model.getPublished()).toEqual(old);
  });
  it('seals validated candidate rows', () => {
    const { model, lease } = staged(); model.validate('CANDIDATE-A', lease, true, 1003);
    expect(() => model.stage('CANDIDATE-A', lease, ['CHANGED'], 1004)).toThrow('sealed');
  });
  it('injects timeout after successful computation/staging and before commit, then retries without duplicates', () => {
    const { model, lease } = staged();
    const old = model.getPublished();
    model.validate('CANDIDATE-A', lease, true, 1003);
    expect(() => model.publish('CANDIDATE-A', lease, 1004, () => { throw new Error('PRE_COMMIT_TIMEOUT'); })).toThrow('PRE_COMMIT_TIMEOUT');
    expect(model.getPublished()).toEqual(old);
    expect(model.inspect('CANDIDATE-A')).toMatchObject({ status: 'FAILED', rows: ['VEHICLE-A', 'VEHICLE-B'] });
    expect(model.history().some(event => event.event === 'FAILED_BEFORE_COMMIT')).toBe(true);
    model.begin('RETRY', lease, 1005); model.stage('RETRY', lease, ['VEHICLE-A', 'VEHICLE-B'], 1006);
    model.validate('RETRY', lease, true, 1007); model.publish('RETRY', lease, 1008);
    expect(model.getPublished()).toEqual({ version: 2, rows: ['VEHICLE-A', 'VEHICLE-B'] });
    expect(new Set(model.getPublished().rows).size).toBe(model.getPublished().rows.length);
    expect(() => model.publish('CANDIDATE-A', lease, 1009)).toThrow();
  });
  it('rejects a candidate based on an obsolete published version', () => {
    const { model, lease } = staged();
    model.begin('CANDIDATE-B', lease, 1003); model.stage('CANDIDATE-B', lease, ['NEWER'], 1004);
    model.validate('CANDIDATE-A', lease, true, 1005); model.validate('CANDIDATE-B', lease, true, 1006);
    model.publish('CANDIDATE-B', lease, 1007);
    expect(() => model.publish('CANDIDATE-A', lease, 1008)).toThrow('obsolete');
    expect(model.getPublished().rows).toEqual(['NEWER']);
  });
  it('rechecks the visible version at the commit boundary', () => {
    const { model, lease } = staged();
    model.begin('CANDIDATE-B', lease, 1003); model.stage('CANDIDATE-B', lease, ['NEWER'], 1004);
    model.validate('CANDIDATE-A', lease, true, 1005); model.validate('CANDIDATE-B', lease, true, 1006);
    expect(() => model.publish('CANDIDATE-A', lease, 1007, () => model.publish('CANDIDATE-B', lease, 1007))).toThrow('obsolete');
    expect(model.getPublished()).toEqual({ version: 2, rows: ['NEWER'] });
  });
});

describe('lease fencing and attempt history', () => {
  it('rejects the historical recovery 120.115 seconds before recorded expiry', () => {
    const start = Date.parse(incidents.lease.heartbeatAt);
    const expiry = Date.parse(incidents.lease.expiresAt);
    const recovery = Date.parse(incidents.lease.recoveredAt);
    expect(expiry - recovery).toBe(120115);
    const model = new PublicationModel(['LAST-GOOD']);
    const lease = model.acquire('OWNER', start, expiry - start);
    model.begin('HISTORICAL-ATTEMPT', lease, start);
    model.stage('HISTORICAL-ATTEMPT', lease, ['PRIVATE'], start + 1);
    expect(() => model.abandonExpired('HISTORICAL-ATTEMPT', recovery)).toThrow('before lease expiry');
    model.abandonExpired('HISTORICAL-ATTEMPT', expiry);
    expect(model.inspect('HISTORICAL-ATTEMPT').status).toBe('ABANDONED');
    expect(model.getPublished().rows).toEqual(['LAST-GOOD']);
  });
  it('permits acquisition at expiry and rejects stale owner/token, including the same owner name', () => {
    const { model, lease } = staged();
    expect(() => model.acquire('OTHER', 1999, 1000)).toThrow('still owned');
    const next = model.acquire('OWNER-A', 2000, 1000);
    expect(next.token).toBeGreaterThan(lease.token);
    expect(() => model.stage('CANDIDATE-A', lease, ['BAD'], 2001)).toThrow('stale');
    expect(() => model.stage('CANDIDATE-A', next, ['BAD'], 2001)).toThrow('different owner');
  });
  it('requires matching owner identity independently of fencing token', () => {
    const { model, lease } = staged();
    expect(() => model.validate('CANDIDATE-A', { ...lease, owner: 'FORGED' }, true, 1003)).toThrow('stale');
  });
  it('renewal extends effective expiry and prevents recovery using the old expiry', () => {
    const { model, lease } = staged();
    const renewed = model.renew(lease, 1900, 1000);
    expect(renewed.expiresAt).toBe(2900);
    expect(() => model.abandonExpired('CANDIDATE-A', 2001)).toThrow('before lease expiry');
    model.validate('CANDIDATE-A', renewed, true, 2800);
    model.publish('CANDIDATE-A', renewed, 2801);
  });
  it('cannot renew an expired lease or publish at its expiry', () => {
    const { model, lease } = staged(); model.validate('CANDIDATE-A', lease, true, 1003);
    expect(() => model.renew(lease, 2000, 1000)).toThrow();
    expect(() => model.publish('CANDIDATE-A', lease, 2000)).toThrow();
  });
  it('retains attempt/history evidence after abandonment without claiming successful publication', () => {
    const { model, lease } = staged();
    model.validate('CANDIDATE-A', lease, true, 1003);
    const before = model.history(); model.abandonExpired('CANDIDATE-A', 2000);
    expect(model.history().slice(0, before.length)).toEqual(before);
    expect(model.history().some(event => event.event === 'STAGED')).toBe(true);
    expect(model.history().some(event => event.event === 'PUBLISHED')).toBe(false);
    const next = model.acquire('RECOVERY', 2001, 1000);
    expect(() => model.publish('CANDIDATE-A', next, 2002)).toThrow();
    expect(() => model.begin('CANDIDATE-A', next, 2003)).toThrow('already exists');
    expect(model.getPublished().rows).toHaveLength(1880);
  });
  it('protects inspection/history/publication against caller mutation', () => {
    const { model } = staged();
    model.history()[0].event = 'PUBLISHED'; model.inspect('CANDIDATE-A').rows.push('MUTATED');
    model.getPublished().rows.length = 0;
    expect(model.history()[0].event).toBe('STARTED');
    expect(model.inspect('CANDIDATE-A').rows).toHaveLength(2);
    expect(model.getPublished().rows).toHaveLength(1880);
  });
  it.each([NaN, Infinity])('rejects an invalid injected clock %s', now => {
    expect(() => new PublicationModel([]).acquire('OWNER', now, 1000)).toThrow('clock');
  });
});
