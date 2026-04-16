import type { VehicleCanonical, KpiSummary } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';

export type ForecastConfidence = 'high' | 'medium' | 'low';

export interface MilestoneForecast {
  kpiId: string;
  label: string;
  /** The date the "from" milestone is known */
  fromDate: string;
  /** Predicted date for the "to" milestone */
  predictedDate: string;
  /** Median days used for prediction */
  medianDays: number;
  confidence: ForecastConfidence;
}

/**
 * Given a vehicle with some missing milestone dates and the current KPI summaries,
 * returns predicted dates for incomplete milestones using the median for each KPI.
 *
 * Confidence rules:
 *   high   – median computed from ≥ 30 vehicles
 *   medium – median computed from 10–29 vehicles
 *   low    – median computed from < 10 vehicles
 */
export function forecastVehicleMilestones(
  vehicle: VehicleCanonical,
  kpiSummaries: KpiSummary[],
): MilestoneForecast[] {
  const results: MilestoneForecast[] = [];

  for (const kpi of KPI_DEFINITIONS) {
    const fromValue = vehicle[kpi.fromField] as string | undefined | null;
    const toValue = vehicle[kpi.toField] as string | undefined | null;

    // Only forecast when "from" date is known but "to" date is missing
    if (!fromValue || toValue) continue;

    const summary = kpiSummaries.find(s => s.kpiId === kpi.id);
    if (!summary || summary.median <= 0) continue;

    const fromDate = new Date(fromValue);
    if (isNaN(fromDate.getTime())) continue;

    const predicted = new Date(fromDate);
    predicted.setDate(predicted.getDate() + summary.median);

    let confidence: ForecastConfidence = 'low';
    if (summary.validCount >= 30) confidence = 'high';
    else if (summary.validCount >= 10) confidence = 'medium';

    results.push({
      kpiId: kpi.id,
      label: kpi.label,
      fromDate: fromValue,
      predictedDate: predicted.toISOString().split('T')[0],
      medianDays: summary.median,
      confidence,
    });
  }

  return results;
}

/** Returns a simple overall risk level for a vehicle based on overdue KPIs and forecasts */
export function getVehicleRisk(
  vehicle: VehicleCanonical,
  kpiSummaries: KpiSummary[],
): 'on_track' | 'at_risk' | 'overdue' {
  let overdueCount = 0;
  let atRiskCount = 0;

  for (const kpi of KPI_DEFINITIONS) {
    const val = vehicle[kpi.computedField] as number | null | undefined;
    if (val === null || val === undefined) continue;

    const summary = kpiSummaries.find(s => s.kpiId === kpi.id);
    const sla = summary?.slaDays ?? kpi.slaDefault;

    if (val > sla) overdueCount++;
    else if (val > sla * 0.8) atRiskCount++;
  }

  if (overdueCount > 0) return 'overdue';
  if (atRiskCount > 0) return 'at_risk';
  return 'on_track';
}
