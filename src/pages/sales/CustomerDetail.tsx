import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StandardTable } from '@/components/shared/StandardTable';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { listDeals, getStageLabel, type Deal } from '@/services/dealService';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [customerName, setCustomerName] = useState('');

  const loadDeals = useCallback(async () => {
    if (!id || !user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await listDeals({
        company_id: user.company_id,
        search: '', // We'll filter by customer_id
        limit: 100,
      });
      if (error) {
        toast.error('Failed to load deals');
        return;
      }
      // Filter by customer_id
      const customerDeals = data.filter(d => d.customer_id === id);
      setDeals(customerDeals);
      if (customerDeals.length > 0) {
        setCustomerName(customerDeals[0].customer_name);
      }
    } catch {
      toast.error('Failed to load deals');
    } finally {
      setLoading(false);
    }
  }, [id, user?.company_id]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const totalValue = deals.reduce((sum, d) => sum + (d.total_amount || 0), 0);
  const activeDeals = deals.filter(d => d.stage !== 'completed').length;
  const completedDeals = deals.filter(d => d.stage === 'completed').length;

  const columns = [
    {
      key: 'deal_no',
      header: 'Deal No',
      render: (deal: Deal) => <span className="font-medium">{deal.deal_no}</span>,
    },
    {
      key: 'model',
      header: 'Vehicle',
      render: (deal: Deal) => (
        <div>
          <p>{deal.model_name}</p>
          {deal.variant && <p className="text-xs text-muted-foreground">{deal.variant}</p>}
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (deal: Deal) => <Badge variant="outline">{getStageLabel(deal.stage)}</Badge>,
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

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sales/customers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={customerName || 'Customer'} subtitle={`${deals.length} deals`} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Deals</p>
            <p className="text-2xl font-bold">{deals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold">{activeDeals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold">{completedDeals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">RM {totalValue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Deals Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deal History</CardTitle>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No deals found for this customer</p>
            </div>
          ) : (
            <StandardTable
              data={deals}
              columns={columns}
              onRowClick={(deal) => navigate(`/sales/deals/${deal.id}`)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
