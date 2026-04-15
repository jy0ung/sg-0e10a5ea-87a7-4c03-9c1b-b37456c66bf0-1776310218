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

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {selectedKpi?.shortLabel} — 6 Month Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
              axisLine={false}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
              axisLine={false}
              label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip 
              contentStyle={{ 
                background: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '6px', 
                fontSize: '12px', 
                color: 'hsl(var(--foreground))' 
              }}
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
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name="Median"
            />
            <Line 
              type="monotone" 
              dataKey="average" 
              stroke="hsl(199, 89%, 48%)" 
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name="Average"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}