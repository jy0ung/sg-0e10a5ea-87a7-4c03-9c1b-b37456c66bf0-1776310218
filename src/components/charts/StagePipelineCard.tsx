import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { VehicleCanonical } from '@/types';
import {
  VEHICLE_STAGES,
  VEHICLE_STAGE_LABELS,
  deriveVehicleStage,
  type VehicleStage,
} from '@/utils/vehicleStage';

/**
 * Donut showing how many vehicles sit in each auto-aging pipeline stage. The
 * three slices map 1:1 to the category sections on the new Excel template.
 */
export interface StagePipelineCardProps {
  vehicles: VehicleCanonical[];
  onStageClick?: (stage: VehicleStage) => void;
}

const STAGE_COLOURS: Record<VehicleStage, string> = {
  pending_register_free_stock: 'hsl(var(--muted-foreground))',
  pending_deliver_loan_disburse: 'hsl(var(--warning))',
  complete: 'hsl(var(--success))',
};

export function StagePipelineCard({ vehicles, onStageClick }: StagePipelineCardProps) {
  const data = useMemo(() => {
    const counts: Record<VehicleStage, number> = {
      pending_register_free_stock: 0,
      pending_deliver_loan_disburse: 0,
      complete: 0,
    };
    for (const v of vehicles) {
      // Prefer persisted stage (DB trigger), derive locally if absent.
      const stage = (v.stage as VehicleStage | null | undefined) ?? deriveVehicleStage(v);
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
    return VEHICLE_STAGES.map(s => ({
      stage: s,
      name: VEHICLE_STAGE_LABELS[s],
      value: counts[s],
    }));
  }, [vehicles]);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="glass-panel p-5 h-full flex flex-col items-center justify-center gap-2 text-center">
        <h3 className="text-sm font-semibold text-foreground">Pipeline by Stage</h3>
        <p className="text-xs text-muted-foreground">No vehicles to display.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 h-full flex flex-col">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground">Pipeline by Stage</h3>
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} vehicle{total === 1 ? '' : 's'} across the three auto-aging stages.
        </p>
      </div>
      <div className="flex-1 min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              onClick={(entry) => {
                if (onStageClick && entry && (entry as { stage?: VehicleStage }).stage) {
                  onStageClick((entry as { stage: VehicleStage }).stage);
                }
              }}
            >
              {data.map(d => (
                <Cell key={d.stage} fill={STAGE_COLOURS[d.stage]} cursor={onStageClick ? 'pointer' : undefined} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => {
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return [`${value} (${pct}%)`, 'Vehicles'];
              }}
            />
            <Legend verticalAlign="bottom" height={24} iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
