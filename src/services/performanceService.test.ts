import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const errorTrackingMock = vi.hoisted(() => ({
  errorTrackingService: {
    logMetric: vi.fn(),
  },
}));

vi.mock('./errorTrackingService', () => errorTrackingMock);

const loggingMock = vi.hoisted(() => ({
  loggingService: {
    logPerformance: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./loggingService', () => loggingMock);

import { performanceService } from './performanceService';

beforeEach(() => {
  vi.clearAllMocks();
  performanceService.clearMetrics();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('performanceService → errorTrackingService pipeline (Phase 5b)', () => {
  it('routes a query duration through errorTrackingService.logMetric', () => {
    const t0 = performance.now();
    vi.spyOn(performance, 'now').mockReturnValueOnce(t0).mockReturnValueOnce(t0 + 250);

    performanceService.startQueryTimer('q1');
    const duration = performanceService.endQueryTimer('q1', 'list_customers');

    expect(duration).toBeCloseTo(250, 1);
    expect(errorTrackingMock.errorTrackingService.logMetric).toHaveBeenCalledWith(
      'query.list_customers',
      expect.any(Number),
    );
    const reported = errorTrackingMock.errorTrackingService.logMetric.mock.calls[0][1];
    expect(reported).toBeCloseTo(250, 1);
  });

  it('emits a slow-query warning once the duration crosses 1000ms', () => {
    const t0 = performance.now();
    vi.spyOn(performance, 'now').mockReturnValueOnce(t0).mockReturnValueOnce(t0 + 1500);

    performanceService.startQueryTimer('q-slow');
    performanceService.endQueryTimer('q-slow', 'aging_report');

    expect(loggingMock.loggingService.warn).toHaveBeenCalledWith(
      'Slow query detected: aging_report',
      expect.objectContaining({ duration: expect.any(String) }),
      'Performance',
    );
  });

  it('forwards component render metrics with the render.<name> prefix', () => {
    performanceService.logComponentRender('VehicleExplorer', 42);

    expect(errorTrackingMock.errorTrackingService.logMetric).toHaveBeenCalledWith(
      'render.VehicleExplorer',
      42,
    );
  });

  it('silently no-ops endQueryTimer if startQueryTimer was never called', () => {
    const result = performanceService.endQueryTimer('never-started', 'phantom');

    expect(result).toBeUndefined();
    expect(errorTrackingMock.errorTrackingService.logMetric).not.toHaveBeenCalled();
  });
});
