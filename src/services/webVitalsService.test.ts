import { beforeEach, describe, expect, it, vi } from 'vitest';

const webVitalsMock = vi.hoisted(() => ({
  onCLS:  vi.fn(),
  onFCP:  vi.fn(),
  onINP:  vi.fn(),
  onLCP:  vi.fn(),
  onTTFB: vi.fn(),
}));

vi.mock('web-vitals', () => webVitalsMock);

const errorTrackingMock = vi.hoisted(() => ({
  errorTrackingService: {
    logMetric: vi.fn(),
  },
}));

vi.mock('./errorTrackingService', () => errorTrackingMock);

import { reportWebVitalToErrorTracking, subscribeWebVitals } from './webVitalsService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscribeWebVitals', () => {
  it('subscribes to all five Core Web Vitals (CLS, FCP, INP, LCP, TTFB)', () => {
    subscribeWebVitals();

    expect(webVitalsMock.onCLS).toHaveBeenCalledTimes(1);
    expect(webVitalsMock.onFCP).toHaveBeenCalledTimes(1);
    expect(webVitalsMock.onINP).toHaveBeenCalledTimes(1);
    expect(webVitalsMock.onLCP).toHaveBeenCalledTimes(1);
    expect(webVitalsMock.onTTFB).toHaveBeenCalledTimes(1);
  });

  it('passes the default reporter to each web-vitals subscription', () => {
    subscribeWebVitals();

    [webVitalsMock.onCLS, webVitalsMock.onFCP, webVitalsMock.onINP, webVitalsMock.onLCP, webVitalsMock.onTTFB]
      .forEach((sub) => {
        expect(sub).toHaveBeenCalledWith(reportWebVitalToErrorTracking);
      });
  });

  it('honours a custom reporter when supplied (test seam)', () => {
    const custom = vi.fn();

    subscribeWebVitals(custom);

    [webVitalsMock.onCLS, webVitalsMock.onFCP, webVitalsMock.onINP, webVitalsMock.onLCP, webVitalsMock.onTTFB]
      .forEach((sub) => {
        expect(sub).toHaveBeenCalledWith(custom);
      });
  });
});

describe('reportWebVitalToErrorTracking', () => {
  it('forwards each web-vitals report to errorTrackingService.logMetric', () => {
    reportWebVitalToErrorTracking({ name: 'LCP', value: 1234.5 });
    reportWebVitalToErrorTracking({ name: 'CLS', value: 0.04 });

    expect(errorTrackingMock.errorTrackingService.logMetric).toHaveBeenCalledTimes(2);
    expect(errorTrackingMock.errorTrackingService.logMetric).toHaveBeenNthCalledWith(1, 'LCP', 1234.5);
    expect(errorTrackingMock.errorTrackingService.logMetric).toHaveBeenNthCalledWith(2, 'CLS', 0.04);
  });
});
