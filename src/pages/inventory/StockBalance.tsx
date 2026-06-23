import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { searchVehicles, type VehicleSearchParams } from '@/services/vehicleService';
import { Search, Package, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, string> = {
  in_stock:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  reserved:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_transit:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  delivered:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  registered:  'bg-secondary text-secondary-foreground',
};

function deriveStatus(v: { delivery_date?: string; reg_date?: string; date_received_by_outlet?: string }): string {
  if (v.delivery_date) return 'delivered';
  if (v.reg_date)      return 'registered';
  if (v.date_received_by_outlet) return 'in_stock';
  return 'in_transit';
}

export default function StockBalance() {
  const { availableBranches, loading: contextLoading } = useData();
  const navigate = useNavigate();
  const [search, setSearch]         = useState('');
  const [branchFilter, setBranch]   = useState('all');
  const [page, setPage]             = useState(0);

  // Debounced search text (300ms)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
  }, []);

  const searchParams = useMemo<VehicleSearchParams>(() => ({
    branch: branchFilter !== 'all' ? branchFilter : undefined,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sortColumn: 'bg_date',
    sortDirection: 'desc',
  }), [branchFilter, debouncedSearch, page]);

  const { data: searchResult, isLoading } = useQuery({
    queryKey: ['stock-balance-vehicles', searchParams] as const,
    queryFn: async () => {
      const res = await searchVehicles(searchParams);
      if (res.error) throw res.error;
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const vehicles = useMemo(() => searchResult?.rows ?? [], [searchResult]);
  const totalCount = searchResult?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const loading = contextLoading || isLoading;

  // Status summary counts (computed from current page)
  const statusCounts = useMemo(() => {
    const counts = { in_stock: 0, reserved: 0, in_transit: 0, delivered: 0, registered: 0 };
    vehicles.forEach(v => {
      const s = deriveStatus(v) as keyof typeof counts;
      if (s in counts) counts[s]++;
    });
    return counts;
  }, [vehicles]);

  const branches = availableBranches;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title="Stock Balance"
        description="Live vehicle inventory by chassis number and location"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Inventory', path: '/inventory/stock' }, { label: 'Stock Balance' }]}
      />

      {/* Unification banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Stock view is merging with Auto Aging</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">All stock and aging data will be consolidated into one unified view.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/auto-aging")}>
          Open Auto Aging
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.entries(statusCounts) as [string, number][]).map(([s, n]) => (
          <div key={s} className="glass-panel min-w-0 p-4">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s.replace('_', ' ')}</p>
            <p className="text-2xl font-bold text-foreground">{n}</p>
          </div>
        ))}
      </div>

      <div className="shrink-0 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Chassis, model, plate…" value={search} onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <Select value={branchFilter} onValueChange={v => { setBranch(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-40 text-sm" aria-label="Stock branch filter"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-xs font-medium text-muted-foreground ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-md border">
            <Package className="h-3.5 w-3.5" />{totalCount.toLocaleString()} vehicles
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? (
          <div className="min-h-[240px] flex-1 p-4 space-y-2 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        ) : (
          <>
            <ScrollableRegion className="min-h-0 flex-1 overflow-auto" label="Stock balance vehicle table">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground border-b backdrop-blur">
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">{getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.')}</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">{getAutoAgingFieldLabel('model', 'MODEL')}</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">Colour/Variant</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">Plate No</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">{getAutoAgingFieldLabel('branch_code', 'BRCH K1')}</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">{getAutoAgingFieldLabel('bg_date', 'BG DATE')}</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">{getAutoAgingFieldLabel('salesman_name', 'SA NAME')}</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">No vehicles match your filters</td></tr>
                  ) : (
                    vehicles.map(v => {
                      const status = deriveStatus(v);
                      return (
                        <tr key={v.id} className="border-b last:border-0 border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3">
                            <Badge className={`text-[10px] capitalize tracking-wider rounded-md font-medium ${STATUS_BADGE[status] ?? 'bg-secondary text-secondary-foreground'}`}>
                              {status.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs font-semibold">{v.chassis_no}</td>
                          <td className="px-5 py-3">{v.model}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">{v.variant ?? '—'}</td>
                          <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{v.reg_no ?? '—'}</td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{v.branch_code}</td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{v.bg_date ?? '—'}</td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{v.salesman_name ?? '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollableRegion>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex shrink-0 items-center justify-between px-5 py-3 bg-muted/20 border-t border-border/50">
                <p className="text-xs text-muted-foreground font-medium">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous stock page">
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="px-2 text-xs text-muted-foreground font-medium">Page {page + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Next stock page">
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
