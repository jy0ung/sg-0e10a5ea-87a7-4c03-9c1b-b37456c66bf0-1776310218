import { describe, expect, it } from 'vitest';
import { hexToHslChannels } from './colorToHsl';

describe('hexToHslChannels', () => {
  it('converts #6366f1 to the expected HSL channels', () => {
    expect(hexToHslChannels('#6366f1')).toBe('239 84% 67%');
  });

  it('accepts hex without leading hash', () => {
    expect(hexToHslChannels('6366f1')).toBe('239 84% 67%');
  });

  it('expands 3-digit shorthand', () => {
    // #f00 → #ff0000 (pure red)
    expect(hexToHslChannels('#f00')).toBe('0 100% 50%');
  });

  it('returns 0% saturation for greyscale', () => {
    expect(hexToHslChannels('#808080')).toBe('0 0% 50%');
  });

  it('returns null for invalid input', () => {
    expect(hexToHslChannels('not-a-color')).toBeNull();
    expect(hexToHslChannels('#ggg')).toBeNull();
    expect(hexToHslChannels('#1234')).toBeNull();
    expect(hexToHslChannels('')).toBeNull();
  });

  it('handles non-string input defensively', () => {
    // @ts-expect-error – validating runtime safety
    expect(hexToHslChannels(null)).toBeNull();
    // @ts-expect-error – validating runtime safety
    expect(hexToHslChannels(undefined)).toBeNull();
  });
});
