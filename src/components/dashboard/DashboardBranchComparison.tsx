import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(199, 89%, 48%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(280, 65%, 60%)',
  'hsl(350, 80%, 55%)',
  'hsl(175, 70%, 40%)',
];

export interface BranchChartDatum {
  branch: string;
  avg: number;
  count: number;
}

interface DashboardBranchComparisonProps {
  data: BranchChartDatum[];
}

export function DashboardBranchComparison({ data }: DashboardBranchComparisonProps) {
  return (
    <div className="glass-panel p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Branch Comparison</h3>
          <p className="text-sm text-muted-foreground">Average BG to Delivery cycle time by branch in the current scope.</p>
        </div>
        <p className="text-[11px] text-muted-foreground">{data.length} branches compared</p>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {data.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[Math.min(index, CHART_COLORS.length - 1)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
          No BG to Delivery branch comparison is available for the current filters.
        </div>
      )}
    </div>
  );
}
