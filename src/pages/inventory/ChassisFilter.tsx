import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { searchChassisFilter, type ChassisFilterRow } from '@/services/inventoryService';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Search, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';

const FILTER_PAGE_SIZE = 100;

type Vehicle = ChassisFilterRow;

const CHIP_CLASS = 'inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium';

export default function ChassisFilter() {
  const { user } = useAuth();
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
    <div className="space-y-6">
      <PageHeader title="Chassis Filter" description="Advanced search for vehicles by chassis, plate, model, engine or colour" />

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              ['ownerName', 'Owner / Customer Name'],
              ['vehicleType', 'Vehicle Type'],
              ['chassisNo', 'Chassis No'],
              ['plateNo', 'Plate No'],
              ['model', 'Model'],
              ['engineNo', 'Engine No'],
              ['colour', 'Colour'],
            ] as [keyof typeof filters, string][]).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  placeholder={`Filter by ${label.toLowerCase()}…`}
                  value={filters[k]}
                  onChange={set(k)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
            ))}
          </div>

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {activeFilters.map(([k, v]) => (
                <span key={k} className={CHIP_CLASS}>
                  {k}: {v}
                  <button onClick={() => clearFilter(k)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {loading ? 'Searching…' : 'Search'}
            </Button>
            {(activeFilters.length > 0 || searched) && (
              <Button variant="outline" onClick={clearAll}>
                <X className="h-4 w-4 mr-2" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {searched && (
        <>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {['Chassis No', 'Plate No', 'Model', 'Engine No', 'Colour', 'Status', 'Branch', 'Owner Name'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
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
                  <tr key={v.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{v.chassis_no ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{v.plate_no ?? '—'}</td>
                    <td className="px-4 py-3">{v.model ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{v.engine_no ?? '—'}</td>
                    <td className="px-4 py-3">{v.colour ?? '—'}</td>
                    <td className="px-4 py-3">
                      {v.status ? <Badge variant={v.status === 'Available' ? 'default' : 'secondary'}>{v.status}</Badge> : '—'}
                    </td>
                    <td className="px-4 py-3">{v.branch_id ?? '—'}</td>
                    <td className="px-4 py-3">{v.owner_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {totalCount === 0
                ? 'No vehicles found'
                : `${page * FILTER_PAGE_SIZE + 1}–${Math.min((page + 1) * FILTER_PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()} vehicles`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0 || loading} onClick={() => runSearch(page - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="px-2">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1 || loading} onClick={() => runSearch(page + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
