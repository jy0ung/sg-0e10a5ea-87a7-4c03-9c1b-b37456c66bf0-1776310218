import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/shared/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, AlertTriangle, TrendingUp, Users, Clock, DollarSign } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getDashboard, type DashboardData } from '@/services/dealService';

export default function DealDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await getDashboard(user.company_id);
      if (error) {
        toast.error('Failed to load dashboard');
        return;
      }
      setData(data);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Deal Dashboard"
        subtitle="Pipeline overview and metrics"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KpiCard
          title="Active Deals"
          value={data.active_deals}
          icon={<TrendingUp className="h-4 w-4" />}
          onClick={() => navigate('/sales/deals')}
        />
        <KpiCard
          title="New Today"
          value={data.new_today}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          title="Stuck (>7d)"
          value={data.stalled}
          icon={<AlertTriangle className="h-4 w-4" />}
          className={data.stalled > 0 ? 'border-destructive' : ''}
        />
        <KpiCard
          title="Avg Days"
          value={data.avg_days_to_close}
          icon={<Clock className="h-4 w-4" />}
          suffix="days"
        />
        <KpiCard
          title="Completed"
          value={data.completed_this_month}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          title="Revenue"
          value={`RM ${(data.revenue_this_month / 1000).toFixed(0)}k`}
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>

      {/* Action Required */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.loan_pending > 0 && (
              <div className="flex items-center justify-between p-2 rounded bg-muted">
                <span>Loan approvals pending</span>
                <Badge variant="secondary">{data.loan_pending}</Badge>
              </div>
            )}
            {data.registration_pending > 0 && (
              <div className="flex items-center justify-between p-2 rounded bg-muted">
                <span>Registration pending</span>
                <Badge variant="secondary">{data.registration_pending}</Badge>
              </div>
            )}
            {data.disbursement_pending > 0 && (
              <div className="flex items-center justify-between p-2 rounded bg-muted">
                <span>Disbursement pending</span>
                <Badge variant="secondary">{data.disbursement_pending}</Badge>
              </div>
            )}
            {data.overdue > 0 && (
              <div className="flex items-center justify-between p-2 rounded bg-destructive/10">
                <span className="text-destructive">Overdue deals</span>
                <Badge variant="destructive">{data.overdue}</Badge>
              </div>
            )}
            {data.loan_pending === 0 && data.registration_pending === 0 && data.disbursement_pending === 0 && data.overdue === 0 && (
              <p className="text-muted-foreground text-center py-4">No actions required</p>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.pipeline_funnel.map(item => (
                <div key={item.stage} className="flex items-center gap-3">
                  <span className="text-sm w-28 truncate">{item.stage}</span>
                  <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary rounded"
                      style={{
                        width: `${Math.max(5, (item.count / Math.max(1, data.active_deals)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deals by Advisor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deals by Advisor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.deals_by_advisor.map(item => (
              <div key={item.advisor} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm truncate">{item.advisor}</span>
                <Badge variant="secondary">{item.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadDashboard}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
