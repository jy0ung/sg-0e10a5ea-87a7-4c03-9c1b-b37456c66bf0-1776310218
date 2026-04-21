import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { KpiDashboard } from '@/components/KpiDashboard';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarCheck, Car, CheckCircle, LayoutGrid, Loader2, Plus, Settings2, ShoppingCart, Sparkles, Timer, Trash2, TrendingUp, type LucideIcon, UserPlus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useSales } from '@/contexts/SalesContext';
import { computeKpiSummaries } from '@/utils/kpi-computation';
import { BranchPeriodFilter } from '@/components/shared/BranchPeriodFilter';
import { getDashboardScopeSummary, loadDashboardFilterState, matchesDashboardPeriod, saveDashboardFilterState } from '@/lib/dashboardFilters';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  CUSTOM_INSIGHT_DEFINITIONS,
  DASHBOARD_SECTION_LABELS,
  DEFAULT_PERSONAL_DASHBOARD,
  createCustomMetricWidget,
  evaluateCustomInsight,
  isSameDashboardPreferences,
  loadPersonalDashboardState,
  moveWidget,
  savePersonalDashboardState,
  sanitizeDashboardPreferences,
  type CustomInsightMetricId,
  type DashboardSystemWidgetId,
  type PersonalDashboardCustomMetric,
  type PersonalDashboardPreferences,
} from '@/lib/personalDashboard';

const ALL_KPI_IDS = KPI_DEFINITIONS.map(k => k.id);
const BASIC_KPIS = ['bg_to_delivery', 'bg_to_disb'];
const ADVANCED_KPIS = ALL_KPI_IDS;

interface DashboardCardMetric {
  key: string;
  label: string;
  value: string | number;
  helperText?: string;
  icon: LucideIcon;
  iconClassName: string;
  valueClassName: string;
}

type DashboardRenderBlock =
  | { kind: 'section'; widgetId: DashboardSystemWidgetId }
  | { kind: 'custom-group'; widgets: PersonalDashboardCustomMetric[] };

export default function ExecutiveDashboard() {
  const { kpiSummaries, vehicles, qualityIssues, lastRefresh, importBatches, loading } = useData();
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

  // Load preferences
  useEffect(() => {
    async function loadPrefs() {
      if (!user?.id) { setPrefsLoaded(true); return; }
      const userId = user.id;
      const localDashboard = loadPersonalDashboardState('company-overview');
      const { data } = await supabase
        .from('dashboard_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data) {
        const row = data as unknown as Record<string, unknown>;
        setSelectedKpis((row.selected_kpis as string[]) || ADVANCED_KPIS);
        setShowAdvanced(row.show_advanced_kpis as boolean ?? true);
        const remoteDashboard = sanitizeDashboardPreferences(row.personal_dashboard);
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

  const savePreferences = useCallback(async (
    kpis: string[],
    advanced: boolean,
    nextDashboard: PersonalDashboardPreferences,
  ) => {
    savePersonalDashboardState('company-overview', nextDashboard);
    if (!user?.id) return;
    const userId = user.id;
    await supabase
      .from('dashboard_preferences')
      .upsert({
        user_id: userId,
        selected_kpis: kpis,
        show_advanced_kpis: advanced,
        personal_dashboard: nextDashboard,
        updated_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, { onConflict: 'user_id' });
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

  const restoreDefaultDashboard = useCallback(() => {
    const nextDashboard = sanitizeDashboardPreferences(DEFAULT_PERSONAL_DASHBOARD);
    setPersonalDashboard(nextDashboard);
    void savePreferences(selectedKpis, showAdvanced, nextDashboard);
  }, [savePreferences, selectedKpis, showAdvanced]);

  const availableBranches = useMemo(() => {
    const branchValues = new Set<string>();
    vehicles.forEach(vehicle => {
      if (vehicle.branch_code) branchValues.add(vehicle.branch_code);
    });
    salesOrders.forEach(order => {
      if (order.branchCode) branchValues.add(order.branchCode);
    });
    return Array.from(branchValues).sort();
  }, [salesOrders, vehicles]);

  const availableModels = useMemo(() => {
    const modelValues = new Set<string>();
    vehicles.forEach(vehicle => {
      if (vehicle.model) modelValues.add(vehicle.model);
    });
    salesOrders.forEach(order => {
      if (order.model) modelValues.add(order.model);
    });
    return Array.from(modelValues).sort();
  }, [salesOrders, vehicles]);

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

  const scopedVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      if (branchFilter !== 'all' && vehicle.branch_code !== branchFilter) return false;
      if (modelFilter !== 'all' && vehicle.model !== modelFilter) return false;
      return true;
    });
  }, [branchFilter, modelFilter, vehicles]);

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

  const filteredQualityIssues = useMemo(() => {
    const chassisNumbers = new Set(filteredVehicles.map(vehicle => vehicle.chassis_no));
    return qualityIssues.filter(issue => chassisNumbers.has(issue.chassisNo));
  }, [filteredVehicles, qualityIssues]);

  const filteredKpiSummaries = useMemo(() => {
    const slas = kpiSummaries.map(summary => ({
      id: summary.kpiId,
      kpiId: summary.kpiId,
      label: summary.label,
      slaDays: summary.slaDays,
      companyId: user?.company_id || '',
    }));
    return computeKpiSummaries(filteredVehicles, slas);
  }, [filteredVehicles, kpiSummaries, user?.company_id]);

  const visibleKpis = filteredKpiSummaries.filter(k => selectedKpis.includes(k.kpiId));

  const periodBookings = filteredSalesOrders;
  const periodBookingAmt = filteredSalesOrders.reduce((sum, order) => sum + (order.totalPrice ?? 0), 0);
  const periodCarsOut = scopedVehicles.filter(vehicle => matchesDashboardPeriod(vehicle.delivery_date, periodFilter)).length;
  const periodNewCustomers = filteredCustomers.length;
  const totalVehicles = filteredVehicles.length;
  const totalOverdue = filteredKpiSummaries.reduce((sum, summary) => sum + summary.overdueCount, 0);
  const totalIssues = filteredQualityIssues.length;
  const lastBatch = importBatches[0];
  const slaCompliance = useMemo(() => {
    if (filteredKpiSummaries.length === 0) return 0;
    const total = filteredKpiSummaries.reduce((sum, summary) => sum + summary.validCount, 0);
    const overdue = filteredKpiSummaries.reduce((sum, summary) => sum + summary.overdueCount, 0);
    return total > 0 ? Math.round(((total - overdue) / total) * 100) : 100;
  }, [filteredKpiSummaries]);

  const scopeLabel = getDashboardScopeSummary(dashboardFilter);

  const branchData = useMemo(() => {
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
  }, [filteredVehicles]);

  const chartColors = [
    'hsl(var(--primary))',
    'hsl(199, 89%, 48%)',
    'hsl(142, 71%, 45%)',
    'hsl(38, 92%, 50%)',
    'hsl(280, 65%, 60%)',
    'hsl(350, 80%, 55%)',
    'hsl(175, 70%, 40%)',
  ];
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
        value: filteredVehicles.length,
        icon: CalendarCheck,
        iconClassName: 'bg-orange-500/10 text-orange-500',
        valueClassName: 'text-orange-500',
      },
    ];
  }, [filteredVehicles.length, periodBookingAmt, periodBookings.length, periodCarsOut, periodNewCustomers]);

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

  const dashboardBlocks = useMemo<DashboardRenderBlock[]>(() => {
    const activeWidgets = personalDashboard.widgets.filter(widget => widget.enabled);
    const blocks: DashboardRenderBlock[] = [];
    let customGroup: PersonalDashboardCustomMetric[] = [];

    activeWidgets.forEach(widget => {
      if (widget.type === 'custom-metric') {
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
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Operational Snapshot</p>
              <p className="text-[11px] text-muted-foreground">{scopeLabel}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {snapshotCards.map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.key} className="glass-panel p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${card.iconClassName}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className={`text-xl font-bold ${card.valueClassName}`}>{card.value}</p>
                      {card.helperText && <p className="text-[10px] text-muted-foreground">{card.helperText}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'scorecards':
        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {scorecards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.key} className="kpi-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${card.iconClassName}`} />
                    <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${card.valueClassName}`}>{card.value}</p>
                  {card.helperText && <p className="text-[11px] text-muted-foreground mt-1">{card.helperText}</p>}
                </div>
              );
            })}
          </div>
        );

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
              <KpiDashboard
                kpiSummaries={visibleKpis}
                vehicles={filteredVehicles}
                showAdvanced={showAdvanced}
                showFilters={false}
              />
            ) : (
              <div className="glass-panel p-6 text-sm text-muted-foreground">
                No KPI cards are selected. Use Customize to turn the KPIs you care about back on.
              </div>
            )}
          </div>
        );

      case 'branch-comparison':
        return (
          <div className="glass-panel p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-semibold text-foreground">Branch Comparison</h3>
                <p className="text-sm text-muted-foreground">Average BG to Delivery cycle time by branch in the current scope.</p>
              </div>
              <p className="text-[11px] text-muted-foreground">{branchData.length} branches compared</p>
            </div>
            {branchData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={branchData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="branch" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {branchData.map((_, index) => (
                      <Cell key={index} fill={chartColors[Math.min(index, chartColors.length - 1)]} />
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

      default:
        return null;
    }
  };

  const renderCustomInsightGroup = (widgets: PersonalDashboardCustomMetric[]) => (
    <div className="glass-panel p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Custom Insights</p>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mt-1">
            <Sparkles className="h-4 w-4 text-primary" />
            Personal KPI Builder
          </h3>
          <p className="text-sm text-muted-foreground">Track the signals that matter to you in the same scope as the rest of the dashboard.</p>
        </div>
        <p className="text-[11px] text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {widgets.map(widget => {
          const definition = CUSTOM_INSIGHT_DEFINITIONS.find(item => item.id === widget.metricId);
          const result = customMetricResults.get(widget.id);

          return (
            <div key={widget.id} className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${definition?.accentClassName ?? 'bg-primary/10 text-primary'}`}>
                  {definition?.label ?? 'Custom Insight'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">{widget.title}</p>
                <p className="text-3xl font-bold text-foreground">{result?.value ?? '—'}</p>
                <p className="text-sm font-medium text-foreground/80">{result?.detail ?? definition?.emptyLabel ?? 'No data'}</p>
                <p className="text-xs text-muted-foreground">{result?.helperText ?? definition?.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="My Dashboard"
        description={`Welcome back, ${firstName}. Personalize the company view around the KPIs, widgets, and insights you actually use.`}
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Company Overview' }]}
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
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!prefsLoaded}>
                  <Settings2 className="h-3.5 w-3.5 mr-1" />Customize
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Personal Dashboard Settings</DialogTitle>
                  <DialogDescription>
                    Reorder your dashboard, decide which core sections stay visible, and add your own insight cards.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">Advanced View</p>
                      <p className="text-xs text-muted-foreground">Show all 7 KPI metrics</p>
                    </div>
                    <Button
                      variant={showAdvanced ? 'default' : 'outline'}
                      size="sm"
                      onClick={toggleAdvancedView}
                    >
                      {showAdvanced ? 'Active' : 'Enable'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select KPIs to Display</p>
                    {KPI_DEFINITIONS.map(kpi => (
                      <label key={kpi.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/30 cursor-pointer">
                        <Checkbox
                          checked={selectedKpis.includes(kpi.id)}
                          onCheckedChange={() => toggleKpi(kpi.id)}
                        />
                        <div>
                          <p className="text-sm text-foreground">{kpi.shortLabel}</p>
                          <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dashboard Layout</p>
                        <p className="text-sm text-muted-foreground">Choose what appears on your dashboard and move widgets into your preferred order.</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={restoreDefaultDashboard}>
                        Restore defaults
                      </Button>
                    </div>
                    <div className="rounded-xl border border-border/60 overflow-hidden">
                      {personalDashboard.widgets.map((widget, index) => {
                        const isCustomMetric = widget.type === 'custom-metric';
                        const definition = isCustomMetric
                          ? CUSTOM_INSIGHT_DEFINITIONS.find(item => item.id === widget.metricId)
                          : null;
                        const title = isCustomMetric ? widget.title : DASHBOARD_SECTION_LABELS[widget.id].title;
                        const description = isCustomMetric
                          ? definition?.description ?? 'Custom insight'
                          : DASHBOARD_SECTION_LABELS[widget.id].description;

                        return (
                          <div key={widget.id} className="flex items-start gap-3 p-3 border-b border-border/60 last:border-b-0">
                            <Checkbox
                              checked={widget.enabled}
                              onCheckedChange={() => toggleWidgetVisibility(widget.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{title}</p>
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {isCustomMetric ? 'Custom Insight' : 'Core Section'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{description}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={index === 0}
                                onClick={() => moveDashboardWidget(widget.id, 'up')}
                              >
                                <ArrowUp className="h-4 w-4" />
                                <span className="sr-only">Move up</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={index === personalDashboard.widgets.length - 1}
                                onClick={() => moveDashboardWidget(widget.id, 'down')}
                              >
                                <ArrowDown className="h-4 w-4" />
                                <span className="sr-only">Move down</span>
                              </Button>
                              {isCustomMetric && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => removeCustomInsight(widget.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Remove widget</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3 rounded-xl border border-dashed border-border/70 p-4 bg-secondary/20">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Add Personal Insight</p>
                        <p className="text-xs text-muted-foreground">Create your own KPI-style card from the dashboard data already in scope.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="custom-insight-type">Metric template</Label>
                        <Select value={newInsightMetricId} onValueChange={(value: CustomInsightMetricId) => setNewInsightMetricId(value)}>
                          <SelectTrigger id="custom-insight-type">
                            <SelectValue placeholder="Choose a metric template" />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOM_INSIGHT_DEFINITIONS.map(definition => (
                              <SelectItem key={definition.id} value={definition.id}>
                                {definition.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custom-insight-title">Card title</Label>
                        <Input
                          id="custom-insight-title"
                          value={newInsightTitle}
                          placeholder={CUSTOM_INSIGHT_DEFINITIONS.find(definition => definition.id === newInsightMetricId)?.label ?? 'Custom Insight'}
                          onChange={(event) => setNewInsightTitle(event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {CUSTOM_INSIGHT_DEFINITIONS.find(definition => definition.id === newInsightMetricId)?.description}
                      </p>
                      <Button type="button" onClick={addCustomInsight}>
                        <Plus className="h-4 w-4 mr-1.5" />Add Insight
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
        <div className="glass-panel p-8 text-center space-y-3">
          <LayoutGrid className="h-8 w-8 text-primary mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Your dashboard is empty</h3>
            <p className="text-sm text-muted-foreground">Use Customize to turn sections back on or add a personal insight card.</p>
          </div>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1.5" />Open Customize
          </Button>
        </div>
      )}
    </div>
  );
}
