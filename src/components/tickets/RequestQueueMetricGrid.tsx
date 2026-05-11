import { AlertCircle, ClipboardList, Clock3, Inbox, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

interface RequestQueueMetrics {
  active: number;
  unassigned: number;
  slaBreached: number;
  slaAtRisk: number;
  awaitingApproval: number;
}

interface RequestQueueMetricGridProps {
  metrics: RequestQueueMetrics;
}

export function RequestQueueMetricGrid({ metrics }: RequestQueueMetricGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
          <CardDescription>Active work</CardDescription>
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xl font-semibold tabular-nums">{metrics.active}</p>
          <p className="text-xs text-muted-foreground">Open and in progress</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
          <CardDescription>Unassigned</CardDescription>
          <Inbox className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xl font-semibold tabular-nums">{metrics.unassigned}</p>
          <p className="text-xs text-muted-foreground">Needs an owner</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
          <CardDescription>SLA breached</CardDescription>
          <Clock3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xl font-semibold tabular-nums">{metrics.slaBreached}</p>
          <p className="text-xs text-muted-foreground">SLA breached</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
          <CardDescription>Due soon</CardDescription>
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xl font-semibold tabular-nums">{metrics.slaAtRisk}</p>
          <p className="text-xs text-muted-foreground">At risk in 4 hours</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pb-1 pt-3">
          <CardDescription>Approvals</CardDescription>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xl font-semibold tabular-nums">{metrics.awaitingApproval}</p>
          <p className="text-xs text-muted-foreground">Waiting for decision</p>
        </CardContent>
      </Card>
    </div>
  );
}