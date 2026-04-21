import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell, ReferenceLine } from 'recharts';
import { VehicleCanonical } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  vehicles: VehicleCanonical[];
  onVehicleClick?: (chassisNo: string) => void;
}

export function OutlierScatterChart({ vehicles, onVehicleClick }: Props) {
  const scatterData = useMemo(() => {
    return vehicles
      .filter(v => v.bg_to_delivery != null && v.bg_to_delivery >= 0 && v.etd_to_outlet != null && v.etd_to_outlet >= 0)
      .map(v => ({
        chassisNo: v.chassis_no,
        branch: v.branch_code,
        bgToDelivery: v.bg_to_delivery!,
        etdToOutlet: v.etd_to_outlet!,
      }));
  }, [vehicles]);

  const { p90BgDel, p90EtdOut } = useMemo(() => {
    const bgDels = scatterData.map(d => d.bgToDelivery).sort((a, b) => a - b);
    const etdOuts = scatterData.map(d => d.etdToOutlet).sort((a, b) => a - b);
    return {
      p90BgDel: bgDels[Math.floor(bgDels.length * 0.9)] ?? 60,
      p90EtdOut: etdOuts[Math.floor(etdOuts.length * 0.9)] ?? 25,
    };
  }, [scatterData]);

  const getStatus = (d: { bgToDelivery: number; etdToOutlet: number }) => {
    if (d.bgToDelivery > p90BgDel || d.etdToOutlet > p90EtdOut) return 'outlier';
    if (d.bgToDelivery > p90BgDel * 0.75 || d.etdToOutlet > p90EtdOut * 0.75) return 'at-risk';
    return 'normal';
  };

  const getColor = (d: { bgToDelivery: number; etdToOutlet: number }) => {
    const status = getStatus(d);
    if (status === 'outlier') return 'hsl(var(--destructive))';
    if (status === 'at-risk') return 'hsl(var(--warning))';
    return 'hsl(var(--info))';
  };

  const statusSummary = useMemo(() => {
    return scatterData.reduce(
      (summary, point) => {
        const status = getStatus(point);
        summary[status] += 1;
        return summary;
      },
      { normal: 0, 'at-risk': 0, outlier: 0 },
    );
  }, [scatterData, p90BgDel, p90EtdOut]);

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Outlier Detection — BG→Delivery vs ETD→Outlet</CardTitle>
            <p className="text-xs text-muted-foreground">
              Vehicles breaching the 90th percentile thresholds stand out immediately so exceptions can be reviewed faster.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-info/12 px-2.5 py-1 font-medium text-info">Normal {statusSummary.normal}</span>
            <span className="rounded-full bg-warning/12 px-2.5 py-1 font-medium text-warning">At Risk {statusSummary['at-risk']}</span>
            <span className="rounded-full bg-destructive/12 px-2.5 py-1 font-medium text-destructive">Outlier {statusSummary.outlier}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">P90 thresholds: BG→Delivery {p90BgDel}d • ETD→Outlet {p90EtdOut}d</p>
      </CardHeader>
      <CardContent className="pt-6">
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.8)" />
          <XAxis
            dataKey="bgToDelivery"
            name="BG→Delivery"
            unit="d"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'BG → Delivery (days)', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            allowDecimals={false}
          />
          <YAxis
            dataKey="etdToOutlet"
            name="ETD→Outlet"
            unit="d"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'ETD → Outlet (days)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            allowDecimals={false}
          />
          <ZAxis range={[30, 30]} />
          <ReferenceLine x={p90BgDel} stroke="hsl(var(--warning))" strokeDasharray="5 5" />
          <ReferenceLine y={p90EtdOut} stroke="hsl(var(--warning))" strokeDasharray="5 5" />
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
            formatter={(value: number, name: string) => {
              if (name === 'bgToDelivery') return [`${value}d`, 'BG → Delivery'];
              if (name === 'etdToOutlet') return [`${value}d`, 'ETD → Outlet'];
              return [value, name];
            }}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as { chassisNo?: string; branch?: string } | undefined;
              return point?.chassisNo ? `${point.chassisNo} • ${point.branch}` : '';
            }}
            cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '4 4' }}
          />
          <Scatter
            data={scatterData}
            onClick={(d) => onVehicleClick?.(d.chassisNo)}
            style={{ cursor: 'pointer' }}
          >
            {scatterData.map((entry, i) => (
              <Cell key={i} fill={getColor(entry)} fillOpacity={0.82} stroke="hsl(var(--card))" strokeWidth={1} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}