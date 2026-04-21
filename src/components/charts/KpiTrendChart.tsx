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
    
    // Group by month based on bg_date
    const monthlyData = new Map<string, number[]>();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    vehicles.forEach(v => {
      const bgDate = v.bg_date ? new Date(v.bg_date) : null;
      if (!bgDate || bgDate < sixMonthsAgo) return;

      const value = v[field as keyof VehicleCanonical] as number | null | undefined;
      if (value === null || value === undefined || value < 0) return;

      const monthKey = bgDate.toISOString().slice(0, 7); // YYYY-MM
      const arr = monthlyData.get(monthKey) || [];
      arr.push(value);
      monthlyData.set(monthKey, arr);
    });

    // Generate last 6 months keys
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    return months.map(month => {
      const values = monthlyData.get(month) || [];
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
      const avg = sorted.length > 0 ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length) : 0;
      
      return {
        month,
        label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
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

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {selectedKpi?.shortLabel} — 6 Month Trend
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
              activeDot={{ r: 5, fill: 'hsl(var(--info))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              name="Average"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}