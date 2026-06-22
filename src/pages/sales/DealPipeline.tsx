import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, RefreshCw, ChevronRight, GripVertical } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  getPipeline,
  advanceStage,
  getStageLabel,
  getStageOrder,
  getResponsibleParty,
  getValidTransitions,
  type PipelineColumn,
  type Deal,
  type DealStage,
} from '@/services/dealService';

const PIPELINE_STAGES = getStageOrder().filter(s => s !== 'completed');

export default function DealPipeline() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<PipelineColumn[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [branches, setBranches] = useState<Array<{id: string; code: string; name: string}>>([]);
  const [advisorFilter, setAdvisorFilter] = useState<string>('all');
  const [advisors, setAdvisors] = useState<Array<{id: string; name: string}>>([]);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [movingDeal, setMovingDeal] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const loadPipeline = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (branchFilter !== 'all') filters.branch_id = branchFilter;
      if (advisorFilter !== 'all') filters.sales_advisor_id = advisorFilter;
      const { data, error } = await getPipeline(user.company_id, filters);
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
  }, [user?.company_id, branchFilter, advisorFilter]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  useEffect(() => {
    if (!user?.company_id) return;
    import('@/services/branchService').then(({ listBranches }) => {
      listBranches(user.company_id).then((data) => {
        if (data) setBranches(data);
      });
    }).catch(() => {});
  }, [user?.company_id]);

  useEffect(() => {
    const advisorMap = new Map<string, string>();
    columns.forEach(col => {
      col.deals.forEach(deal => {
        if (deal.sales_advisor_id && deal.sales_advisor_name) {
          advisorMap.set(deal.sales_advisor_id, deal.sales_advisor_name);
        }
      });
    });
    setAdvisors(Array.from(advisorMap.entries()).map(([id, name]) => ({ id, name })));
  }, [columns]);

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

  // DnD Handlers
  const handleDragStart = (event: DragStartEvent) => {
    const dealId = event.active.id as string;
    const deal = columns.flatMap(c => c.deals).find(d => d.id === dealId);
    setActiveDeal(deal || null);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by useDroppable
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over || !user) return;

    const dealId = active.id as string;
    const targetStage = over.id as string;

    // Find the deal
    const deal = columns.flatMap(c => c.deals).find(d => d.id === dealId);
    if (!deal || deal.stage === targetStage) return;

    // Check if valid transition
    const validTargets = getValidTransitions(deal.stage as DealStage);
    if (!validTargets.includes(targetStage as DealStage)) {
      toast.error(`Cannot move from ${getStageLabel(deal.stage as DealStage)} to ${getStageLabel(targetStage as DealStage)}`);
      return;
    }

    // Optimistic update
    setMovingDeal(dealId);
    const prevColumns = [...columns];
    setColumns(prev => {
      const updated = prev.map(col => ({
        ...col,
        deals: col.deals.filter(d => d.id !== dealId),
        count: col.deals.filter(d => d.id !== dealId).length,
        total_value: col.deals.filter(d => d.id !== dealId).reduce((s, d) => s + (d.total_amount || 0), 0),
      }));
      const targetCol = updated.find(c => c.stage === targetStage);
      if (targetCol) {
        targetCol.deals.push({ ...deal, stage: targetStage as DealStage });
        targetCol.count = targetCol.deals.length;
        targetCol.total_value = targetCol.deals.reduce((s, d) => s + (d.total_amount || 0), 0);
      }
      return updated;
    });

    // API call
    const { error } = await advanceStage(dealId, targetStage as DealStage, user.id);
    if (error) {
      // Rollback
      setColumns(prevColumns);
      toast.error(error.message);
    } else {
      toast.success(`${deal.customer_name} moved to ${getStageLabel(targetStage as DealStage)}`);
    }
    setMovingDeal(null);
  };

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
        {branches.length > 0 && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(branch => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {advisors.length > 0 && (
          <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Advisors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Advisors</SelectItem>
              {advisors.map(advisor => (
                <SelectItem key={advisor.id} value={advisor.id}>
                  {advisor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={loadPipeline}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button size="sm" onClick={() => navigate('/sales/deals/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      </div>

      {/* Pipeline Kanban with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {filteredColumns.map(column => (
            <DroppableColumn
              key={column.stage}
              column={column}
              movingDeal={movingDeal}
              onDealClick={(dealId) => navigate(`/sales/deals/${dealId}`)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDeal ? <DraggableDealCard deal={activeDeal} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ============================================================
// Droppable Column
// ============================================================

function DroppableColumn({
  column,
  movingDeal,
  onDealClick,
}: {
  column: PipelineColumn;
  movingDeal: string | null;
  onDealClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-60 rounded-xl border transition-colors ${
        isOver ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20'
      }`}
    >
      {/* Column Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{getStageLabel(column.stage)}</h3>
            <Badge variant="secondary" className="text-xs">{column.deals.length}</Badge>
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
      <SortableContext items={column.deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto min-h-[100px]">
          {column.deals.length === 0 ? (
            <div className={`text-center py-8 text-sm ${isOver ? 'text-primary' : 'text-muted-foreground'}`}>
              {isOver ? 'Drop here' : 'No deals'}
            </div>
          ) : (
            column.deals.map(deal => (
              <DraggableDealCard
                key={deal.id}
                deal={deal}
                isMoving={movingDeal === deal.id}
                onClick={() => onDealClick(deal.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ============================================================
// Draggable Deal Card
// ============================================================

function DraggableDealCard({
  deal,
  isDragging,
  isMoving,
  onClick,
}: {
  deal: Deal;
  isDragging?: boolean;
  isMoving?: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });

  const daysInStage = Math.floor(
    (Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const style: React.CSSProperties = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : {};

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`transition-all ${
        isDragging ? 'opacity-90 shadow-lg rotate-2 scale-105' : ''
      } ${isMoving ? 'opacity-50' : ''} ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -m-1 rounded hover:bg-muted"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <p className="font-medium text-sm truncate">{deal.customer_name}</p>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {deal.model_name || '\u2014'} {deal.variant}
            </p>
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-muted-foreground">{deal.deal_no}</span>
              <span className={daysInStage > 7 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                {daysInStage}d
              </span>
            </div>
            {deal.total_amount && (
              <div className="mt-1 text-xs font-medium">
                RM {deal.total_amount.toLocaleString()}
              </div>
            )}
            {deal.sales_advisor_name && (
              <div className="mt-1 text-xs text-muted-foreground">
                {deal.sales_advisor_name}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
