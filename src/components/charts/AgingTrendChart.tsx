import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { VehicleCanonical } from '@/types';

interface Props {
  vehicles: VehicleCanonical[];
}

export function AgingTrendChart({ vehicles }: Props) {
  const trendData = useMemo(() => {
    const monthMap = new Map<string, { bgToDel: number[]; etdToOut: number[]; regToDel: number[] }>();

    vehicles.forEach(v => {
      if (!v.bg_date) return;
      const month = v.bg_date.slice(0, 7);
      const entry = monthMap.get(month) || { bgToDel: [], etdToOut: [], regToDel: [] };
      if (v.bg_to_delivery != null && v.bg_to_delivery >= 0) entry.bgToDel.push(v.bg_to_delivery);
      if (v.etd_to_outlet != null && v.etd_to_outlet >= 0) entry.etdToOut.push(v.etd_to_outlet);
      if (v.reg_to_delivery != null && v.reg_to_delivery >= 0) entry.regToDel.push(v.reg_to_delivery);
      monthMap.set(month, entry);
    });

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        label: new Date(`${month}-01`).toLocaleDateString('en-US', { month: 'short' }),
        'BG→Delivery': avg(d.bgToDel),
        'ETD→Outlet': avg(d.etdToOut),
        'Reg→Delivery': avg(d.regToDel),
      }));
  }, [vehicles]);

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base font-semibold">Aging Trend Over Time</CardTitle>
        <p className="text-xs text-muted-foreground">
          Monthly average cycle time across the major delivery handoffs, aligned to the new enterprise chart styling.
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trendData} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.8)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} unit="d" allowDecimals={false} />
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
              formatter={(value: number, name: string) => [`${value}d`, name]}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
            <Line type="monotone" dataKey="BG→Delivery" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
            <Line type="monotone" dataKey="ETD→Outlet" stroke="hsl(var(--info))" strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={{ r: 5, fill: 'hsl(var(--info))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
            <Line type="monotone" dataKey="Reg→Delivery" stroke="hsl(var(--success))" strokeWidth={2.5} strokeDasharray="3 5" dot={false} activeDot={{ r: 5, fill: 'hsl(var(--success))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
