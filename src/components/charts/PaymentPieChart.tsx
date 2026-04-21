import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { VehicleCanonical } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  vehicles: VehicleCanonical[];
  /**
   * Drill-down handler. Receives the display label of the clicked slice
   * (upper-cased payment method, or `UNKNOWN_LABEL` for the unspecified
   * bucket). Parent decides what to do (typically navigate to the explorer
   * with `?payment=…`).
   */
  onSliceClick?: (methodLabel: string) => void;
}

export const UNKNOWN_LABEL = 'Unspecified';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(199, 89%, 48%)',
  'hsl(142, 71%, 45%)',
  'hsl(280, 65%, 60%)',
  'hsl(350, 65%, 55%)',
  'hsl(30, 90%, 55%)',
];
const UNKNOWN_COLOR = 'hsl(var(--muted-foreground))';

/**
 * Coerce raw payment method strings into a clean display label. Values that
 * differ only by casing or whitespace collapse into the same bucket so the
 * chart doesn't show "Floor Stock" and "FLOOR STOCK" as separate segments.
 */
function normalizePaymentMethod(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown' || trimmed === '-' || trimmed === '—') {
    return UNKNOWN_LABEL;
  }
  return trimmed.toUpperCase();
}

function formatShare(share: number): string {
  return share < 10 ? share.toFixed(1) : Math.round(share).toString();
}

export function PaymentPieChart({ vehicles, onSliceClick }: Props) {
  const { pieData, totalVehicles } = useMemo(() => {
    const counts = new Map<string, { count: number; totalDays: number; validDays: number }>();

    vehicles.forEach(v => {
      const key = normalizePaymentMethod(v.payment_method);
      const entry = counts.get(key) || { count: 0, totalDays: 0, validDays: 0 };
      entry.count++;
      if (v.bg_to_delivery != null && v.bg_to_delivery >= 0) {
        entry.totalDays += v.bg_to_delivery;
        entry.validDays++;
      }
      counts.set(key, entry);
    });

    const totalVehicles = Array.from(counts.values()).reduce((sum, entry) => sum + entry.count, 0);
    const pieData = Array.from(counts.entries())
      .map(([name, d]) => ({
        name,
        value: d.count,
        avg: d.validDays > 0 ? Math.round(d.totalDays / d.validDays) : null,
        share: totalVehicles > 0 ? (d.count / totalVehicles) * 100 : 0,
        isUnknown: name === UNKNOWN_LABEL,
      }))
      .sort((a, b) => {
        if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
        return b.value - a.value;
      });

    return { pieData, totalVehicles };
  }, [vehicles]);

  const colorFor = (index: number, isUnknown: boolean) =>
    isUnknown ? UNKNOWN_COLOR : COLORS[index % COLORS.length];

  if (totalVehicles === 0) {
    return (
      <Card className="glass-panel">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base font-semibold">Payment Method Distribution</CardTitle>
        </CardHeader>
        <CardContent className="pt-8 pb-10 text-center">
          <p className="text-sm text-muted-foreground">No vehicles match the current filters.</p>
        </CardContent>
      </Card>
    );
  }

  const handleSliceClick = (label: string) => {
    if (onSliceClick) onSliceClick(label);
  };

  const clickable = Boolean(onSliceClick);

  return (
    <Card className="glass-panel h-full flex flex-col">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Payment Method Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">
              {clickable ? 'Click a slice to drill into the matching vehicles.' : 'Mix of payment channels.'}
            </p>
          </div>
          <span className="rounded-md bg-secondary/60 px-2 py-1 text-xs tabular-nums whitespace-nowrap">
            <span className="text-muted-foreground">Total </span>
            <span className="font-semibold text-foreground">{totalVehicles.toLocaleString('en-US')}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-5 flex-1 flex flex-col">
        <div className="relative h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={105}
                paddingAngle={3}
                dataKey="value"
                stroke="hsl(var(--card))"
                strokeWidth={3}
                onClick={(entry) => {
                  const payload = (entry as { name?: string })?.name;
                  if (payload) handleSliceClick(payload);
                }}
              >
                {pieData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={colorFor(i, entry.isUnknown)}
                    cursor={clickable ? 'pointer' : undefined}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: 'hsl(var(--foreground))',
                  boxShadow: '0 18px 40px hsl(var(--foreground) / 0.08)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                formatter={(value: number, _name: string, item) => {
                  const payload = item.payload as { share: number; avg: number | null };
                  const avgSuffix = payload.avg != null ? ` • Avg ${payload.avg}d` : '';
                  return [`${value} vehicles (${formatShare(payload.share)}%)${avgSuffix}`, item.name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-semibold text-foreground">{totalVehicles.toLocaleString('en-US')}</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vehicles</p>
          </div>
        </div>

        {/* Minimal inline legend — enough to decode the slices without repeating
            the tooltip. Each chip doubles as a drill-down trigger. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px]">
          {pieData.map((m, i) => {
            const color = colorFor(i, m.isUnknown);
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => clickable && handleSliceClick(m.name)}
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 ${clickable ? 'hover:bg-secondary/60 cursor-pointer' : 'cursor-default'}`}
                aria-label={clickable ? `Filter vehicles by ${m.name}` : undefined}
                disabled={!clickable}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-foreground max-w-[140px] truncate" title={m.name}>{m.name}</span>
                <span className="text-muted-foreground tabular-nums">{formatShare(m.share)}%</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
