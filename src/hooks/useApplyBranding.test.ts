import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { BRANDING_DEFAULTS, type ResolvedBranding } from '@/services/brandingService';
import { useApplyBranding } from './useApplyBranding';

const mockBranding = vi.fn();
const mockFeatureFlag = vi.fn();

vi.mock('@/contexts/BrandingContext', () => ({
  useBranding: () => mockBranding(),
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => mockFeatureFlag(),
}));

function makeBranding(overrides: Partial<ResolvedBranding> = {}): ResolvedBranding {
  return { ...BRANDING_DEFAULTS, ...overrides };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.documentElement.style.removeProperty('--accent');
  document.title = 'baseline';
  mockBranding.mockReset();
  mockFeatureFlag.mockReset();
});

afterEach(() => {
  document.documentElement.style.removeProperty('--accent');
});

describe('useApplyBranding', () => {
  it('does nothing when the feature flag is off', () => {
    mockFeatureFlag.mockReturnValue(false);
    mockBranding.mockReturnValue({
      branding: makeBranding({ appName: 'BrandedApp', accentColor: '#6366f1', faviconUrl: '/fav.ico' }),
      loading: false,
      refresh: vi.fn(),
    });

    renderHook(() => useApplyBranding());

    expect(document.title).toBe('baseline');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
    expect(document.querySelector("link[rel='icon']")).toBeNull();
  });

  it('sets document.title from branding.appName when the flag is on', () => {
    mockFeatureFlag.mockReturnValue(true);
    mockBranding.mockReturnValue({
      branding: makeBranding({ appName: 'Acme BI' }),
      loading: false,
      refresh: vi.fn(),
    });

    renderHook(() => useApplyBranding());

    expect(document.title).toBe('Acme BI');
  });

  it('writes --accent as HSL channels from the hex accent color', () => {
    mockFeatureFlag.mockReturnValue(true);
    mockBranding.mockReturnValue({
      branding: makeBranding({ accentColor: '#6366f1' }),
      loading: false,
      refresh: vi.fn(),
    });

    renderHook(() => useApplyBranding());

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('239 84% 67%');
  });

  it('removes --accent when the accent color is missing or invalid', () => {
    mockFeatureFlag.mockReturnValue(true);
    document.documentElement.style.setProperty('--accent', '999 99% 99%');
    mockBranding.mockReturnValue({
      branding: makeBranding({ accentColor: 'not-a-color' }),
      loading: false,
      refresh: vi.fn(),
    });

    renderHook(() => useApplyBranding());

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('creates a favicon <link> when none exists', () => {
    mockFeatureFlag.mockReturnValue(true);
    mockBranding.mockReturnValue({
      branding: makeBranding({ faviconUrl: 'https://example.com/fav.ico' }),
      loading: false,
      refresh: vi.fn(),
    });

    renderHook(() => useApplyBranding());

    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    expect(link).not.toBeNull();
    expect(link!.href).toBe('https://example.com/fav.ico');
  });
});
