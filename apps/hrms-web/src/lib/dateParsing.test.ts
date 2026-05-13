import { describe, expect, it } from 'vitest';
import { normalizeSupportedDateValue, parseSupportedDateString } from './dateParsing';

describe('dateParsing', () => {
  it('parses supported ISO, dotted, and slash date strings', () => {
    expect(parseSupportedDateString('2026-04-27')?.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(parseSupportedDateString('27.04.26')?.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(parseSupportedDateString('27/04/1999')?.toISOString()).toBe('1999-04-27T00:00:00.000Z');
  });

  it('rejects empty, invalid, and impossible calendar dates', () => {
    expect(parseSupportedDateString('')).toBeNull();
    expect(parseSupportedDateString('2026-13-01')).toBeNull();
    expect(parseSupportedDateString('2026-02-30')).toBeNull();
    expect(parseSupportedDateString('not-a-date')).toBeNull();
  });

  it('normalizes dates and supported date strings to yyyy-mm-dd', () => {
    expect(normalizeSupportedDateValue(new Date(Date.UTC(2026, 3, 27)))).toBe('2026-04-27');
    expect(normalizeSupportedDateValue(' April 27, 2026 ')).toBe('2026-04-27');
  });

  it('returns undefined for nullish, invalid, and non-string values', () => {
    expect(normalizeSupportedDateValue(null)).toBeUndefined();
    expect(normalizeSupportedDateValue(undefined)).toBeUndefined();
    expect(normalizeSupportedDateValue('')).toBeUndefined();
    expect(normalizeSupportedDateValue(new Date(Number.NaN))).toBeUndefined();
    expect(normalizeSupportedDateValue(20260427)).toBeUndefined();
  });
});
