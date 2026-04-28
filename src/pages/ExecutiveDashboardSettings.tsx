import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowDown, ArrowUp, LayoutGrid, Plus, Settings2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import {
  CUSTOM_INSIGHT_DEFINITIONS,
  DASHBOARD_SECTION_LABELS,
  type CustomInsightMetricId,
  type PersonalDashboardPreferences,
} from '@/lib/personalDashboard';
import { CustomKpiBuilder } from '@/components/CustomKpiBuilder';
import type { CustomKpiFormula } from '@/lib/customKpiFormula';

export interface ExecutiveDashboardSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  selectedKpis: string[];
  onToggleKpi: (kpiId: string) => void;
  personalDashboard: PersonalDashboardPreferences;
  onToggleWidget: (widgetId: string) => void;
  onMoveWidget: (widgetId: string, direction: 'up' | 'down') => void;
  onRemoveCustomInsight: (widgetId: string) => void;
  onRestoreDefaults: () => void;
  newInsightMetricId: CustomInsightMetricId;
  onChangeNewInsightMetricId: (id: CustomInsightMetricId) => void;
  newInsightTitle: string;
  onChangeNewInsightTitle: (title: string) => void;
  onAddCustomInsight: () => void;
  onAddCustomFormula: (title: string, formula: CustomKpiFormula) => void;
}

type SettingsTab = 'widgets' | 'add' | 'advanced';
type AddMode = 'builder' | 'template';

/**
 * Customization dialog for the Personal Dashboard. Organized into three tabs:
 *   1. Widgets  – reorder, show/hide, and remove cards already on the dashboard.
 *   2. Add KPI  – build a custom KPI from a formula OR from a ready-made template.
 *   3. Advanced – toggle advanced mode and pick legacy scorecard metrics.
 * A sticky footer exposes Restore defaults + Done so users can always exit.
 */
export function ExecutiveDashboardSettings(props: ExecutiveDashboardSettingsProps) {
  const {
    open,
    onOpenChange,
    disabled,
    showAdvanced,
    onToggleAdvanced,
    selectedKpis,
    onToggleKpi,
    personalDashboard,
    onToggleWidget,
    onMoveWidget,
    onRemoveCustomInsight,
    onRestoreDefaults,
    newInsightMetricId,
    onChangeNewInsightMetricId,
    newInsightTitle,
    onChangeNewInsightTitle,
    onAddCustomInsight,
    onAddCustomFormula,
  } = props;

  const [tab, setTab] = useState<SettingsTab>('widgets');
  const [addMode, setAddMode] = useState<AddMode>('builder');

  const enabledCount = useMemo(
    () => personalDashboard.widgets.filter(w => w.enabled).length,
    [personalDashboard.widgets],
  );
  const totalCount = personalDashboard.widgets.length;

  // After a successful add, bounce the user back to Widgets so they can see the result.
  const handleAddCustomFormula = (title: string, formula: CustomKpiFormula) => {
    onAddCustomFormula(title, formula);
    setTab('widgets');
  };

  const handleAddCustomInsight = () => {
    onAddCustomInsight();
    setTab('widgets');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Settings2 className="h-3.5 w-3.5 mr-1" />Customize
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Personal Dashboard Settings</DialogTitle>
          <DialogDescription>
            Manage the widgets on your dashboard, add new KPIs, and adjust advanced options.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="widgets">
                Widgets
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {enabledCount}/{totalCount}
                </span>
              </TabsTrigger>
              <TabsTrigger value="add">
                <Plus className="h-3.5 w-3.5 mr-1" />Add KPI
              </TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* ───────── Widgets tab ───────── */}
            <TabsContent value="widgets" className="mt-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Toggle widgets on or off and move them into the order you prefer.
                </p>
                <Button size="sm" onClick={() => setTab('add')}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add new KPI
                </Button>
              </div>

              {totalCount === 0 ? (
                <EmptyState onAdd={() => setTab('add')} />
              ) : (
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  {personalDashboard.widgets.map((widget, index) => {
                    const isCustomMetric = widget.type === 'custom-metric';
                    const isCustomFormula = widget.type === 'custom-formula';
                    const isCustom = isCustomMetric || isCustomFormula;
                    const definition = isCustomMetric
                      ? CUSTOM_INSIGHT_DEFINITIONS.find(item => item.id === widget.metricId)
                      : null;
                    const title = isCustom ? widget.title : DASHBOARD_SECTION_LABELS[widget.id].title;
                    const description = isCustomMetric
                      ? definition?.description ?? 'Custom insight'
                      : isCustomFormula
                        ? `${widget.formula.aggregation} on ${widget.formula.source}${widget.formula.filters.length > 0 ? ` • ${widget.formula.filters.length} filter${widget.formula.filters.length === 1 ? '' : 's'}` : ''}`
                        : DASHBOARD_SECTION_LABELS[widget.id].description;
                    const badge = isCustomMetric ? 'Template' : isCustomFormula ? 'My KPI' : 'Core';
                    const badgeClass = isCustomFormula
                      ? 'bg-primary/10 text-primary'
                      : isCustomMetric
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-secondary text-muted-foreground';

                    return (
                      <div
                        key={widget.id}
                        className={`flex items-start gap-3 p-3 border-b border-border/60 last:border-b-0 transition-colors ${widget.enabled ? '' : 'bg-muted/30'}`}
                      >
                        <Checkbox
                          checked={widget.enabled}
                          onCheckedChange={() => onToggleWidget(widget.id)}
                          aria-label={`${widget.enabled ? 'Hide' : 'Show'} ${title}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`text-sm font-medium ${widget.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{title}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}>
                              {badge}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={index === 0}
                            onClick={() => onMoveWidget(widget.id, 'up')}
                            aria-label={`Move ${title} up`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={index === totalCount - 1}
                            onClick={() => onMoveWidget(widget.id, 'down')}
                            aria-label={`Move ${title} down`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          {isCustom && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => onRemoveCustomInsight(widget.id)}
                              aria-label={`Remove ${title}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ───────── Add KPI tab ───────── */}
            <TabsContent value="add" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <ModeCard
                  active={addMode === 'builder'}
                  icon={<Wand2 className="h-4 w-4" />}
                  title="Build your own"
                  description="Pick a data source, filter rows, and aggregate."
                  onClick={() => setAddMode('builder')}
                />
                <ModeCard
                  active={addMode === 'template'}
                  icon={<LayoutGrid className="h-4 w-4" />}
                  title="From template"
                  description="Drop in a prebuilt branch or model insight."
                  onClick={() => setAddMode('template')}
                />
              </div>

              {addMode === 'builder' ? (
                <CustomKpiBuilder onAdd={handleAddCustomFormula} />
              ) : (
                <TemplatePicker
                  metricId={newInsightMetricId}
                  onChangeMetricId={onChangeNewInsightMetricId}
                  title={newInsightTitle}
                  onChangeTitle={onChangeNewInsightTitle}
                  onAdd={handleAddCustomInsight}
                />
              )}
            </TabsContent>

            {/* ───────── Advanced tab ───────── */}
            <TabsContent value="advanced" className="mt-0 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Advanced View</p>
                  <p className="text-xs text-muted-foreground">Show all 7 KPI metrics on the Scorecards section.</p>
                </div>
                <Button
                  variant={showAdvanced ? 'default' : 'outline'}
                  size="sm"
                  onClick={onToggleAdvanced}
                >
                  {showAdvanced ? 'Active' : 'Enable'}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scorecard Metrics</p>
                <p className="text-xs text-muted-foreground">Select which preset KPIs appear when the Scorecards section is visible.</p>
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  {KPI_DEFINITIONS.map(kpi => (
                    <label
                      key={kpi.id}
                      htmlFor={`scorecard-kpi-${kpi.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-secondary/30 cursor-pointer border-b border-border/60 last:border-b-0"
                    >
                      <Checkbox
                        id={`scorecard-kpi-${kpi.id}`}
                        checked={selectedKpis.includes(kpi.id)}
                        onCheckedChange={() => onToggleKpi(kpi.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{kpi.shortLabel}</p>
                        <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-background/80 backdrop-blur sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onRestoreDefaults}>
            Restore defaults
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-all ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/60 hover:border-border hover:bg-secondary/30'}`}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2">
        <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <p className={`text-sm font-medium ${active ? 'text-foreground' : 'text-foreground/80'}`}>{title}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
  );
}

function TemplatePicker({
  metricId,
  onChangeMetricId,
  title,
  onChangeTitle,
  onAdd,
}: {
  metricId: CustomInsightMetricId;
  onChangeMetricId: (id: CustomInsightMetricId) => void;
  title: string;
  onChangeTitle: (title: string) => void;
  onAdd: () => void;
}) {
  const selectedDefinition = CUSTOM_INSIGHT_DEFINITIONS.find(d => d.id === metricId);
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border/70 p-4 bg-secondary/20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="custom-insight-type">Metric template</Label>
          <Select value={metricId} onValueChange={(value: CustomInsightMetricId) => onChangeMetricId(value)}>
            <SelectTrigger id="custom-insight-type">
              <SelectValue placeholder="Choose a metric template" />
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_INSIGHT_DEFINITIONS.map(definition => (
                <SelectItem key={definition.id} value={definition.id}>
                  {definition.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="custom-insight-title">Card title</Label>
          <Input
            id="custom-insight-title"
            value={title}
            placeholder={selectedDefinition?.label ?? 'Custom Insight'}
            onChange={(event) => onChangeTitle(event.target.value)}
          />
        </div>
      </div>
      {selectedDefinition && (
        <p className="text-xs text-muted-foreground">{selectedDefinition.description}</p>
      )}
      <div className="flex items-center justify-end">
        <Button type="button" onClick={onAdd}>
          <Sparkles className="h-4 w-4 mr-1.5" />Add to dashboard
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 p-8 text-center space-y-3 bg-secondary/20">
      <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Your dashboard is empty</p>
        <p className="text-xs text-muted-foreground">Add your first KPI or turn on a core section to get started.</p>
      </div>
      <Button size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1" />Add your first KPI
      </Button>
    </div>
  );
}
