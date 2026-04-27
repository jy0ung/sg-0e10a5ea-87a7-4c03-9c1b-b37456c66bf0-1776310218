import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  init: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('@sentry/react', () => sentryMock);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import { ErrorTrackingService } from './errorTrackingService';
import { loggingService } from './loggingService';

describe('errorTrackingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggingService.clearLogs();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs in local-only mode when no DSN is configured', () => {
    const service = new ErrorTrackingService();

    service.init();
    service.captureMessage('local warning', 'warning', { component: 'Smoke' });

    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
    expect(loggingService.getLogs().at(-1)).toMatchObject({
      component: 'Smoke',
      level: 'warn',
      message: 'local warning',
    });
  });

  it('initializes Sentry with production metadata', () => {
    const service = new ErrorTrackingService();

    service.init({
      dsn: 'https://public@example.ingest.sentry.io/1',
      environment: 'production',
      release: 'v1.2.3',
      tracesSampleRate: 0.25,
    });

    expect(sentryMock.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://public@example.ingest.sentry.io/1',
      environment: 'production',
      release: 'v1.2.3',
      tracesSampleRate: 0.25,
      replaysOnErrorSampleRate: 0,
      replaysSessionSampleRate: 0,
    }));
  });

  it('redacts exception data before sending it to Sentry', () => {
    const service = new ErrorTrackingService();
    service.init({ dsn: 'https://public@example.ingest.sentry.io/1' });
    service.setUser('user-1');
    service.addBreadcrumb('auth', 'Login failed for admin@example.com', 'warning');

    service.captureException(new Error('Failed for admin@example.com token=secret'), {
      component: 'LoginForm',
      action: 'submit',
      additionalData: {
        email: 'admin@example.com',
        token: 'plain-token',
        nested: { safe: 'kept' },
      },
    });

    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);

    const [capturedError, sentryContext] = sentryMock.captureException.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.message).toBe('Failed for [redacted] token=[redacted]');
    expect(sentryContext).toMatchObject({
      tags: {
        action: 'submit',
        component: 'LoginForm',
      },
      extra: {
        breadcrumbs: [expect.objectContaining({ message: 'Login failed for [redacted]' })],
        email: '[redacted]',
        nested: { safe: 'kept' },
        token: '[redacted]',
        userId: 'user-1',
      },
    });
  });

  it('redacts warning messages and context before Sentry capture', () => {
    const service = new ErrorTrackingService();
    service.init({ dsn: 'https://public@example.ingest.sentry.io/1' });

    service.captureMessage('Warn admin@example.com', 'warning', {
      component: 'SyntheticSmoke',
      additionalData: {
        password: 'secret',
        safe: 'kept',
      },
    });

    expect(sentryMock.captureMessage).toHaveBeenCalledWith('Warn [redacted]', expect.objectContaining({
      level: 'warning',
      extra: {
        password: '[redacted]',
        safe: 'kept',
      },
      tags: {
        action: 'unknown',
        component: 'SyntheticSmoke',
      },
    }));
    expect(loggingService.getLogs().at(-1)).toMatchObject({
      component: 'SyntheticSmoke',
      level: 'warn',
      message: 'Warn [redacted]',
    });
  });
});
