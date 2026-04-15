import React, { useState, useMemo } from 'react';
import { KpiSummary, VehicleCanonical, KpiDashboardFilters } from '@/types';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle2, Filter, Calendar, ChevronDown, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { format, isValid, parseISO } from 'date-fns';

interface KpiDashboardProps {
  kpiSummaries: KpiSummary[];
  vehicles: VehicleCanonical[];
  showAdvanced?: boolean;
}

export function KpiDashboard({ kpiSummaries, vehicles, showAdvanced = true }: KpiDashboardProps) {
  const [filters, setFilters] = useState<KpiDashboardFilters>({
    dateRange: { from: null, to: null },
    branches: [],
    models: [],
    paymentMethods: [],
    overdueOnly: false,
  });

  const [showFilters, setShowFilters] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<{ kpiId: string; type: string; value: number } | null>(null);

  // Extract unique filter values from vehicles
  const filterOptions = useMemo(() => {
    const branches = [...new Set(vehicles.map(v => v.branch_code))].filter(Boolean).sort();
    const models = [...new Set(vehicles.map(v => v.model))].filter(Boolean).sort();
    const paymentMethods = [...new Set(vehicles.map(v => v.payment_method))].filter(Boolean).sort();
    return { branches, models, paymentMethods };
  }, [vehicles]);

  // Filter vehicles based on selected filters
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      // Date range filter (check bg_date)
      if (filters.dateRange.from || filters.dateRange.to) {
        const bgDate = v.bg_date ? parseISO(v.bg_date) : null;
        if (!bgDate || !isValid(bgDate)) return false;
        
        if (filters.dateRange.from && bgDate < filters.dateRange.from) return false;
        if (filters.dateRange.to && bgDate > filters.dateRange.to) return false;
      }

      // Branch filter
      if (filters.branches.length > 0 && !filters.branches.includes(v.branch_code)) return false;

      // Model filter
      if (filters.models.length > 0 && !filters.models.includes(v.model)) return false;

      // Payment method filter
      if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(v.payment_method)) return false;

      return true;
    });
  }, [vehicles, filters]);

  // Get vehicles for the selected KPI segment
  const segmentVehicles = useMemo(() => {
    if (!selectedSegment) return [];

    const kpiDef = KPI_DEFINITIONS.find(k => k.id === selectedSegment.kpiId);
    if (!kpiDef) return [];

    const kpiField = kpiDef.computedField;
    const kpiSummary = kpiSummaries.find(k => k.kpiId === selectedSegment.kpiId);

    if (!kpiSummary) return [];

    return filteredVehicles.filter(v => {
      const val = v[kpiField] as number | null | undefined;
      
      if (selectedSegment.type === 'overdue') {
        return val !== null && val !== undefined && val > kpiSummary.slaDays;
      }
      if (selectedSegment.type === 'compliant') {
        return val !== null && val !== undefined && val <= kpiSummary.slaDays;
      }
      if (selectedSegment.type === 'invalid') {
        return val !== null && val !== undefined && val < 0;
      }
      if (selectedSegment.type === 'missing') {
        return val === null || val === undefined;
      }
      return false;
    });
  }, [selectedSegment, filteredVehicles, kpiSummaries]);

  // Compute filtered KPI summaries
  const filteredKpiSummaries = useMemo(() => {
    // This would need the computeKpiSummaries function
    // For now, we'll use the original summaries but note that they're not re-computed
    // In a real implementation, you'd recompute KPIs based on filteredVehicles
    return kpiSummaries;
  }, [kpiSummaries, filteredVehicles.length]);

  const toggleFilter = (type: keyof KpiDashboardFilters, value: string) => {
    setFilters(prev => {
      const currentArray = prev[type] as string[];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(v => v !== value)
        : [...currentArray, value];
      return { ...prev, [type]: newArray };
    });
  };

  const clearFilters = () => {
    setFilters({
      dateRange: { from: null, to: null },
      branches: [],
      models: [],
      paymentMethods: [],
      overdueOnly: false,
    });
  };

  const activeFilterCount = filters.branches.length + filters.models.length + filters.paymentMethods.length + 
    (filters.dateRange.from || filters.dateRange.to ? 1 : 0) + 
    (filters.overdueOnly ? 1 : 0);

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
      {/* Filters Bar */}
      <Card className="glass-panel">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear all
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? 'Hide' : 'Show'}
                <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              {/* Date Range Filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Date Range (BG Date)</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {filters.dateRange.from ? (
                          filters.dateRange.to ? (
                            <>
                              {format(filters.dateRange.from, 'MMM d, yyyy')} - {format(filters.dateRange.to, 'MMM d, yyyy')}
                            </>
                          ) : (
                            format(filters.dateRange.from, 'MMM d, yyyy')
                          )
                        ) : (
                          'Select date range'
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="range"
                        selected={filters.dateRange.from && filters.dateRange.to ? 
                          { from: filters.dateRange.from, to: filters.dateRange.to } : undefined}
                        onSelect={(range) => {
                          if (range) {
                            setFilters(prev => ({
                              ...prev,
                              dateRange: { from: range.from || null, to: range.to || null }
                            }));
                          }
                        }}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Category Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Branches</label>
                  <div className="flex flex-wrap gap-1">
                    {filterOptions.branches.slice(0, 10).map(branch => (
                      <Badge
                        key={branch}
                        variant={filters.branches.includes(branch) ? 'default' : 'outline'}
                        className="cursor-pointer hover:bg-primary/80"
                        onClick={() => toggleFilter('branches', branch)}
                      >
                        {branch}
                      </Badge>
                    ))}
                    {filterOptions.branches.length > 10 && (
                      <Badge variant="secondary">+{filterOptions.branches.length - 10} more</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Models</label>
                  <div className="flex flex-wrap gap-1">
                    {filterOptions.models.slice(0, 8).map(model => (
                      <Badge
                        key={model}
                        variant={filters.models.includes(model) ? 'default' : 'outline'}
                        className="cursor-pointer hover:bg-primary/80"
                        onClick={() => toggleFilter('models', model)}
                      >
                        {model}
                      </Badge>
                    ))}
                    {filterOptions.models.length > 8 && (
                      <Badge variant="secondary">+{filterOptions.models.length - 8} more</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Payment Methods</label>
                  <div className="flex flex-wrap gap-1">
                    {filterOptions.paymentMethods.map(method => (
                      <Badge
                        key={method}
                        variant={filters.paymentMethods.includes(method) ? 'default' : 'outline'}
                        className="cursor-pointer hover:bg-primary/80"
                        onClick={() => toggleFilter('paymentMethods', method)}
                      >
                        {method}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtered Data Summary */}
      {filteredVehicles.length !== vehicles.length && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Showing {filteredVehicles.length} of {vehicles.length} vehicles
        </div>
      )}

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
                      <tr 
                        key={kpi.kpiId} 
                        className="border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer"
                        onClick={() => setSelectedSegment({ kpiId: kpi.kpiId, type: 'overdue', value: kpi.overdueCount })}
                      >
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

      {/* Vehicle Details Modal */}
      <Dialog open={!!selectedSegment} onOpenChange={() => setSelectedSegment(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {selectedSegment && (
                <>
                  {KPI_DEFINITIONS.find(k => k.id === selectedSegment.kpiId)?.label} - {selectedSegment.type === 'overdue' ? 'Overdue' : selectedSegment.type}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            {segmentVehicles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No vehicles found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Chassis No</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Model</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Branch</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Customer</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentVehicles.map(v => {
                    const kpiDef = KPI_DEFINITIONS.find(k => k.id === selectedSegment?.kpiId);
                    const kpiField = kpiDef?.computedField;
                    const value = kpiField ? (v[kpiField as keyof VehicleCanonical] as number) : 0;
                    
                    return (
                      <tr key={v.id} className="border-b border-border/50">
                        <td className="px-3 py-2 font-medium">{v.chassis_no}</td>
                        <td className="px-3 py-2">{v.model}</td>
                        <td className="px-3 py-2">{v.branch_code}</td>
                        <td className="px-3 py-2">{v.customer_name}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-semibold ${value > (kpiDef?.slaDefault || 0) ? 'text-destructive' : 'text-success'}`}>
                            {value}d
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

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