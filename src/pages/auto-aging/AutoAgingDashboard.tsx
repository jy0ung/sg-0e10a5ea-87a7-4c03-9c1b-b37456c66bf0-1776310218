import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Filter, Upload, X, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AgingTrendChart } from '@/components/charts/AgingTrendChart';
import { OutlierScatterChart } from '@/components/charts/OutlierScatterChart';
import { PaymentPieChart } from '@/components/charts/PaymentPieChart';
import { KpiTrendChart } from '@/components/charts/KpiTrendChart';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';

export default function AutoAgingDashboard() {
  const { kpiSummaries, vehicles, qualityIssues, lastRefresh, refreshKpis, loading } = useData();
  const navigate = useNavigate();
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [selectedKpiId, setSelectedKpiId] = useState<string>('bg_to_delivery');
  const [vehicleDetailsOpen, setVehicleDetailsOpen] = useState(false);
  const [detailKpiId, setDetailKpiId] = useState<string | null>(null);

  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();
  const models = [...new Set(vehicles.map(v => v.model))].sort();

  const filtered = vehicles.filter(v => {
    if (branchFilter !== 'all' && v.branch_code !== branchFilter) return false;
    if (modelFilter !== 'all' && v.model !== modelFilter) return false;
    return true;
  });

  // Get vehicles for a specific KPI
  const getKpiVehicles = (kpiId: string) => {
    const kpiDef = KPI_DEFINITIONS.find(k => k.id === kpiId);
    if (!kpiDef) return [];
    const kpiSummary = kpiSummaries.find(k => k.kpiId === kpiId);
    if (!kpiSummary) return [];
    
    return filtered.filter(v => {
      const val = v[kpiDef.computedField as keyof typeof v] as number | null | undefined;
      return val !== null && val !== undefined && val >= 0;
    }).sort((a, b) => {
      const valA = a[kpiDef.computedField as keyof typeof a] as number;
      const valB = b[kpiDef.computedField as keyof typeof b] as number;
      return valB - valA; // Sort descending
    });
  };

  const handleKpiCardClick = (kpiId: string) => {
    setDetailKpiId(kpiId);
    setVehicleDetailsOpen(true);
  };

  const processStages = [
    { label: 'BG Date', short: 'BG' },
    { label: 'Shipment ETD', short: 'ETD' },
    { label: 'Outlet Received', short: 'OUT' },
    { label: 'Registration', short: 'REG' },
    { label: 'Delivery', short: 'DEL' },
    { label: 'Disbursement', short: 'DISB' },
  ];

  const segmentKpiIds = ['bg_to_shipment_etd', 'etd_to_outlet', 'outlet_to_reg', 'reg_to_delivery', 'delivery_to_disb'];

  const branchHeatmap = React.useMemo(() => {
    const groups = new Map<string, { bgToDelivery: number[]; etdToOutlet: number[]; regToDelivery: number[] }>();
    filtered.forEach(v => {
      const g = groups.get(v.branch_code) || { bgToDelivery: [], etdToOutlet: [], regToDelivery: [] };
      if (v.bg_to_delivery != null && v.bg_to_delivery >= 0) g.bgToDelivery.push(v.bg_to_delivery);
      if (v.etd_to_outlet != null && v.etd_to_outlet >= 0) g.etdToOutlet.push(v.etd_to_outlet);
      if (v.reg_to_delivery != null && v.reg_to_delivery >= 0) g.regToDelivery.push(v.reg_to_delivery);
      groups.set(v.branch_code, g);
    });

    return Array.from(groups.entries()).map(([branch, g]) => ({
      branch,
      bgToDelivery: g.bgToDelivery.length ? Math.round(g.bgToDelivery.reduce((s, v) => s + v, 0) / g.bgToDelivery.length) : 0,
      etdToOutlet: g.etdToOutlet.length ? Math.round(g.etdToOutlet.reduce((s, v) => s + v, 0) / g.etdToOutlet.length) : 0,
      regToDelivery: g.regToDelivery.length ? Math.round(g.regToDelivery.reduce((s, v) => s + v, 0) / g.regToDelivery.length) : 0,
    })).sort((a, b) => b.bgToDelivery - a.bgToDelivery);
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Auto Aging Overview"
          description="Vehicle aging analysis across operational milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Overview' }]}
        />
        <div className="glass-panel p-12 text-center">
          <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Data Imported Yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Upload your Excel workbook to start analyzing vehicle aging across milestones.</p>
          <Button onClick={() => navigate('/auto-aging/import')} className="bg-primary text-primary-foreground">
            <Upload className="h-4 w-4 mr-2" />Go to Import Center
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Auto Aging Overview"
        description="Vehicle aging analysis across operational milestones"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Overview' }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="text-right mr-2">
              <p className="text-[10px] text-muted-foreground">Last refresh</p>
              <p className="text-xs text-foreground">{new Date(lastRefresh).toLocaleString()}</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshKpis}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
            <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={modelFilter} onChange={e => setModelFilter(e.target.value)} className="h-8 rounded-md bg-secondary border border-border px-3 text-xs text-foreground">
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} vehicles</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {kpiSummaries.map(kpi => (
          <KpiCard
            key={kpi.kpiId}
            label={kpi.shortLabel}
            value={kpi.median}
            subtitle={`Avg: ${kpi.average}d • P90: ${kpi.p90}d`}
            status={kpi.overdueCount > 10 ? 'critical' : kpi.overdueCount > 0 ? 'warning' : 'normal'}
            validCount={kpi.validCount}
            overdueCount={kpi.overdueCount}
            onClick={() => handleKpiCardClick(kpi.kpiId)}
          />
        ))}
      </div>

      {/* Trend Chart */}
      <KpiTrendChart vehicles={filtered} selectedKpiId={selectedKpiId} />

      {/* Branch Heatmap + Quality */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Branch Comparison — Average Days</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={branchHeatmap} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--foreground))' }} />
              <Bar dataKey="bgToDelivery" name="BG→Delivery" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="etdToOutlet" name="ETD→Outlet" fill="hsl(199, 89%, 48%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="regToDelivery" name="Reg→Delivery" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Data Quality</h3>
          <div className="space-y-2">
            {qualityIssues.length === 0 && <p className="text-xs text-muted-foreground">No issues detected.</p>}
            {qualityIssues.slice(0, 8).map(issue => (
              <div key={issue.id} className="p-2 rounded bg-secondary/50 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-foreground">{issue.chassisNo.slice(0, 12)}</span>
                  <StatusBadge status={issue.issueType} />
                </div>
                <p className="text-[10px] text-muted-foreground">{issue.message}</p>
              </div>
            ))}
            {qualityIssues.length > 8 && (
              <button onClick={() => navigate('/auto-aging/quality')} className="w-full text-xs text-primary hover:underline py-2">
                View all {qualityIssues.length} issues →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Trend + Payment Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <AgingTrendChart vehicles={filtered} />
        <PaymentPieChart vehicles={filtered} />
      </div>

      {/* Outlier Scatter */}
      <OutlierScatterChart vehicles={filtered} onVehicleClick={(chassis) => navigate(`/auto-aging/vehicles/${chassis}`)} />

      {/* Slowest Vehicles Preview */}
      <div className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Slowest Vehicles (BG → Delivery)</h3>
          <button onClick={() => navigate('/auto-aging/vehicles')} className="text-xs text-primary hover:underline">View All →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Chassis</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Branch</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Model</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">BG→Del</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">ETD→Out</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Reg→Del</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .filter(v => v.bg_to_delivery != null && v.bg_to_delivery >= 0)
                .sort((a, b) => (b.bg_to_delivery ?? 0) - (a.bg_to_delivery ?? 0))
                .slice(0, 10)
                .map(v => (
                  <tr key={v.id} className="data-table-row cursor-pointer" onClick={() => navigate(`/auto-aging/vehicles/${v.chassis_no}`)}>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{v.chassis_no}</td>
                    <td className="px-3 py-2 text-foreground">{v.branch_code}</td>
                    <td className="px-3 py-2 text-foreground">{v.model}</td>
                    <td className="px-3 py-2"><span className={(v.bg_to_delivery ?? 0) > 45 ? 'text-destructive font-semibold' : 'text-foreground'}>{v.bg_to_delivery}d</span></td>
                    <td className="px-3 py-2 text-foreground">{v.etd_to_outlet != null ? `${v.etd_to_outlet}d` : '—'}</td>
                    <td className="px-3 py-2 text-foreground">{v.reg_to_delivery != null ? `${v.reg_to_delivery}d` : '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={(v.bg_to_delivery ?? 0) > 45 ? 'warning' : 'active'} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vehicle Details Modal */}
      <Dialog open={vehicleDetailsOpen} onOpenChange={setVehicleDetailsOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {detailKpiId && KPI_DEFINITIONS.find(k => k.id === detailKpiId)?.label} — Vehicle Details
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setVehicleDetailsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[65vh]">
            {detailKpiId ? (
              <>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Chassis No</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Model</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Branch</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Days</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getKpiVehicles(detailKpiId).slice(0, 50).map(v => {
                      const kpiDef = KPI_DEFINITIONS.find(k => k.id === detailKpiId);
                      const kpiField = kpiDef?.computedField;
                      const value = kpiField ? (v[kpiField as keyof typeof v] as number) : 0;
                      const kpiSummary = kpiSummaries.find(k => k.kpiId === detailKpiId);
                      const isOverdue = kpiSummary ? value > kpiSummary.slaDays : false;
                      
                      return (
                        <tr 
                          key={v.id} 
                          className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer"
                          onClick={() => navigate(`/auto-aging/vehicles/${v.chassis_no}`)}
                        >
                          <td className="px-3 py-2 font-medium">{v.chassis_no}</td>
                          <td className="px-3 py-2">{v.model}</td>
                          <td className="px-3 py-2">{v.branch_code}</td>
                          <td className="px-3 py-2">{v.customer_name}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`font-semibold ${isOverdue ? 'text-destructive' : 'text-success'}`}>
                              {value}d
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={isOverdue ? 'warning' : 'active'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {getKpiVehicles(detailKpiId).length > 50 && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    Showing 50 of {getKpiVehicles(detailKpiId).length} vehicles. 
                    <button 
                      onClick={() => navigate('/auto-aging/vehicles')}
                      className="text-primary hover:underline ml-2"
                    >
                      View all →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No KPI selected</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
