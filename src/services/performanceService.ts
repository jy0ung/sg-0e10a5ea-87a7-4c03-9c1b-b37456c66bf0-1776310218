import { loggingService } from "./loggingService";

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
}

class PerformanceService {
  private metrics: PerformanceMetric[] = [];
  private queryTimers: Map<string, number> = new Map();

  startQueryTimer(queryId: string) {
    this.queryTimers.set(queryId, performance.now());
  }

  endQueryTimer(queryId: string, queryName: string) {
    const startTime = this.queryTimers.get(queryId);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    this.queryTimers.delete(queryId);

    this.metrics.push({
      name: `query_${queryName}`,
      value: duration,
      unit: "ms",
      timestamp: new Date().toISOString(),
    });

    loggingService.logPerformance(`Query: ${queryName}`, duration, "ms");
    
    if (duration > 1000) {
      loggingService.warn(`Slow query detected: ${queryName}`, { duration: duration.toFixed(2) }, "Performance");
    }

    return duration;
  }

  logComponentRender(componentName: string, duration: number) {
    this.metrics.push({
      name: `render_${componentName}`,
      value: duration,
      unit: "ms",
      timestamp: new Date().toISOString(),
    });

    loggingService.logPerformance(`Render: ${componentName}`, duration, "ms");
    
    if (duration > 100) {
      loggingService.warn(`Slow render detected: ${componentName}`, { duration: duration.toFixed(2) }, "Performance");
    }
  }

  logCustomMetric(name: string, value: number, unit: string = "ms") {
    this.metrics.push({
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
    });

    loggingService.logPerformance(name, value, unit);
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getAverageMetric(namePattern: string): number {
    const matching = this.metrics.filter(m => m.name.includes(namePattern));
    if (matching.length === 0) return 0;
    
    const sum = matching.reduce((acc, m) => acc + m.value, 0);
    return sum / matching.length;
  }

  clearMetrics() {
    this.metrics = [];
  }
}

export const performanceService = new PerformanceService();