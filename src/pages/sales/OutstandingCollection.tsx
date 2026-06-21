import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StandardTable } from '@/components/shared/StandardTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { listDeals, getStageLabel, type Deal } from '@/services/dealService';

export default function OutstandingCollection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');

  const loadDeals = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      // Get all active deals (not completed)
      const { data, error } = await listDeals({
        company_id: user.company_id,
        stage: 'disbursement',
        limit: 100,
      });
      if (error) {
        toast.error('Failed to load outstanding deals');
        return;
      }
      setDeals(data);
    } catch {
      toast.error('Failed to load outstanding deals');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const filteredDeals = deals.filter(deal => {
    if (!search) return true;
    return (
      deal.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      deal.deal_no.toLowerCase().includes(search.toLowerCase()) ||
      deal.model_name?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalOutstanding = filteredDeals.reduce((sum, d) => sum + (d.total_amount || 0), 0);

  const handleExport = () => {
    const headers = ['Deal No', 'Customer', 'Vehicle', 'Amount', 'Days in Stage'];
    const rows = filteredDeals.map(d => {
      const days = Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
      return [d.deal_no, d.customer_name, `${d.model_name || ''} ${d.variant || ''}`.trim(), d.total_amount?.toString() || '', days.toString()];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outstanding-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: 'deal_no',
      header: 'Deal No',
      render: (deal: Deal) => <span className="font-medium">{deal.deal_no}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (deal: Deal) => (
        <div>
          <p className="font-medium">{deal.customer_name}</p>
          {deal.customer_ic && <p className="text-xs text-muted-foreground">{deal.customer_ic}</p>}
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (deal: Deal) => (
        <div>
          <p>{deal.model_name}</p>
          {deal.variant && <p className="text-xs text-muted-foreground">{deal.variant}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (deal: Deal) => deal.total_amount ? `RM ${deal.total_amount.toLocaleString()}` : '—',
    },
    {
      key: 'days',
      header: 'Days in Stage',
      render: (deal: Deal) => {
        const days = Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
        return <span className={days > 14 ? 'text-destructive font-medium' : ''}>{days} days</span>;
      },
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (deal: Deal) => <Badge variant="outline">{getStageLabel(deal.stage)}</Badge>,
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Outstanding Collection"
        subtitle={`${filteredDeals.length} deals · RM ${totalOutstanding.toLocaleString()} pending`}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Pending Disbursement</p>
          <p className="text-2xl font-bold">{filteredDeals.length}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
          <p className="text-2xl font-bold">RM {totalOutstanding.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Overdue (&gt;14 days)</p>
          <p className="text-2xl font-bold text-destructive">
            {filteredDeals.filter(d => {
              const days = Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
              return days > 14;
            }).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={loadDeals}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
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
          data={filteredDeals}
          columns={columns}
          onRowClick={(deal) => navigate(`/sales/deals/${deal.id}`)}
        />
      )}
    </div>
  );
}
