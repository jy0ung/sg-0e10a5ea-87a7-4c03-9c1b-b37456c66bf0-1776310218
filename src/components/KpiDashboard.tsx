import React from 'react';
import { KpiSummary } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface KpiDashboardProps {
  kpiSummaries: KpiSummary[];
  showAdvanced?: boolean;
}

export function KpiDashboard({ kpiSummaries, showAdvanced = true }: KpiDashboardProps) {
  const chartColors = [
    'hsl(var(--primary))',
    'hsl(199, 89%, 48%)',
    'hsl(142, 71%, 45%)',
    'hsl(38, 92%, 50%)',
    'hsl(280, 65%, 60%)',
    'hsl(350, 80%, 55%)',
    'hsl(175, 70%, 40%)',
  ];

  const getComplianceColor = (compliance: number) => {
    if (compliance >= 90) return 'text-success';
    if (compliance >= 70) return 'text-warning';
    return 'text-destructive';
  };

  const getComplianceBg = (compliance: number) => {
    if (compliance >= 90) return 'bg-success/15 text-success';
    if (compliance >= 70) return 'bg-warning/15 text-warning';
    return 'bg-destructive/15 text-destructive';
  };

  const getStatusIcon = (kpi: KpiSummary) => {
    const compliance = kpi.validCount > 0 ? ((kpi.validCount - kpi.overdueCount) / kpi.validCount) * 100 : 100;
    
    if (compliance >= 90) {
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    } else if (compliance >= 70) {
      return <TrendingUp className="h-4 w-4 text-warning" />;
    } else {
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const sortedKpis = [...kpiSummaries].sort((a, b) => {
    const aCompliance = a.validCount > 0 ? ((a.validCount - a.overdueCount) / a.validCount) : 100;
    const bCompliance = b.validCount > 0 ? ((b.validCount - b.overdueCount) / b.validCount) : 100;
    return aCompliance - bCompliance;
  });

  const chartData = kpiSummaries.map((kpi, i) => {
    const compliance = kpi.validCount > 0 ? Math.round(((kpi.validCount - kpi.overdueCount) / kpi.validCount) * 100) : 100;
    const overdueRate = kpi.validCount > 0 ? Math.round((kpi.overdueCount / kpi.validCount) * 100) : 0;
    
    return {
      name: kpi.shortLabel,
      median: kpi.median,
      average: kpi.average,
      p90: kpi.p90,
      sla: kpi.slaDays,
      compliance,
      overdueRate,
      valid: kpi.validCount,
      overdue: kpi.overdueCount,
    };
  });

  return (
    <div className="space-y-6">
      {/* Overall Compliance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedKpis.slice(0, 3).map((kpi, idx) => {
          const compliance = kpi.validCount > 0 ? Math.round(((kpi.validCount - kpi.overdueCount) / kpi.validCount) * 100) : 100;
          const isBreaching = kpi.median > kpi.slaDays;
          
          return (
            <Card key={kpi.kpiId} className="glass-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{kpi.shortLabel}</CardTitle>
                  {getStatusIcon(kpi)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{kpi.median}</p>
                      <p className="text-xs text-muted-foreground">Median days</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${getComplianceColor(compliance)}`}>{compliance}%</p>
                      <p className="text-xs text-muted-foreground">Compliance</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">SLA Target: {kpi.slaDays}d</span>
                      <span className={isBreaching ? 'text-destructive font-medium' : 'text-success'}>
                        {isBreaching ? 'Over SLA' : 'On Track'}
                      </span>
                    </div>
                    <Progress 
                      value={Math.min((kpi.median / (kpi.slaDays * 1.5)) * 100, 100)} 
                      className="h-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="p-2 rounded bg-secondary/30">
                      <p className="text-[10px] text-muted-foreground">Average</p>
                      <p className="text-sm font-semibold text-foreground">{kpi.average}d</p>
                    </div>
                    <div className="p-2 rounded bg-secondary/30">
                      <p className="text-[10px] text-muted-foreground">P90</p>
                      <p className="text-sm font-semibold text-foreground">{kpi.p90}d</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Compliance Comparison Chart */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base font-semibold">KPI Compliance Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))', 
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(var(--foreground))'
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'compliance') return [`${value}%`, 'Compliance'];
                  if (name === 'overdueRate') return [`${value}%`, 'Overdue Rate'];
                  if (name === 'median') return [`${value}d`, 'Median'];
                  if (name === 'sla') return [`${value}d`, 'SLA Target'];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
              <Bar dataKey="compliance" name="Compliance %" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sla" name="SLA Target" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed KPI Table */}
      {showAdvanced && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Detailed KPI Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">KPI</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">SLA</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Median</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">P90</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Valid</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Overdue</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedKpis.map((kpi) => {
                    const compliance = kpi.validCount > 0 ? Math.round(((kpi.validCount - kpi.overdueCount) / kpi.validCount) * 100) : 100;
                    const medianOverSLA = kpi.median > kpi.slaDays;
                    const p90OverSLA = kpi.p90 > kpi.slaDays;
                    
                    return (
                      <tr key={kpi.kpiId} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(kpi)}
                            <div>
                              <p className="font-medium text-foreground">{kpi.shortLabel}</p>
                              <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-muted-foreground">{kpi.slaDays}d</td>
                        <td className="px-3 py-3 text-right">
                          <span className={medianOverSLA ? 'text-destructive font-semibold' : 'text-foreground'}>
                            {kpi.median}d
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-foreground">{kpi.average}d</td>
                        <td className="px-3 py-3 text-right">
                          <span className={p90OverSLA ? 'text-warning font-medium' : 'text-foreground'}>
                            {kpi.p90}d
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-muted-foreground">{kpi.validCount}</td>
                        <td className="px-3 py-3 text-right">
                          <span className={kpi.overdueCount > 0 ? 'text-destructive font-semibold' : 'text-success'}>
                            {kpi.overdueCount}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getComplianceBg(compliance)}`}>
                            {compliance}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Data Quality Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedKpis.map((kpi) => {
                const total = kpi.validCount + kpi.invalidCount + kpi.missingCount;
                const validPercent = total > 0 ? (kpi.validCount / total) * 100 : 0;
                const invalidPercent = total > 0 ? (kpi.invalidCount / total) * 100 : 0;
                const missingPercent = total > 0 ? (kpi.missingCount / total) * 100 : 0;
                
                return (
                  <div key={kpi.kpiId} className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-foreground">{kpi.shortLabel}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {kpi.validCount} valid / {total} total
                      </span>
                    </div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-secondary">
                      <div 
                        className="bg-success" 
                        style={{ width: `${validPercent}%` }}
                        title={`Valid: ${validPercent.toFixed(1)}%`}
                      />
                      <div 
                        className="bg-warning" 
                        style={{ width: `${invalidPercent}%` }}
                        title={`Invalid: ${invalidPercent.toFixed(1)}%`}
                      />
                      <div 
                        className="bg-muted" 
                        style={{ width: `${missingPercent}%` }}
                        title={`Missing: ${missingPercent.toFixed(1)}%`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Overdue Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sortedKpis} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                  axisLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="shortLabel" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', width: 75 }}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))', 
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: 'hsl(var(--foreground))'
                  }}
                />
                <Bar dataKey="overdueCount" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}