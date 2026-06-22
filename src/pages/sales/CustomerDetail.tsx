import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StandardTable } from '@/components/shared/StandardTable';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText, Phone, Mail, CreditCard, Car, History, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { listDeals, getActivities, getStageLabel, type Deal, type DealActivity } from '@/services/dealService';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerIc, setCustomerIc] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const loadData = useCallback(async () => {
    if (!id || !user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await listDeals({
        company_id: user.company_id,
        search: '',
        limit: 500,
      });
      if (error) {
        toast.error('Failed to load deals');
        return;
      }
      const customerDeals = data.filter(d => d.customer_id === id);
      setDeals(customerDeals);
      if (customerDeals.length > 0) {
        const first = customerDeals[0];
        setCustomerName(first.customer_name);
        setCustomerIc(first.customer_ic || '');
        setCustomerPhone(first.customer_phone || '');
        setCustomerEmail(first.customer_email || '');
      }

      // Load activities for all customer deals
      const allActivities: DealActivity[] = [];
      for (const deal of customerDeals.slice(0, 10)) {
        const { data: acts } = await getActivities(deal.id);
        allActivities.push(...acts);
      }
      allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivities(allActivities.slice(0, 50));
    } catch {
      toast.error('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  }, [id, user?.company_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalValue = deals.reduce((sum, d) => sum + (d.total_amount || 0), 0);
  const activeDeals = deals.filter(d => d.stage !== 'completed').length;
  const completedDeals = deals.filter(d => d.stage === 'completed').length;

  // Vehicle history - unique models
  const vehicleHistory = Array.from(
    new Map(
      deals
        .filter(d => d.model_name)
        .map(d => [d.model_name, { model: d.model_name!, count: 0, lastPurchase: '' }])
    ).values()
  ).map(v => ({
    ...v,
    count: deals.filter(d => d.model_name === v.model).length,
    lastPurchase: deals
      .filter(d => d.model_name === v.model)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      ?.created_at || '',
  }));

  const formatAction = (action: string) => {
    const labels: Record<string, string> = {
      deal_created: 'Deal created',
      deal_updated: 'Deal updated',
      stage_changed: 'Stage changed',
      loan_updated: 'Loan updated',
      loan_status_changed: 'Loan status changed',
      insurance_updated: 'Insurance updated',
      insurance_status_changed: 'Insurance status changed',
      registration_updated: 'Registration updated',
      registration_status_changed: 'Registration status changed',
      document_uploaded: 'Document uploaded',
    };
    return labels[action] || action.replace(/_/g, ' ');
  };

  const formatMetadata = (metadata: Record<string, unknown>) => {
    if (metadata.before && metadata.after) return String(metadata.before) + ' \u2192 ' + String(metadata.after);
    if (metadata.status) return 'Status: ' + String(metadata.status);
    return '';
  };

  const dealColumns = [
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
          <p>{deal.model_name || '\u2014'}</p>
          {deal.variant && <p className="text-xs text-muted-foreground">{deal.variant}</p>}
          {deal.colour && <p className="text-xs text-muted-foreground">{deal.colour}</p>}
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
      render: (deal: Deal) => deal.total_amount ? `RM ${deal.total_amount.toLocaleString()}` : '\u2014',
    },
    {
      key: 'deposit',
      header: 'Deposit',
      render: (deal: Deal) => deal.deposit_amount ? `RM ${deal.deposit_amount.toLocaleString()}` : '\u2014',
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
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

      {/* Contact Info + Vehicle History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">IC Number</p>
                <p className="font-medium">{customerIc || '\u2014'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{customerPhone || '\u2014'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{customerEmail || '\u2014'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicle History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vehicleHistory.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No vehicle history</p>
            ) : (
              <div className="space-y-2">
                {vehicleHistory.map(v => (
                  <div key={v.model} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <p className="font-medium text-sm">{v.model}</p>
                      <p className="text-xs text-muted-foreground">
                        Last: {new Date(v.lastPurchase).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary">{v.count}x</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Deals + Activity */}
      <Tabs defaultValue="deals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="deals">Deal History ({deals.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="deals">
          <Card>
            <CardContent className="pt-6">
              {deals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No deals found for this customer</p>
                </div>
              ) : (
                <StandardTable
                  data={deals}
                  columns={dealColumns}
                  onRowClick={(deal) => navigate(`/sales/deals/${deal.id}`)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No activity recorded</p>
              ) : (
                <div className="space-y-1">
                  {activities.map(activity => {
                    const deal = deals.find(d => d.id === activity.deal_id);
                    return (
                      <div key={activity.id} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-muted/50">
                        <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{formatAction(activity.action)}</span>
                          {activity.metadata && (
                            <span className="text-sm text-muted-foreground ml-2">
                              {formatMetadata(activity.metadata)}
                            </span>
                          )}
                          {deal && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({deal.deal_no})
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {new Date(activity.created_at).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
