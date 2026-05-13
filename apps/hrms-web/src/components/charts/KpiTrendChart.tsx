import React from 'react';
import { VehicleCanonical } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface KpiTrendChartProps {
  vehicles: VehicleCanonical[];
  selectedKpiId?: string;
}

export function KpiTrendChart({ vehicles, selectedKpiId = 'bg_to_delivery' }: KpiTrendChartProps) {
  const trendData = React.useMemo(() => {
    const kpiDef = KPI_DEFINITIONS.find(k => k.id === selectedKpiId);
    if (!kpiDef) return [];

    const field = kpiDef.computedField;

    // Group by month based on bg_date — no fixed window, use all vehicles passed in
    const monthlyData = new Map<string, number[]>();

    vehicles.forEach(v => {
      const bgDate = v.bg_date ? new Date(v.bg_date) : null;
      if (!bgDate) return;

      const value = v[field as keyof VehicleCanonical] as number | null | undefined;
      if (value === null || value === undefined || value < 0) return;

      const monthKey = bgDate.toISOString().slice(0, 7); // YYYY-MM
      const arr = monthlyData.get(monthKey) || [];
      arr.push(value);
      monthlyData.set(monthKey, arr);
    });

    if (monthlyData.size === 0) return [];

    // Derive the month range from the actual data so we respect the active period filter
    const sortedKeys = [...monthlyData.keys()].sort();
    const firstMonth = sortedKeys[0];
    const lastMonth = sortedKeys[sortedKeys.length - 1];

    // Build a contiguous list of months between first and last
    const months: string[] = [];
    const cursor = new Date(firstMonth + '-01');
    const end = new Date(lastMonth + '-01');
    while (cursor <= end) {
      months.push(cursor.toISOString().slice(0, 7));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months.map(month => {
      const values = monthlyData.get(month);
      if (!values || values.length === 0) {
        return {
          month,
          label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          median: null,
          average: null,
          count: 0,
        };
      }
      const sorted = [...values].sort((a, b) => a - b);
      const midIdx = Math.ceil(sorted.length / 2) - 1;
      const median = sorted[midIdx];
      const avg = Math.round(sorted.reduce((s, val) => s + val, 0) / sorted.length);

      return {
        month,
        label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        median,
        average: avg,
        count: values.length,
      };
    });
  }, [vehicles, selectedKpiId]);

  const selectedKpi = KPI_DEFINITIONS.find(k => k.id === selectedKpiId);
  const latestPoint = React.useMemo(
    () => [...trendData].reverse().find(point => point.count > 0) ?? null,
    [trendData],
  );
  const allEmpty = trendData.length === 0 || trendData.every(p => p.count === 0);

  if (allEmpty) {
    return (
      <Card className="glass-panel">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {selectedKpi?.shortLabel} — Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40">
          <p className="text-sm text-muted-foreground">No data available for the selected period.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {selectedKpi?.shortLabel} — Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Monthly median versus average cycle time for the selected KPI across the last six months.
            </p>
          </div>
          {latestPoint && (
            <div className="rounded-lg border border-border/70 bg-secondary/45 px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Latest month</p>
              <p className="text-sm font-semibold text-foreground">{latestPoint.label}</p>
              <p className="text-[11px] text-muted-foreground">{latestPoint.count} vehicles sampled</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trendData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.8)" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
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
              labelFormatter={(label) => `${label}`}
              formatter={(value: number, name: string) => {
                if (name === 'count') return [value, 'Vehicles'];
                return [value, name === 'median' ? 'Median Days' : 'Average Days'];
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              iconType="circle"
            />
            <Line 
              type="monotone" 
              dataKey="median" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              name="Median"
            />
            <Line 
              type="monotone" 
              dataKey="average" 
              stroke="hsl(var(--info))" 
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5, fill: 'hsl(var(--info))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              name="Average"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}