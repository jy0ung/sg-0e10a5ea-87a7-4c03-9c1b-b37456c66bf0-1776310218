import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Search, RefreshCw, X } from 'lucide-react';

interface Vehicle {
  id: string;
  chassis_no: string | null;
  plate_no: string | null;
  model: string | null;
  engine_no: string | null;
  colour: string | null;
  status: string | null;
  branch_id: string | null;
  owner_name: string | null;
}

const CHIP_CLASS = 'inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium';

export default function ChassisFilter() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? 'c1';

  const [filters, setFilters] = useState({
    ownerName: '', vehicleType: '', chassisNo: '', plateNo: '',
    model: '', engineNo: '', colour: '',
  });
  const [results, setResults] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const activeFilters = Object.entries(filters).filter(([, v]) => v.trim());

  const handleSearch = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('vehicles')
        .select('id,chassis_no,plate_no,model,engine_no,colour,status,branch_id,owner_name')
        .eq('company_id', companyId);

      if (filters.chassisNo.trim()) q = q.ilike('chassis_no', `%${filters.chassisNo.trim()}%`);
      if (filters.plateNo.trim()) q = q.ilike('plate_no', `%${filters.plateNo.trim()}%`);
      if (filters.model.trim()) q = q.ilike('model', `%${filters.model.trim()}%`);
      if (filters.engineNo.trim()) q = q.ilike('engine_no', `%${filters.engineNo.trim()}%`);
      if (filters.colour.trim()) q = q.ilike('colour', `%${filters.colour.trim()}%`);
      if (filters.ownerName.trim()) q = q.ilike('owner_name', `%${filters.ownerName.trim()}%`);

      const { data } = await q.order('chassis_no').limit(200);
      setResults((data ?? []) as Vehicle[]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const clearFilter = (key: string) => setFilters(f => ({ ...f, [key]: '' }));
  const clearAll = () => { setFilters({ ownerName: '', vehicleType: '', chassisNo: '', plateNo: '', model: '', engineNo: '', colour: '' }); setResults([]); setSearched(false); };

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
            {results.length > 0 && (
              <tfoot className="bg-muted/50">
                <tr>
                  <td className="px-4 py-2 text-xs text-muted-foreground" colSpan={8}>
                    {results.length} vehicle{results.length !== 1 ? 's' : ''} found
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
