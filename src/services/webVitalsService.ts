import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { errorTrackingService } from './errorTrackingService';

/**
 * Web Vitals registrar. Encapsulates the imperative subscription wiring so
 * the entry point (main.tsx) only has to call subscribeWebVitals() and so
 * the set of subscribed metrics is unit-testable.
 *
 * Reports the five standardised metrics surfaced by web-vitals v5:
 *   • CLS  — Cumulative Layout Shift
 *   • FCP  — First Contentful Paint
 *   • INP  — Interaction to Next Paint (replaced FID as Core Web Vital)
 *   • LCP  — Largest Contentful Paint
 *   • TTFB — Time to First Byte
 *
 * Each report is forwarded to errorTrackingService.logMetric(), which calls
 * Sentry.setMeasurement() when a DSN is configured and otherwise just logs
 * locally — keeping the path safe in dev / preview environments without DSNs.
 */

export type WebVitalReporter = (metric: Pick<Metric, 'name' | 'value'>) => void;

/**
 * The default reporter — routes the metric to errorTrackingService. Exposed
 * separately so tests can swap it out without touching the subscription set.
 */
export const reportWebVitalToErrorTracking: WebVitalReporter = ({ name, value }) => {
  errorTrackingService.logMetric(name, value);
};

/**
 * Subscribe to all five Core Web Vitals. The optional reporter override is
 * used by tests; production callers pass nothing.
 */
export function subscribeWebVitals(reporter: WebVitalReporter = reportWebVitalToErrorTracking): void {
  onCLS(reporter);
  onFCP(reporter);
  onINP(reporter);
  onLCP(reporter);
  onTTFB(reporter);
}
