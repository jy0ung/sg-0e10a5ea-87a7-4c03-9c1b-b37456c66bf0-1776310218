import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, RefreshCw, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getPipeline,
  getStageLabel,
  getStageOrder,
  getResponsibleParty,
  type PipelineColumn,
  type Deal,
} from '@/services/dealService';

const PIPELINE_STAGES = getStageOrder().filter(s => s !== 'completed');

export default function DealPipeline() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<PipelineColumn[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  const loadPipeline = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await getPipeline(user.company_id);
      if (error) {
        toast.error('Failed to load pipeline');
        return;
      }
      setColumns(data);
    } catch {
      toast.error('Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const filteredColumns = columns.map(col => ({
    ...col,
    deals: col.deals.filter(deal => {
      const matchesSearch = !search || 
        deal.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        deal.deal_no.toLowerCase().includes(search.toLowerCase()) ||
        deal.vso_no?.toLowerCase().includes(search.toLowerCase());
      const matchesStage = stageFilter === 'all' || col.stage === stageFilter;
      return matchesSearch && matchesStage;
    }),
  })).filter(col => stageFilter === 'all' || col.stage === stageFilter);

  const totalActive = columns.reduce((sum, col) => sum + col.count, 0);
  const totalValue = columns.reduce((sum, col) => sum + col.total_value, 0);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in overflow-hidden">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((_, i) => (
            <div key={i} className="flex-shrink-0 w-60 rounded-xl border border-border bg-secondary/20 animate-pulse">
              <div className="px-3 py-2 border-b border-border">
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
              <div className="p-2 space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-20 bg-muted rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Deal Pipeline"
        subtitle={`${totalActive} active deals · RM ${totalValue.toLocaleString()}`}
      />

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
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {PIPELINE_STAGES.map(stage => (
              <SelectItem key={stage} value={stage}>
                {getStageLabel(stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadPipeline}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button size="sm" onClick={() => navigate('/sales/deals/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      </div>

      {/* Pipeline Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {filteredColumns.map(column => (
          <div
            key={column.stage}
            className="flex-shrink-0 w-60 rounded-xl border border-border bg-secondary/20"
          >
            {/* Column Header */}
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{getStageLabel(column.stage)}</h3>
                  <Badge variant="secondary" className="text-xs">{column.count}</Badge>
                </div>
                {column.total_value > 0 && (
                  <span className="text-xs text-muted-foreground">
                    RM {(column.total_value / 1000).toFixed(0)}k
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {getResponsibleParty(column.stage)}
              </p>
            </div>

            {/* Deal Cards */}
            <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
              {column.deals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No deals
                </div>
              ) : (
                column.deals.map(deal => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onClick={() => navigate(`/sales/deals/${deal.id}`)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const daysInStage = Math.floor(
    (Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{deal.customer_name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {deal.model_name} {deal.variant}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{deal.deal_no}</span>
          <span className={daysInStage > 7 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
            {daysInStage}d
          </span>
        </div>

        {deal.total_amount && (
          <div className="mt-2 text-xs font-medium">
            RM {deal.total_amount.toLocaleString()}
          </div>
        )}

        {deal.sales_advisor_name && (
          <div className="mt-1 text-xs text-muted-foreground">
            {deal.sales_advisor_name}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
