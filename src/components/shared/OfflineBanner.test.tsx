import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

const mockFlag = vi.fn();

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => mockFlag(),
}));

beforeEach(() => {
  mockFlag.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfflineBanner', () => {
  it('renders nothing when the feature flag is off', () => {
    mockFlag.mockReturnValue(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('renders nothing when the browser reports online', () => {
    mockFlag.mockReturnValue(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('shows the banner when offline and the flag is on', () => {
    mockFlag.mockReturnValue(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    render(<OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toBeVisible();
    expect(screen.getByText(/you're offline/i)).toBeVisible();
  });

  it('reacts to runtime offline/online events', () => {
    mockFlag.mockReturnValue(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByTestId('offline-banner')).toBeVisible();

    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});
