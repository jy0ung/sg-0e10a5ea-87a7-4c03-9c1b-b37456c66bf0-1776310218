import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AgingTrendChart } from '@/components/charts/AgingTrendChart';
import { OutlierScatterChart } from '@/components/charts/OutlierScatterChart';
import { PaymentPieChart } from '@/components/charts/PaymentPieChart';
import { StagePipelineCard } from '@/components/charts/StagePipelineCard';
import { KpiTrendChart } from '@/components/charts/KpiTrendChart';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { BranchPeriodFilter } from '@/components/shared/BranchPeriodFilter';
import { getAutoAgingDashboardSummary, searchVehicles } from '@/services/vehicleService';
import { getDashboardPeriodRange, getDashboardScopeSummary, loadDashboardFilterState, saveDashboardFilterState } from '@/lib/dashboardFilters';
import { AUTO_AGING_BG_DATE_PERIOD_LABEL, getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

function toServerValue(value: string): string | null {
  return value === 'all' ? null : value;
}

export default function AutoAgingDashboard() {
  const { lastRefresh, reloadFromDb } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dashboardFilter, setDashboardFilter] = useState(() => loadDashboardFilterState('auto-aging-overview'));
  const { branch: branchFilter, model: modelFilter, period: periodFilter } = dashboardFilter;
  const [selectedKpiId, setSelectedKpiId] = useState<string>('bg_to_delivery');
  const [vehicleDetailsOpen, setVehicleDetailsOpen] = useState(false);
  const [detailKpiId, setDetailKpiId] = useState<string | null>(null);

  const periodRange = useMemo(() => getDashboardPeriodRange(periodFilter), [periodFilter]);
  const bgDateFrom = periodRange.from?.toISOString().slice(0, 10) ?? null;
  const bgDateTo = periodRange.to?.toISOString().slice(0, 10) ?? null;

  const summaryQuery = useQuery({
    queryKey: ['auto-aging-dashboard-summary', user?.company_id, branchFilter, modelFilter, bgDateFrom, bgDateTo],
    queryFn: () => getAutoAgingDashboardSummary({
      branch: toServerValue(branchFilter),
      model: toServerValue(modelFilter),
      bgDateFrom,
      bgDateTo,
    }).then(result => {
      if (result.error) throw result.error;
      return result.data;
    }),
    enabled: !!user?.company_id,
    placeholderData: previous => previous,
    staleTime: 15_000,
  });

  const vehicleRowsQuery = useQuery({
    queryKey: ['auto-aging-dashboard-rows', user?.company_id, branchFilter, modelFilter, bgDateFrom, bgDateTo],
    queryFn: () => searchVehicles({
      branch: toServerValue(branchFilter),
      model: toServerValue(modelFilter),
      bgDateFrom,
      bgDateTo,
      limit: 2_000,
      offset: 0,
      sortColumn: 'bg_date',
      sortDirection: 'desc',
    }).then(result => {
      if (result.error) throw result.error;
      return result.data;
    }),
    enabled: !!user?.company_id,
    placeholderData: previous => previous,
    staleTime: 15_000,
  });

  const branches = summaryQuery.data?.availableBranches ?? [];
  const models = summaryQuery.data?.availableModels ?? [];
  const filtered = vehicleRowsQuery.data?.rows ?? [];
  const filteredVehicleCount = vehicleRowsQuery.data?.totalCount ?? 0;
  const filteredQualityIssues = summaryQuery.data?.qualityIssueSample ?? [];
  const filteredQualityIssueCount = summaryQuery.data?.qualityIssueCount ?? 0;
  const filteredKpiSummaries = summaryQuery.data?.kpiSummaries ?? [];
  const hasImportedData = branches.length > 0 || models.length > 0 || filteredVehicleCount > 0 || filteredQualityIssueCount > 0;
  const isLoading = (summaryQuery.isLoading || vehicleRowsQuery.isLoading) && !summaryQuery.data && !vehicleRowsQuery.data;
  const loadError = summaryQuery.error ?? vehicleRowsQuery.error ?? null;
  const sampleLimitApplied = filteredVehicleCount > filtered.length;

  useEffect(() => {
    saveDashboardFilterState('auto-aging-overview', dashboardFilter);
  }, [dashboardFilter]);

  useEffect(() => {
    if (branchFilter !== 'all' && branches.length > 0 && !branches.includes(branchFilter)) {
      setDashboardFilter(prev => ({ ...prev, branch: 'all' }));
    }
  }, [branchFilter, branches]);

  useEffect(() => {
    if (modelFilter !== 'all' && models.length > 0 && !models.includes(modelFilter)) {
      setDashboardFilter(prev => ({ ...prev, model: 'all' }));
    }
  }, [modelFilter, models]);

  const scopeSummary = getDashboardScopeSummary(dashboardFilter);

  // Get vehicles for a specific KPI
  const getKpiVehicles = (kpiId: string) => {
    const kpiDef = KPI_DEFINITIONS.find(k => k.id === kpiId);
    if (!kpiDef) return [];
    const kpiSummary = filteredKpiSummaries.find(k => k.kpiId === kpiId);
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
    setSelectedKpiId(kpiId);
    setDetailKpiId(kpiId);
    setVehicleDetailsOpen(true);
  };

  const processStages = [
    { label: getAutoAgingFieldLabel('bg_date', 'BG DATE'), short: 'BG' },
    { label: getAutoAgingFieldLabel('shipment_etd_pkg', 'SHIPMENT ETD PKG'), short: 'ETD' },
    { label: getAutoAgingFieldLabel('date_received_by_outlet', 'RECEIVED BY OUTLET'), short: 'OUT' },
    { label: getAutoAgingFieldLabel('reg_date', 'REG DATE'), short: 'REG' },
    { label: getAutoAgingFieldLabel('delivery_date', 'DELIVERY DATE'), short: 'DEL' },
    { label: getAutoAgingFieldLabel('disb_date', 'DISB. DATE'), short: 'DISB' },
  ];

  const segmentKpiIds = ['bg_to_shipment_etd', 'etd_to_outlet', 'outlet_to_reg', 'reg_to_delivery', 'delivery_to_disb'];

  const branchHeatmap = useMemo(() => {
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

  const handleRefresh = async () => {
    await Promise.all([
      reloadFromDb(),
      queryClient.invalidateQueries({ queryKey: ['auto-aging-dashboard-summary', user?.company_id] }),
      queryClient.invalidateQueries({ queryKey: ['auto-aging-dashboard-rows', user?.company_id] }),
    ]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (loadError && !hasImportedData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Auto Aging Overview"
          description="Vehicle aging analysis across operational milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Overview' }]}
        />
        <div className="glass-panel p-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Auto Aging Data</h3>
          <p className="text-sm text-muted-foreground mb-6">
            The dashboard could not load the latest summary data. Retry the query, and sign out then sign back in if the problem persists.
          </p>
          <Button onClick={() => void handleRefresh()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />Retry Load
          </Button>
        </div>
      </div>
    );
  }

  if (!hasImportedData) {
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
          <p className="text-sm text-muted-foreground mb-6">Upload your consolidated inventory report workbook to start analyzing vehicle aging across milestones.</p>
          <Button onClick={() => navigate('/auto-aging/import')} className="bg-primary text-primary-foreground">
            <Upload className="h-4 w-4 mr-2" />Go to Import Center
          </Button>
        </div>
      </div>
    );
  }

  if (filteredVehicleCount === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Auto Aging Overview"
          description="Vehicle aging analysis across operational milestones"
          breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Overview' }]}
          actions={
            <BranchPeriodFilter
              branches={branches}
              branch={branchFilter}
              period={periodFilter}
              model={modelFilter}
              models={models}
              onBranchChange={(value) => setDashboardFilter(prev => ({ ...prev, branch: value }))}
              onPeriodChange={(value) => setDashboardFilter(prev => ({ ...prev, period: value }))}
              onModelChange={(value) => setDashboardFilter(prev => ({ ...prev, model: value }))}
              periodLabel={AUTO_AGING_BG_DATE_PERIOD_LABEL}
            />
          }
        />
        <div className="glass-panel p-12 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Vehicles Match the Current Filters</h3>
            <p className="text-sm text-muted-foreground">
              Adjust the branch, model, or BG DATE period filters to load overview metrics for a broader slice.
            </p>
          </div>
          <Button variant="outline" onClick={() => setDashboardFilter({ branch: 'all', period: 'all_time', model: 'all' })}>
            Reset Filters
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
            <BranchPeriodFilter
              branches={branches}
              branch={branchFilter}
              period={periodFilter}
              model={modelFilter}
              models={models}
              onBranchChange={(value) => setDashboardFilter(prev => ({ ...prev, branch: value }))}
              onPeriodChange={(value) => setDashboardFilter(prev => ({ ...prev, period: value }))}
              onModelChange={(value) => setDashboardFilter(prev => ({ ...prev, model: value }))}
              periodLabel={AUTO_AGING_BG_DATE_PERIOD_LABEL}
            />
            <div className="text-right mr-2">
              <p className="text-[10px] text-muted-foreground">Last refresh</p>
              <p className="text-xs text-foreground">{new Date(lastRefresh).toLocaleString()}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleRefresh()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
            </Button>
            <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
          </div>
        }
      />

      <div className="glass-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{scopeSummary}</p>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">{filteredVehicleCount} vehicles</span>
          {sampleLimitApplied && (
            <p className="text-[10px] text-muted-foreground">Charts use the first {filtered.length.toLocaleString()} filtered rows returned by the server.</p>
          )}
        </div>
      </div>

      {/* ── Section 1: Process KPIs ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Process KPIs</h2>
            <p className="text-[11px] text-muted-foreground">Median cycle time per milestone. Click a card to inspect the contributing vehicles.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {filteredKpiSummaries.map(kpi => (
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
      </section>

      {/* ── Section 2: Trend ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cycle Time Trend</h2>
          <p className="text-[11px] text-muted-foreground">Switch KPI by clicking a card above to explore its trajectory.</p>
        </div>
        <KpiTrendChart vehicles={filtered} selectedKpiId={selectedKpiId} />
      </section>

      {/* ── Section 3: Pipeline snapshot ── two equal columns for a balanced snapshot */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Pipeline Snapshot</h2>
          <p className="text-[11px] text-muted-foreground">Current stage distribution and how aging evolves over time.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AgingTrendChart vehicles={filtered} />
          <StagePipelineCard
            vehicles={filtered}
            onStageClick={(stage) => navigate(`/auto-aging/vehicles?stage=${stage}`)}
          />
        </div>
      </section>

      {/* ── Section 4: Segmentation ── full-width Payment card (dense legend) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Segmentation</h2>
          <p className="text-[11px] text-muted-foreground">How the fleet splits across payment channels. Click a slice to drill into that bucket.</p>
        </div>
        <PaymentPieChart
          vehicles={filtered}
          onSliceClick={(method) =>
            navigate(`/auto-aging/vehicles?payment=${encodeURIComponent(method)}`)
          }
        />
      </section>

      {/* ── Section 5: Branch performance + Data quality ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Branch Performance &amp; Quality</h2>
          <p className="text-[11px] text-muted-foreground">Branch-level cycle times alongside data-quality alerts for the current filter.</p>
        </div>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Data Quality</h3>
              {filteredQualityIssueCount > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {filteredQualityIssueCount} issue{filteredQualityIssueCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {filteredQualityIssueCount === 0 && <p className="text-xs text-muted-foreground">No issues detected.</p>}
              {filteredQualityIssues.map(issue => (
                <div key={issue.id} className="p-2 rounded bg-secondary/50 border border-border/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-foreground">{issue.chassisNo.slice(0, 12)}</span>
                    <StatusBadge status={issue.issueType} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{issue.message}</p>
                </div>
              ))}
              {filteredQualityIssueCount > filteredQualityIssues.length && (
                <button onClick={() => navigate('/auto-aging/quality')} className="w-full text-xs text-primary hover:underline py-2">
                  View all {filteredQualityIssueCount} issues →
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: Outliers & slowest vehicles ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Outliers &amp; Slowest Vehicles</h2>
          <p className="text-[11px] text-muted-foreground">Individual vehicles that are dragging the averages.</p>
        </div>
        <OutlierScatterChart vehicles={filtered} onVehicleClick={(chassis) => navigate(`/auto-aging/vehicles/${chassis}`)} />

        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Slowest Vehicles (BG → Delivery)</h3>
            <button onClick={() => navigate('/auto-aging/vehicles')} className="text-xs text-primary hover:underline">View All →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium">{getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.')}</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium">{getAutoAgingFieldLabel('branch_code', 'BRCH K1')}</th>
                  <th className="px-3 py-2 text-xs text-muted-foreground font-medium">{getAutoAgingFieldLabel('model', 'MODEL')}</th>
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
      </section>

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
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.')}</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('model', 'MODEL')}</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('branch_code', 'BRCH K1')}</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">{getAutoAgingFieldLabel('customer_name', 'CUST NAME')}</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Days</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getKpiVehicles(detailKpiId).slice(0, 50).map(v => {
                      const kpiDef = KPI_DEFINITIONS.find(k => k.id === detailKpiId);
                      const kpiField = kpiDef?.computedField;
                      const value = kpiField ? (v[kpiField as keyof typeof v] as number) : 0;
                      const kpiSummary = filteredKpiSummaries.find(k => k.kpiId === detailKpiId);
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
