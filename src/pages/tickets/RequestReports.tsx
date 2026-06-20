import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { STALE } from '@/lib/queryClient';
import { PageHeader } from '@/components/shared/PageHeader';
import { HrmsEmptyState } from '@/components/shared/HrmsEmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { getRequestCategoryLabel } from '@/lib/requestCategories';
import { downloadCsv, formatTicketLabel } from '@/lib/requestFormatters';
import { formatSlaState, getTicketSlaSummary } from '@/lib/ticketSla';
import { openTicketWorkspace } from '@/lib/ticketWorkspaceNavigation';
import { getRequestManagementDashboard } from '@/services/requestManagementService';
import { listCompanyTickets, type CompanyTicketRecord } from '@/services/ticketService';

type ReportType =
  | 'sla'
  | 'owner_performance'
  | 'category_volume'
  | 'breach'
  | 'completion'
  | 'reopen'
  | 'satisfaction'
  | 'aging'
  | 'workload'
  | 'unassigned';

const REPORTS: Array<{ value: ReportType; label: string }> = [
  { value: 'sla', label: 'SLA report' },
  { value: 'owner_performance', label: 'Owner performance report' },
  { value: 'category_volume', label: 'Category volume report' },
  { value: 'breach', label: 'Breach report' },
  { value: 'completion', label: 'Completion report' },
  { value: 'reopen', label: 'Reopen report' },
  { value: 'satisfaction', label: 'Requester satisfaction report' },
  { value: 'aging', label: 'Aging report' },
  { value: 'workload', label: 'Workload report' },
  { value: 'unassigned', label: 'Unassigned request report' },
];

interface ReportRow {
  id: string;
  ticketId?: string;
  request: string;
  category: string;
  owner: string;
  requester: string;
  status: string;
  metric: string;
  detail: string;
}

function durationDays(start: string, end?: string | null) {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
}

function downloadExcel(filename: string, rows: string[][]) {
  const html = `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/[<&>]/g, '')}</td>`).join('')}</tr>`).join('')}</table>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RequestReports() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories } = useRequestCategories(user?.company_id, true);
  const [reportType, setReportType] = useState<ReportType>('sla');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['request-reports', user?.company_id, user?.id],
    queryFn: async () => {
      const [ticketsResult, dashboardResult] = await Promise.all([
        listCompanyTickets(user!.company_id),
        getRequestManagementDashboard(user!.company_id, user!.id),
      ]);
      if (ticketsResult.error) throw ticketsResult.error;
      if (dashboardResult.error) throw dashboardResult.error;
      return { tickets: ticketsResult.data ?? [], dashboard: dashboardResult.data! };
    },
    enabled: !!user?.company_id && !!user?.id,
    staleTime: STALE.transactional,
  });

  const rows = useMemo<ReportRow[]>(() => {
    const tickets = data?.tickets ?? [];
    const dashboard = data?.dashboard;
    const base = (ticket: CompanyTicketRecord, metric: string, detail: string): ReportRow => ({
      id: ticket.id,
      ticketId: ticket.id,
      request: ticket.subject,
      category: getRequestCategoryLabel(ticket.category, categories),
      owner: ticket.assigned_to_name ?? ticket.responsible_queue,
      requester: ticket.submitted_by_name ?? ticket.submitted_by_email ?? 'Unknown',
      status: formatTicketLabel(ticket.status),
      metric,
      detail,
    });

    switch (reportType) {
      case 'sla':
        return tickets.map((ticket) => {
          const sla = getTicketSlaSummary(ticket);
          return base(ticket, formatSlaState(sla.overall), `Response: ${formatSlaState(sla.response.state)}; Resolution: ${formatSlaState(sla.resolution.state)}`);
        });
      case 'owner_performance':
        return dashboard?.sla_performance_by_owner.map((owner) => ({
          id: owner.owner_id ?? 'unassigned',
          request: owner.owner_name,
          category: 'All categories',
          owner: owner.owner_name,
          requester: '',
          status: `${owner.total} requests`,
          metric: `${owner.met} met`,
          detail: `${owner.breached} breached; ${owner.at_risk} at risk`,
        })) ?? [];
      case 'category_volume':
        return dashboard?.request_volume_by_category.map((item) => ({
          id: item.category,
          request: getRequestCategoryLabel(item.category, categories),
          category: getRequestCategoryLabel(item.category, categories),
          owner: '',
          requester: '',
          status: '',
          metric: String(item.count),
          detail: 'Request volume',
        })) ?? [];
      case 'breach':
        return tickets.filter((ticket) => getTicketSlaSummary(ticket).overall === 'breached').map((ticket) => base(ticket, 'Breached', ticket.sla_breach_reason ?? 'Breach reason not captured'));
      case 'completion':
        return tickets.filter((ticket) => ticket.status === 'closed').map((ticket) => base(ticket, ticket.completion_category ?? 'Closed', ticket.resolution_note ?? 'No resolution summary'));
      case 'reopen':
        return tickets.filter((ticket) => ticket.reopen_count > 0 || ticket.status === 'reopened').map((ticket) => base(ticket, `${ticket.reopen_count} reopen${ticket.reopen_count === 1 ? '' : 's'}`, ticket.last_reopen_reason ?? 'No reopen reason'));
      case 'satisfaction':
        return tickets.filter((ticket) => ticket.satisfaction_rating).map((ticket) => base(ticket, `${ticket.satisfaction_rating}/5`, ticket.closure_feedback ?? 'No feedback comment'));
      case 'aging':
        return tickets.map((ticket) => {
          const indicator = dashboard?.indicators_by_ticket[ticket.id];
          return base(ticket, `${durationDays(ticket.created_at, ticket.closed_at ?? ticket.resolved_at)} days old`, indicator ? `${Math.round(indicator.time_in_current_status_ms / (24 * 60 * 60 * 1000))} days in current status` : '');
        });
      case 'workload':
        return dashboard?.workload_by_owner.map((owner) => ({
          id: owner.owner_id ?? 'unassigned',
          request: owner.owner_name,
          category: 'Active workload',
          owner: owner.owner_name,
          requester: '',
          status: `${owner.pending} pending`,
          metric: `${owner.breached} breached`,
          detail: `${owner.at_risk} at risk`,
        })) ?? [];
      case 'unassigned':
        return tickets.filter((ticket) => !ticket.assigned_to && ticket.status !== 'closed').map((ticket) => base(ticket, 'Unassigned', ticket.next_action));
    }
  }, [categories, data?.dashboard, data?.tickets, reportType]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(query));
  }, [rows, searchTerm]);
  const hasTicketRows = filteredRows.some((row) => row.ticketId);

  const exportRows = useMemo(
    () => [
      ['Request', 'Category', 'Owner', 'Requester', 'Status', 'Metric', 'Detail'],
      ...filteredRows.map((row) => [row.request, row.category, row.owner, row.requester, row.status, row.metric, row.detail]),
    ],
    [filteredRows],
  );

  const columns: StandardTableColumn<ReportRow>[] = [
    { key: 'request', label: 'Request', className: 'min-w-[260px]', render: (row) => <span className="font-medium text-foreground">{row.request}</span> },
    { key: 'category', label: 'Category', render: (row) => <span className="text-sm">{row.category}</span> },
    { key: 'owner', label: 'Owner', render: (row) => <span className="text-sm">{row.owner}</span> },
    { key: 'status', label: 'Status', render: (row) => <span className="text-sm">{row.status}</span> },
    { key: 'metric', label: 'Metric', render: (row) => <span className="text-sm font-medium">{row.metric}</span> },
    { key: 'detail', label: 'Detail', render: (row) => <span className="text-sm text-muted-foreground">{row.detail}</span> },
  ];

  const activeReport = REPORTS.find((report) => report.value === reportType)?.label ?? 'Request report';

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Export operational reports using the same permissions and filters as the request queue."
        breadcrumbs={[{ label: 'Internal Requests', path: '/portal' }, { label: 'Reports' }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(`${reportType}-request-report.csv`, exportRows)}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadExcel(`${reportType}-request-report.xls`, exportRows)}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              PDF / Print
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">{activeReport}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
              <SelectTrigger className="h-9 md:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORTS.map((report) => (
                  <SelectItem key={report.value} value={report.value}>{report.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Filter report rows..." className="h-9 pl-9" />
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : error ? (
            <HrmsEmptyState icon={Download} title="Unable to load report" description={(error as Error).message} />
          ) : (
            <StandardTable
              data={filteredRows}
              columns={columns}
              rowKey="id"
              hideSearch
              mobileLayout="cards"
              emptyMessage="No rows match this report."
              onRowClick={hasTicketRows
                ? (row) => {
                    if (!row.ticketId) return;
                    openTicketWorkspace(navigate, row.ticketId, {
                      source: 'reports',
                      path: '/portal/reports',
                      scrollTop: window.scrollY,
                      filters: { reportType, searchTerm },
                    });
                  }
                : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
