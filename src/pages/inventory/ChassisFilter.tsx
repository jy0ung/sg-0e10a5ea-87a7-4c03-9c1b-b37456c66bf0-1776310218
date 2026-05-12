import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { searchChassisFilter, type ChassisFilterRow } from '@/services/inventoryService';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Search, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';

const FILTER_PAGE_SIZE = 100;

type Vehicle = ChassisFilterRow;

const CHIP_CLASS = 'inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium';

export default function ChassisFilter() {
  const { user: _user } = useAuth();
  const companyId = useCompanyId();

  const [filters, setFilters] = useState({
    ownerName: '', vehicleType: '', chassisNo: '', plateNo: '',
    model: '', engineNo: '', colour: '',
  });
  const [results, setResults] = useState<Vehicle[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const activeFilters = Object.entries(filters).filter(([, v]) => v.trim());
  const totalPages = Math.ceil(totalCount / FILTER_PAGE_SIZE) || 1;

  const runSearch = async (p: number) => {
    setLoading(true);
    try {
      const { rows, total } = await searchChassisFilter({
        companyId: companyId ?? '',
        chassisNo: filters.chassisNo,
        plateNo: filters.plateNo,
        model: filters.model,
        engineNo: filters.engineNo,
        colour: filters.colour,
        ownerName: filters.ownerName,
        page: p,
        pageSize: FILTER_PAGE_SIZE,
      });
      setResults(rows);
      setTotalCount(total);
      setPage(p);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => runSearch(0);

  const clearFilter = (key: string) => setFilters(f => ({ ...f, [key]: '' }));
  const clearAll = () => { setFilters({ ownerName: '', vehicleType: '', chassisNo: '', plateNo: '', model: '', engineNo: '', colour: '' }); setResults([]); setSearched(false); setTotalCount(0); setPage(0); };

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement>) => setFilters(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 animate-fade-in">
      <PageHeader
        title="Chassis Filter"
        description="Advanced search for vehicles by chassis, plate, model, engine, colour, or owner"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Inventory', path: '/inventory/stock' }, { label: 'Chassis Filter' }]}
      />

      <div className="shrink-0 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Inventory Search Workbench</p>
            <p className="mt-0.5 text-sm text-foreground">Layer multiple identifiers to find the exact vehicle record quickly.</p>
          </div>
          {searched && (
            <span className="rounded-md border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {totalCount.toLocaleString()} matches
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Chassis No..."
              value={filters.chassisNo}
              onChange={set('chassisNo')}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="pl-9 h-9"
            />
          </div>
          <Input placeholder="Plate No..." value={filters.plateNo} onChange={set('plateNo')} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="h-9 w-32" />
          <Input placeholder="Model..." value={filters.model} onChange={set('model')} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="h-9 w-32" />
          <Input placeholder="Engine No..." value={filters.engineNo} onChange={set('engineNo')} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="h-9 w-32" />
          <Input placeholder="Colour..." value={filters.colour} onChange={set('colour')} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="h-9 w-28" />
          <Input placeholder="Owner Name..." value={filters.ownerName} onChange={set('ownerName')} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="h-9 w-44" />
          
          <Button onClick={handleSearch} disabled={loading} size="sm" className="h-9">
            {loading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {loading ? 'Searching…' : 'Search'}
          </Button>
          {(activeFilters.length > 0 || searched) && (
            <Button variant="ghost" onClick={clearAll} size="sm" className="h-9 text-muted-foreground hover:text-foreground">
              Clear
            </Button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map(([k, v]) => (
              <span key={k} className={CHIP_CLASS}>
                {k}: {v}
                <button type="button" aria-label={`Clear ${k} filter`} onClick={() => clearFilter(k)}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {searched && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <ScrollableRegion className="min-h-0 flex-1 overflow-auto" label="Chassis filter results table">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/90 text-muted-foreground border-b backdrop-blur">
                <tr>
                    {['Chassis No', 'Plate No', 'Model', 'Engine No', 'Colour', 'Status', 'Branch', 'Owner Name'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No vehicles matched your filters.
                    </td>
                  </tr>
                ) : results.map(v => (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold">{v.chassis_no ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{v.plate_no ?? '—'}</td>
                    <td className="px-5 py-3">{v.model ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{v.engine_no ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{v.colour ?? '—'}</td>
                    <td className="px-5 py-3">
                      {v.status ? <Badge variant={v.status === 'Available' ? 'default' : 'secondary'} className="rounded-md font-medium text-[10px] uppercase tracking-wider">{v.status}</Badge> : '—'}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{v.branch_id ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{v.owner_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>

          <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
            <span>
              {totalCount === 0
                ? 'No vehicles found'
                : `${page * FILTER_PAGE_SIZE + 1}–${Math.min((page + 1) * FILTER_PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} vehicles`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous results page" disabled={page === 0 || loading} onClick={() => runSearch(page - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="px-2">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next results page" disabled={page >= totalPages - 1 || loading} onClick={() => runSearch(page + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
