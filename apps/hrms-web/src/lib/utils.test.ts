import { describe, it, expect } from 'vitest';
import { formatAccounting } from './utils';

describe('formatAccounting', () => {
  it('formats positive numbers with thousand separators and two decimals', () => {
    expect(formatAccounting(1234)).toBe('1,234.00');
    expect(formatAccounting(1234.5)).toBe('1,234.50');
    expect(formatAccounting(1234567.89)).toBe('1,234,567.89');
  });

  it('wraps negatives in parentheses', () => {
    expect(formatAccounting(-1234.5)).toBe('(1,234.50)');
    expect(formatAccounting(-0.99)).toBe('(0.99)');
  });

  it('renders zero as 0.00', () => {
    expect(formatAccounting(0)).toBe('0.00');
  });

  it('accepts numeric strings with commas or plain', () => {
    expect(formatAccounting('1,234.5')).toBe('1,234.50');
    expect(formatAccounting('9876.543')).toBe('9,876.54');
  });

  it('returns empty string for null, undefined, empty, or non-numeric input', () => {
    expect(formatAccounting(null)).toBe('');
    expect(formatAccounting(undefined)).toBe('');
    expect(formatAccounting('')).toBe('');
    expect(formatAccounting('abc')).toBe('');
    expect(formatAccounting(Number.NaN)).toBe('');
  });
});
