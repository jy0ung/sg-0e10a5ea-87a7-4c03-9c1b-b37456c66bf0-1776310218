import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { VehicleCanonical } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  vehicles: VehicleCanonical[];
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(199, 89%, 48%)',
  'hsl(142, 71%, 45%)',
  'hsl(280, 65%, 60%)',
  'hsl(350, 65%, 55%)',
  'hsl(30, 90%, 55%)',
];

export function PaymentPieChart({ vehicles }: Props) {
  const { pieData, totalVehicles, topMethod } = useMemo(() => {
    const counts = new Map<string, { count: number; totalDays: number }>();
    vehicles.forEach(v => {
      const entry = counts.get(v.payment_method) || { count: 0, totalDays: 0 };
      entry.count++;
      if (v.bg_to_delivery != null && v.bg_to_delivery >= 0) entry.totalDays += v.bg_to_delivery;
      counts.set(v.payment_method, entry);
    });

    const totalVehicles = Array.from(counts.values()).reduce((sum, entry) => sum + entry.count, 0);
    const pieData = Array.from(counts.entries())
      .map(([name, d]) => ({
        name,
        value: d.count,
        avg: d.count > 0 ? Math.round(d.totalDays / d.count) : 0,
        share: totalVehicles > 0 ? Math.round((d.count / totalVehicles) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return { pieData, totalVehicles, topMethod: pieData[0]?.name ?? '—' };
  }, [vehicles]);

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Payment Method Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mix of payment channels with average BG→Delivery performance by segment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-lg border border-border/70 bg-secondary/45 px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Vehicles</p>
              <p className="text-sm font-semibold text-foreground">{totalVehicles}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-secondary/45 px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Largest segment</p>
              <p className="text-sm font-semibold text-foreground">{topMethod}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)] lg:items-center">
          <div className="relative h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={98}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="hsl(var(--card))"
                  strokeWidth={3}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
                    const payload = item.payload as { share: number };
                    return [`${value} vehicles (${payload.share}%)`, item.name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-semibold text-foreground">{totalVehicles}</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vehicles</p>
            </div>
          </div>
          <div className="space-y-3">
            {pieData.map((method, i) => (
              <div key={method.name} className="rounded-xl border border-border/70 bg-secondary/40 px-3 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="truncate text-xs font-medium text-foreground">{method.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{method.share}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{method.value} vehicles</span>
                  <span>Avg {method.avg}d</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-accent">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.max(method.share, 6)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
