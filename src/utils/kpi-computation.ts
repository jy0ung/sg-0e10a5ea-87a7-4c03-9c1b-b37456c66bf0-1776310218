import { VehicleCanonical, SlaPolicy, KpiSummary } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';

export function computeKpiSummaries(vehicles: VehicleCanonical[], slas: SlaPolicy[]): KpiSummary[] {
  return KPI_DEFINITIONS.map(kpi => {
    const sla = slas.find(s => s.kpiId === kpi.id);
    const slaDays = sla?.slaDays ?? kpi.slaDefault;
    const values: number[] = [];
    let invalidCount = 0;
    let missingCount = 0;

    vehicles.forEach(v => {
      if (v.is_incomplete) { missingCount++; return; }
      const val = v[kpi.computedField] as number | null | undefined;
      if (val === null || val === undefined) missingCount++;
      else if (val < 0) invalidCount++;
      else values.push(val);
    });

    values.sort((a, b) => a - b);
    const validCount = values.length;
    const median = validCount > 0 ? values[Math.floor(validCount / 2)] : 0;
    const average = validCount > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / validCount) : 0;
    const p90 = validCount > 0 ? values[Math.floor(validCount * 0.9)] : 0;
    const overdueCount = values.filter(v => v > slaDays).length;

    return { kpiId: kpi.id, label: kpi.label, shortLabel: kpi.shortLabel, validCount, invalidCount, missingCount, median, average, p90, overdueCount, slaDays };
  });
}