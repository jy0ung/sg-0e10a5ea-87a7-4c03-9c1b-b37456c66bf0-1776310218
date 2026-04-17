import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useErrorHandler } from './useErrorHandler';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/services/errorTrackingService', () => ({
  errorTrackingService: {
    captureException: vi.fn(),
  },
}));

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleError', () => {
    it('shows destructive toast with Error message', () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleError(new Error('Something failed'));
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Something failed',
      });
    });

    it('shows destructive toast with string error', () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleError('Network timeout');
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Network timeout',
      });
    });

    it('uses custom title when provided', () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleError(new Error('Oops'), 'Save Failed');
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Oops',
      });
    });

    it('handles non-string/non-Error types', () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleError(42);
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred',
      });
    });

    it('reports to error tracking service', async () => {
      const { errorTrackingService } = await import('@/services/errorTrackingService');
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleError(new Error('tracked'));
      });

      expect(errorTrackingService.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        { component: 'useErrorHandler' }
      );
    });
  });

  describe('handleSuccess', () => {
    it('shows success toast', () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleSuccess('Data saved');
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Data saved',
      });
    });

    it('uses custom title', () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleSuccess('Vehicle created', 'Import Complete');
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Import Complete',
        description: 'Vehicle created',
      });
    });
  });

  describe('handleAsync', () => {
    it('shows success toast after successful operation', async () => {
      const { result } = renderHook(() => useErrorHandler());

      await act(async () => {
        await result.current.handleAsync(
          async () => {},
          { successMessage: 'Done!' }
        );
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Done!',
      });
    });

    it('shows error toast and re-throws on failure', async () => {
      const { result } = renderHook(() => useErrorHandler());

      await expect(
        act(async () => {
          await result.current.handleAsync(
            async () => { throw new Error('Boom'); },
            { errorTitle: 'Operation Failed' }
          );
        })
      ).rejects.toThrow('Boom');

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Operation Failed',
        description: 'Boom',
      });
    });

    it('does not show success toast when no message provided', async () => {
      const { result } = renderHook(() => useErrorHandler());

      await act(async () => {
        await result.current.handleAsync(async () => {});
      });

      expect(mockToast).not.toHaveBeenCalled();
    });
  });
});
