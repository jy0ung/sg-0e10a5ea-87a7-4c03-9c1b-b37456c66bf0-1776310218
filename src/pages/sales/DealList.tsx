import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StandardTable } from '@/components/shared/StandardTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  listDeals,
  getStageLabel,
  getStageOrder,
  getResponsibleParty,
  type Deal,
  type DealStage,
} from '@/services/dealService';

const STAGES = getStageOrder();

export default function DealList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>(searchParams.get('stage') || 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;

  const loadDeals = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await listDeals({
        company_id: user.company_id,
        stage: stageFilter === 'all' ? undefined : stageFilter as DealStage,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo ? dateTo + 'T23:59:59' : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      if (error) {
        toast.error('Failed to load deals');
        return;
      }
      setDeals(data);
      // Note: total count would need a separate query or RPC
      setTotal(data.length);
    } catch {
      toast.error('Failed to load deals');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, stageFilter, search, dateFrom, dateTo, page]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const handleExport = () => {
    const headers = ['Deal No', 'Customer', 'Model', 'Stage', 'Advisor', 'Amount', 'Created'];
    const rows = deals.map(d => [
      d.deal_no,
      d.customer_name,
      `${d.model_name || ''} ${d.variant || ''}`.trim(),
      getStageLabel(d.stage),
      d.sales_advisor_name || '',
      d.total_amount?.toString() || '',
      d.created_at.split('T')[0],
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deals-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: 'deal_no',
      header: 'Deal No',
      render: (deal: Deal) => (
        <span className="font-medium">{deal.deal_no}</span>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (deal: Deal) => (
        <div>
          <p className="font-medium">{deal.customer_name}</p>
          {deal.customer_ic && (
            <p className="text-xs text-muted-foreground">{deal.customer_ic}</p>
          )}
        </div>
      ),
    },
    {
      key: 'model',
      header: 'Vehicle',
      render: (deal: Deal) => (
        <div>
          <p>{deal.model_name}</p>
          {deal.variant && (
            <p className="text-xs text-muted-foreground">{deal.variant}</p>
          )}
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (deal: Deal) => (
        <Badge variant="outline">{getStageLabel(deal.stage)}</Badge>
      ),
    },
    {
      key: 'responsible',
      header: 'Responsible',
      render: (deal: Deal) => getResponsibleParty(deal.stage),
    },
    {
      key: 'advisor',
      header: 'Advisor',
      render: (deal: Deal) => deal.sales_advisor_name || '—',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (deal: Deal) => deal.total_amount ? `RM ${deal.total_amount.toLocaleString()}` : '—',
    },
    {
      key: 'created',
      header: 'Created',
      render: (deal: Deal) => new Date(deal.created_at).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Deals"
        subtitle={`${total} deals`}
      />

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold">
              ⚙
            </div>
            <p className="text-sm font-semibold leading-tight text-foreground">Filters</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="relative flex-1 w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGES.map(stage => (
              <SelectItem key={stage} value={stage}>
                {getStageLabel(stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-9 w-36" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-9 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={loadDeals}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
        <Button size="sm" onClick={() => navigate('/sales/deals/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      </div>

        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <StandardTable
          data={deals}
          columns={columns}
          onRowClick={(deal) => navigate(`/sales/deals/${deal.id}`)}
        />
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {deals.length} of {total} deals
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={deals.length < pageSize}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
