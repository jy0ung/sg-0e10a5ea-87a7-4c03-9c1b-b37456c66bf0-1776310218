import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useData } from '@/contexts/DataContext';
import { getAutoAgingDashboardSummary, getAutoAgingReport, searchVehicles } from '@/services/vehicleService';
import { useAuth } from '@/contexts/AuthContext';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { AlertTriangle, BarChart3, CalendarCheck, Car, CheckCircle, Settings2, ShoppingCart, Sparkles, Timer, TrendingUp, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import {
  fetchDashboardPreferences,
  upsertDashboardPreferences,
} from '@/services/dashboardPreferencesService';
import { ExecutiveDashboardSettings } from './ExecutiveDashboardSettings';
import { useSales } from '@/contexts/SalesContext';
import { computeKpiSummaries } from '@/utils/kpi-computation';
import { BranchPeriodFilter } from '@/components/shared/BranchPeriodFilter';
import { getDashboardPeriodRange, getDashboardScopeSummary, loadDashboardFilterState, matchesDashboardPeriod, saveDashboardFilterState } from '@/lib/dashboardFilters';
import {
  DEFAULT_PERSONAL_DASHBOARD,
  createCustomFormulaWidget,
  createCustomMetricWidget,
  evaluateCustomInsight,
  isSameDashboardPreferences,
  loadPersonalDashboardState,
  moveWidget,
  savePersonalDashboardState,
  sanitizeDashboardPreferences,
  type CustomInsightMetricId,
  type DashboardSystemWidgetId,
  type PersonalDashboardCustomFormula,
  type PersonalDashboardCustomMetric,
  type PersonalDashboardPreferences,
} from '@/lib/personalDashboard';
import { evaluateCustomKpiFormula, type CustomKpiFormula } from '@/lib/customKpiFormula';
import { DashboardSnapshotSection } from '@/components/dashboard/DashboardSnapshotSection';
import { DashboardScorecards } from '@/components/dashboard/DashboardScorecards';
import { DashboardBranchComparison } from '@/components/dashboard/DashboardBranchComparison';
import { DashboardCustomInsights } from '@/components/dashboard/DashboardCustomInsights';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardCardMetric } from '@/components/dashboard/types';

const KpiDashboard = React.lazy(() => import('@/components/KpiDashboard').then((module) => ({ default: module.KpiDashboard })));

const ALL_KPI_IDS = KPI_DEFINITIONS.map(k => k.id);
const BASIC_KPIS = ['bg_to_delivery', 'bg_to_disb'];
const ADVANCED_KPIS = ALL_KPI_IDS;
const EXECUTIVE_VEHICLE_SAMPLE_LIMIT = 5_000;

function toServerValue(value: string): string | null {
  return value === 'all' ? null : value;
}


type DashboardCustomWidget = PersonalDashboardCustomMetric | PersonalDashboardCustomFormula;

type DashboardRenderBlock =
  | { kind: 'section'; widgetId: DashboardSystemWidgetId }
  | { kind: 'custom-group'; widgets: DashboardCustomWidget[] };

export default function ExecutiveDashboard() {
  const { kpiSummaries: contextKpiSummaries, lastRefresh, importBatches, loading, availableBranches: contextBranches, availableModels: contextModels } = useData();
  const { user } = useAuth();
  const { salesOrders, customers } = useSales();

  const [selectedKpis, setSelectedKpis] = useState<string[]>(ADVANCED_KPIS);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [dashboardFilter, setDashboardFilter] = useState(() => loadDashboardFilterState('company-overview'));
  const [personalDashboard, setPersonalDashboard] = useState<PersonalDashboardPreferences>(() => loadPersonalDashboardState('company-overview'));
  const [newInsightMetricId, setNewInsightMetricId] = useState<CustomInsightMetricId>(CUSTOM_INSIGHT_DEFINITIONS[0].id);
  const [newInsightTitle, setNewInsightTitle] = useState('');
  const { branch: branchFilter, period: periodFilter, model: modelFilter } = dashboardFilter;
  const periodRange = useMemo(() => getDashboardPeriodRange(periodFilter), [periodFilter]);
  const bgDateFrom = periodRange.from?.toISOString().slice(0, 10) ?? null;
  const bgDateTo = periodRange.to?.toISOString().slice(0, 10) ?? null;

  // Load preferences
  useEffect(() => {
    async function loadPrefs() {
      if (!user?.id) { setPrefsLoaded(true); return; }
      const userId = user.id;
      const localDashboard = loadPersonalDashboardState('company-overview');
      const { data } = await fetchDashboardPreferences(userId);

      if (data) {
        setSelectedKpis(data.selected_kpis ?? ADVANCED_KPIS);
        setShowAdvanced(data.show_advanced_kpis ?? true);
        const remoteDashboard = sanitizeDashboardPreferences(data.personal_dashboard);
        setPersonalDashboard(
          isSameDashboardPreferences(remoteDashboard, sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD))
            && !isSameDashboardPreferences(localDashboard, sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD))
            ? localDashboard
            : remoteDashboard,
        );
      } else {
        setPersonalDashboard(localDashboard);
      }
      setPrefsLoaded(true);
    }
    loadPrefs();
  }, [user?.id]);

  useEffect(() => {
    saveDashboardFilterState('company-overview', dashboardFilter);
  }, [dashboardFilter]);

  // Debounced DB write: writes collapse to one request per 500ms of idle,
  // so rapid KPI / widget toggles don't saturate the network. Local
  // persistence still happens immediately so the UI feels instant.
  const pendingWriteRef = useRef<number | null>(null);
  const latestPayloadRef = useRef<{
    kpis: string[];
    advanced: boolean;
    dashboard: PersonalDashboardPreferences;
  } | null>(null);

  useEffect(() => () => {
    if (pendingWriteRef.current !== null) {
      window.clearTimeout(pendingWriteRef.current);
    }
  }, []);

  const savePreferences = useCallback((
    kpis: string[],
    advanced: boolean,
    nextDashboard: PersonalDashboardPreferences,
  ) => {
    // Write to localStorage immediately so a refresh never loses the user's
    // intent. It's sub-millisecond for small payloads.
    savePersonalDashboardState('company-overview', nextDashboard);
    if (!user?.id) return;
    const userId = user.id;
    latestPayloadRef.current = { kpis, advanced, dashboard: nextDashboard };
    if (pendingWriteRef.current !== null) {
      window.clearTimeout(pendingWriteRef.current);
    }
    pendingWriteRef.current = window.setTimeout(() => {
      pendingWriteRef.current = null;
      const payload = latestPayloadRef.current;
      latestPayloadRef.current = null;
      if (!payload) return;
      void upsertDashboardPreferences(userId, {
        selected_kpis: payload.kpis,
        show_advanced_kpis: payload.advanced,
        personal_dashboard: payload.dashboard,
      });
    }, 500);
  }, [user?.id]);

  const updatePersonalDashboard = useCallback((updater: (current: PersonalDashboardPreferences) => PersonalDashboardPreferences) => {
    setPersonalDashboard(current => {
      const nextDashboard = updater(current);
      void savePreferences(selectedKpis, showAdvanced, nextDashboard);
      return nextDashboard;
    });
  }, [savePreferences, selectedKpis, showAdvanced]);

  const toggleKpi = (kpiId: string) => {
    setSelectedKpis(prev => {
      const next = prev.includes(kpiId) ? prev.filter(k => k !== kpiId) : [...prev, kpiId];
      void savePreferences(next, showAdvanced, personalDashboard);
      return next;
    });
  };

  const toggleAdvancedView = () => {
    const next = !showAdvanced;
    setShowAdvanced(next);
    const newKpis = next ? ADVANCED_KPIS : BASIC_KPIS;
    setSelectedKpis(newKpis);
    void savePreferences(newKpis, next, personalDashboard);
  };

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    updatePersonalDashboard(current => ({
      widgets: current.widgets.map(widget => (
        widget.id === widgetId
          ? { ...widget, enabled: !widget.enabled }
          : widget
      )),
    }));
  }, [updatePersonalDashboard]);

  const moveDashboardWidget = useCallback((widgetId: string, direction: 'up' | 'down') => {
    updatePersonalDashboard(current => ({ widgets: moveWidget(current.widgets, widgetId, direction) }));
  }, [updatePersonalDashboard]);

  const removeCustomInsight = useCallback((widgetId: string) => {
    updatePersonalDashboard(current => ({
      widgets: current.widgets.filter(widget => widget.id !== widgetId),
    }));
  }, [updatePersonalDashboard]);

  const addCustomInsight = useCallback(() => {
    updatePersonalDashboard(current => ({
      widgets: [...current.widgets, createCustomMetricWidget(newInsightMetricId, newInsightTitle)],
    }));
    setNewInsightTitle('');
  }, [newInsightMetricId, newInsightTitle, updatePersonalDashboard]);

  const addCustomFormula = useCallback((title: string, formula: CustomKpiFormula) => {
    updatePersonalDashboard(current => ({
      widgets: [...current.widgets, createCustomFormulaWidget(title, formula)],
    }));
  }, [updatePersonalDashboard]);

  const restoreDefaultDashboard = useCallback(() => {
    const nextDashboard = sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD);
    setPersonalDashboard(nextDashboard);
    void savePreferences(selectedKpis, showAdvanced, nextDashboard);
  }, [savePreferences, selectedKpis, showAdvanced]);

  // Merge DataContext summary branches/models with sales order values
  const availableBranches = useMemo(() => {
    const branchValues = new Set<string>(contextBranches);
    salesOrders.forEach(order => {
      if (order.branchCode) branchValues.add(order.branchCode);
    });
    return Array.from(branchValues).sort();
  }, [contextBranches, salesOrders]);

  const availableModels = useMemo(() => {
    const modelValues = new Set<string>(contextModels);
    salesOrders.forEach(order => {
      if (order.model) modelValues.add(order.model);
    });
    return Array.from(modelValues).sort();
  }, [contextModels, salesOrders]);

  const dashboardSummaryParams = useMemo(() => ({
    branch: toServerValue(branchFilter),
    model: toServerValue(modelFilter),
    bgDateFrom,
    bgDateTo,
  }), [bgDateFrom, bgDateTo, branchFilter, modelFilter]);

  const { data: dashboardSummary } = useQuery({
    queryKey: ['executive-dashboard-auto-aging-summary', user?.company_id, dashboardSummaryParams] as const,
    queryFn: async () => {
      const res = await getAutoAgingDashboardSummary(dashboardSummaryParams);
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!user?.company_id,
    placeholderData: previous => previous,
    staleTime: 15_000,
  });

  const { data: vehicleSlice } = useQuery({
    queryKey: ['executive-dashboard-vehicle-slice', user?.company_id, dashboardSummaryParams] as const,
    queryFn: async () => {
      const res = await searchVehicles({
        branch: dashboardSummaryParams.branch,
        model: dashboardSummaryParams.model,
        bgDateFrom: dashboardSummaryParams.bgDateFrom,
        bgDateTo: dashboardSummaryParams.bgDateTo,
        limit: EXECUTIVE_VEHICLE_SAMPLE_LIMIT,
        offset: 0,
        sortColumn: 'bg_date',
        sortDirection: 'desc',
      });
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!user?.company_id,
    placeholderData: previous => previous,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (branchFilter !== 'all' && availableBranches.length > 0 && !availableBranches.includes(branchFilter)) {
      setDashboardFilter(prev => ({ ...prev, branch: 'all' }));
    }
  }, [availableBranches, branchFilter]);

  useEffect(() => {
    if (modelFilter !== 'all' && availableModels.length > 0 && !availableModels.includes(modelFilter)) {
      setDashboardFilter(prev => ({ ...prev, model: 'all' }));
    }
  }, [availableModels, modelFilter]);

  const scopedVehicles = useMemo(() => vehicleSlice?.rows ?? [], [vehicleSlice?.rows]);
  const scopedVehicleCount = vehicleSlice?.totalCount ?? scopedVehicles.length;
  const vehicleSliceIsCapped = scopedVehicleCount > scopedVehicles.length;

  const filteredVehicles = useMemo(() => {
    return scopedVehicles.filter(vehicle => {
      const scopeDate = vehicle.bg_date
        || vehicle.delivery_date
        || vehicle.disb_date
        || vehicle.reg_date
        || vehicle.date_received_by_outlet
        || vehicle.shipment_eta_kk_twu_sdk
        || vehicle.shipment_etd_pkg;
      return matchesDashboardPeriod(scopeDate, periodFilter);
    });
  }, [periodFilter, scopedVehicles]);

  const filteredSalesOrders = useMemo(() => {
    return salesOrders.filter(order => {
      if (branchFilter !== 'all' && order.branchCode !== branchFilter) return false;
      if (modelFilter !== 'all' && order.model !== modelFilter) return false;
      return matchesDashboardPeriod(order.bookingDate, periodFilter);
    });
  }, [branchFilter, modelFilter, periodFilter, salesOrders]);

  const scopedCustomerIds = useMemo(() => {
    if (branchFilter === 'all' && modelFilter === 'all') return null;

    return new Set(
      filteredSalesOrders
        .map(order => order.customerId)
        .filter((customerId): customerId is string => Boolean(customerId)),
    );
  }, [branchFilter, filteredSalesOrders, modelFilter]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      if (!matchesDashboardPeriod(customer.createdAt, periodFilter)) return false;
      if (!scopedCustomerIds) return true;
      return scopedCustomerIds.has(customer.id);
    });
  }, [customers, periodFilter, scopedCustomerIds]);

  const summaryKpiSummaries = dashboardSummary?.kpiSummaries ?? contextKpiSummaries;

  const filteredKpiSummaries = useMemo(() => {
    if (summaryKpiSummaries.length > 0) {
      return summaryKpiSummaries;
    }
    const slas = contextKpiSummaries.map(summary => ({
      id: summary.kpiId,
      kpiId: summary.kpiId,
      label: summary.label,
      slaDays: summary.slaDays,
      companyId: user?.company_id || '',
    }));
    return computeKpiSummaries(filteredVehicles, slas);
  }, [contextKpiSummaries, filteredVehicles, summaryKpiSummaries, user?.company_id]);

  const filteredQualityIssues = useMemo(() => dashboardSummary?.qualityIssueSample ?? [], [dashboardSummary?.qualityIssueSample]);

  const visibleKpis = filteredKpiSummaries.filter(k => selectedKpis.includes(k.kpiId));

  const periodBookings = filteredSalesOrders;
  const periodBookingAmt = filteredSalesOrders.reduce((sum, order) => sum + (order.totalPrice ?? 0), 0);
  const periodCarsOut = scopedVehicles.filter(vehicle => matchesDashboardPeriod(vehicle.delivery_date, periodFilter)).length;
  const periodNewCustomers = filteredCustomers.length;
  const summaryVehicleCount = filteredKpiSummaries.length > 0
    ? Math.max(...filteredKpiSummaries.map(s => s.validCount + s.invalidCount + s.missingCount))
    : 0;
  const totalVehicles = Math.max(summaryVehicleCount, scopedVehicleCount);
  const totalOverdue = filteredKpiSummaries.reduce((sum, summary) => sum + summary.overdueCount, 0);
  const totalIssues = dashboardSummary?.qualityIssueCount ?? filteredQualityIssues.length;
  const lastBatch = importBatches[0];
  const slaCompliance = useMemo(() => {
    if (filteredKpiSummaries.length === 0) return 0;
    const total = filteredKpiSummaries.reduce((sum, summary) => sum + summary.validCount, 0);
    const overdue = filteredKpiSummaries.reduce((sum, summary) => sum + summary.overdueCount, 0);
    return total > 0 ? Math.round(((total - overdue) / total) * 100) : 100;
  }, [filteredKpiSummaries]);

  const scopeLabel = getDashboardScopeSummary(dashboardFilter);

  // Server-side branch comparison data via auto_aging_report RPC
  const branchReportParams = useMemo(() => ({
    reportType: 'sla_compliance' as const,
    branch: branchFilter !== 'all' ? branchFilter : undefined,
    model: modelFilter !== 'all' ? modelFilter : undefined,
  }), [branchFilter, modelFilter]);

  const { data: branchReportResult } = useQuery({
    queryKey: ['exec-dashboard-branch-comparison', branchReportParams] as const,
    queryFn: async () => {
      const res = await getAutoAgingReport(branchReportParams);
      if (res.error) throw res.error;
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const branchData = useMemo(() => {
    // Prefer server-side data when available
    if (branchReportResult && branchReportResult.rows.length > 0) {
      return branchReportResult.rows.map(row => ({
        branch: String(row['Branch'] ?? ''),
        avg: Number(row['BG → Delivery Median'] ?? 0),
        count: Number(row['Vehicles'] ?? 0),
      })).sort((a, b) => b.avg - a.avg);
    }
    // Fallback while the server-side branch comparison query is loading.
    const groups = new Map<string, number[]>();
    filteredVehicles.forEach(v => {
      if (v.bg_to_delivery !== null && v.bg_to_delivery !== undefined && v.bg_to_delivery >= 0) {
        const arr = groups.get(v.branch_code) || [];
        arr.push(v.bg_to_delivery);
        groups.set(v.branch_code, arr);
      }
    });
    return Array.from(groups.entries()).map(([branch, vals]) => ({
      branch,
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      count: vals.length,
    })).sort((a, b) => b.avg - a.avg);
  }, [branchReportResult, filteredVehicles]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const snapshotCards = useMemo<DashboardCardMetric[]>(() => {
    const compactBookingAmount = periodBookingAmt > 0 ? `RM ${(periodBookingAmt / 1000).toFixed(0)}k` : undefined;
    return [
      {
        key: 'bookings',
        label: 'Bookings',
        value: periodBookings.length,
        helperText: compactBookingAmount,
        icon: ShoppingCart,
        iconClassName: 'bg-blue-500/10 text-blue-500',
        valueClassName: 'text-blue-500',
      },
      {
        key: 'cars-out',
        label: 'Cars Out',
        value: periodCarsOut,
        icon: Car,
        iconClassName: 'bg-emerald-500/10 text-emerald-500',
        valueClassName: 'text-emerald-500',
      },
      {
        key: 'new-customers',
        label: 'New Customers',
        value: periodNewCustomers,
        icon: UserPlus,
        iconClassName: 'bg-purple-500/10 text-purple-500',
        valueClassName: 'text-purple-500',
      },
      {
        key: 'vehicles-in-scope',
        label: 'Vehicles in Scope',
        value: totalVehicles,
        helperText: vehicleSliceIsCapped ? `${scopedVehicles.length.toLocaleString()} loaded for custom widgets` : undefined,
        icon: CalendarCheck,
        iconClassName: 'bg-orange-500/10 text-orange-500',
        valueClassName: 'text-orange-500',
      },
    ];
  }, [periodBookingAmt, periodBookings.length, periodCarsOut, periodNewCustomers, scopedVehicles.length, totalVehicles, vehicleSliceIsCapped]);

  const scorecards = useMemo<DashboardCardMetric[]>(() => ([
    {
      key: 'total-vehicles',
      label: 'Total Vehicles',
      value: totalVehicles,
      icon: Timer,
      iconClassName: 'text-primary',
      valueClassName: 'text-foreground',
    },
    {
      key: 'import-batches',
      label: 'Import Batches',
      value: importBatches.length,
      icon: TrendingUp,
      iconClassName: 'text-info',
      valueClassName: 'text-foreground',
    },
    {
      key: 'sla-breaches',
      label: 'SLA Breaches',
      value: totalOverdue,
      icon: AlertTriangle,
      iconClassName: 'text-warning',
      valueClassName: 'text-warning',
    },
    {
      key: 'quality-issues',
      label: 'Quality Issues',
      value: totalIssues,
      icon: CheckCircle,
      iconClassName: 'text-destructive',
      valueClassName: 'text-destructive',
    },
    {
      key: 'sla-compliance',
      label: 'SLA Compliance',
      value: `${slaCompliance}%`,
      icon: BarChart3,
      iconClassName: 'text-success',
      valueClassName: 'text-success',
    },
  ]), [importBatches.length, slaCompliance, totalIssues, totalOverdue, totalVehicles]);

  const customMetricResults = useMemo(() => {
    const context = {
      vehicles: filteredVehicles,
      salesOrders: filteredSalesOrders,
      kpiSummaries: filteredKpiSummaries,
      customers: filteredCustomers,
      qualityIssues: filteredQualityIssues,
    };

    return new Map(
      personalDashboard.widgets
        .filter((widget): widget is PersonalDashboardCustomMetric => widget.type === 'custom-metric')
        .map(widget => [widget.id, evaluateCustomInsight(widget.metricId, context)]),
    );
  }, [filteredCustomers, filteredKpiSummaries, filteredQualityIssues, filteredSalesOrders, filteredVehicles, personalDashboard.widgets]);

  const customFormulaResults = useMemo(() => {
    const context = {
      vehicles: filteredVehicles,
      salesOrders: filteredSalesOrders,
      customers: filteredCustomers,
      kpiSummaries: filteredKpiSummaries,
    };
    return new Map(
      personalDashboard.widgets
        .filter((widget): widget is PersonalDashboardCustomFormula => widget.type === 'custom-formula')
        .map(widget => [widget.id, evaluateCustomKpiFormula(widget.formula, context)]),
    );
  }, [filteredCustomers, filteredKpiSummaries, filteredSalesOrders, filteredVehicles, personalDashboard.widgets]);

  const dashboardBlocks = useMemo<DashboardRenderBlock[]>(() => {
    const activeWidgets = personalDashboard.widgets.filter(widget => widget.enabled);
    const blocks: DashboardRenderBlock[] = [];
    let customGroup: DashboardCustomWidget[] = [];

    activeWidgets.forEach(widget => {
      if (widget.type === 'custom-metric' || widget.type === 'custom-formula') {
        customGroup.push(widget);
        return;
      }

      if (customGroup.length > 0) {
        blocks.push({ kind: 'custom-group', widgets: customGroup });
        customGroup = [];
      }

      blocks.push({ kind: 'section', widgetId: widget.id });
    });

    if (customGroup.length > 0) {
      blocks.push({ kind: 'custom-group', widgets: customGroup });
    }

    return blocks;
  }, [personalDashboard.widgets]);

  const renderSystemWidget = (widgetId: DashboardSystemWidgetId) => {
    switch (widgetId) {
      case 'snapshot':
        return <DashboardSnapshotSection cards={snapshotCards} scopeLabel={scopeLabel} />;

        return <DashboardScorecards cards={scorecards} />;

      case 'kpi-analytics':
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                KPI Analytics {showAdvanced && <span className="text-xs font-normal text-muted-foreground">(Advanced View)</span>}
              </h3>
              <p className="text-[11px] text-muted-foreground">{visibleKpis.length} KPI cards active</p>
            </div>
            {visibleKpis.length > 0 ? (
              <React.Suspense
                fallback={(
                  <div className="glass-panel p-6 text-sm text-muted-foreground">
                    Loading KPI analytics...
                  </div>
                )}
              >
                <KpiDashboard
                  kpiSummaries={visibleKpis}
                  vehicles={filteredVehicles}
                  showAdvanced={showAdvanced}
                  showFilters={false}
                />
              </React.Suspense>
            ) : (
              <div className="glass-panel p-6 text-sm text-muted-foreground">
                No KPI cards are selected. Use Customize to turn the KPIs you care about back on.
              </div>
            )}
          </div>
        );

      case 'branch-comparison':
        return <DashboardBranchComparison data={branchData} />;

      default:
        return null;
    }
  };

  const renderCustomInsightGroup = (widgets: DashboardCustomWidget[]) => (
    <DashboardCustomInsights
      widgets={widgets}
      scopeLabel={scopeLabel}
      customMetricResults={customMetricResults}
      customFormulaResults={customFormulaResults}
      onRemove={removeCustomInsight}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-[280px] rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-[240px] rounded-xl" />
          <Skeleton className="h-[240px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="My Dashboard"
        description={`Welcome back, ${firstName}. Personalize the company view around the KPIs, widgets, and insights you actually use.`}
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'My Dashboard' }]}
        actions={
          <div className="flex items-center gap-3">
            <BranchPeriodFilter
              branches={availableBranches}
              branch={branchFilter}
              period={periodFilter}
              model={modelFilter}
              models={availableModels}
              onBranchChange={(value) => setDashboardFilter(prev => ({ ...prev, branch: value }))}
              onPeriodChange={(value) => setDashboardFilter(prev => ({ ...prev, period: value }))}
              onModelChange={(value) => setDashboardFilter(prev => ({ ...prev, model: value }))}
            />
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Last refresh</p>
              <p className="text-xs text-foreground">{new Date(lastRefresh).toLocaleString()}</p>
            </div>
            {lastBatch && (
              <div className="px-3 py-1.5 rounded-md bg-success/10 border border-success/20">
                <p className="text-[10px] text-success font-medium">Latest: {lastBatch.fileName}</p>
              </div>
            )}
            <ExecutiveDashboardSettings
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              disabled={!prefsLoaded}
              showAdvanced={showAdvanced}
              onToggleAdvanced={toggleAdvancedView}
              selectedKpis={selectedKpis}
              onToggleKpi={toggleKpi}
              personalDashboard={personalDashboard}
              onToggleWidget={toggleWidgetVisibility}
              onMoveWidget={moveDashboardWidget}
              onRemoveCustomInsight={removeCustomInsight}
              onRestoreDefaults={restoreDefaultDashboard}
              newInsightMetricId={newInsightMetricId}
              onChangeNewInsightMetricId={setNewInsightMetricId}
              newInsightTitle={newInsightTitle}
              onChangeNewInsightTitle={setNewInsightTitle}
              onAddCustomInsight={addCustomInsight}
              onAddCustomFormula={addCustomFormula}
            />
          </div>
        }
      />

      {dashboardBlocks.length > 0 ? (
        dashboardBlocks.map((block, index) => (
          <React.Fragment key={`${block.kind}-${index}`}>
            {block.kind === 'section'
              ? renderSystemWidget(block.widgetId)
              : renderCustomInsightGroup(block.widgets)}
          </React.Fragment>
        ))
      ) : (
        <div className="glass-panel p-10 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Your dashboard is a blank canvas</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Build your own KPI from a formula, pick a template, or turn on a core section. Everything you add stays scoped to the filters above.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setSettingsOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1.5" />Build my first KPI
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" />Customize
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
