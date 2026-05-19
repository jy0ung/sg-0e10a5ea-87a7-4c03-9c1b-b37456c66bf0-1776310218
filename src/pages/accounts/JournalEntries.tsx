import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { listAccountingPeriods, listJournalEntries } from '@/services/glService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { JournalEntrySourceType } from '@/types';

const SOURCE_BADGE: Record<JournalEntrySourceType, string> = {
  ar_payment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ap_payment: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  manual:     'bg-secondary text-secondary-foreground',
  adjustment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const SOURCE_LABELS: Record<JournalEntrySourceType, string> = {
  ar_payment: 'AR Payment',
  ap_payment: 'AP Payment',
  manual:     'Manual',
  adjustment: 'Adjustment',
};

const PAGE_SIZE = 50;

function fmt(n: number) {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JournalEntries() {
  const companyId = useCompanyId();

  const [periodId, setPeriodId]     = useState<string>('');
  const [search, setSearch]         = useState('');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [expandedIds, setExpanded]  = useState<Set<string>>(new Set());
  const [page, setPage]             = useState(0);

  const {
    data: periods = [],
    isLoading: periodsLoading,
  } = useQuery({
    queryKey: ['accounting_periods', companyId],
    queryFn: async () => {
      const r = await listAccountingPeriods(companyId);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Auto-select first open period
  React.useEffect(() => {
    if (!periodId && periods.length > 0) {
      const firstOpen = periods.find(p => p.status === 'open');
      setPeriodId((firstOpen ?? periods[0]).id);
    }
  }, [periods, periodId]);

  const {
    data: allEntries = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['journal_entries', companyId, periodId],
    queryFn: async () => {
      const r = await listJournalEntries(companyId, periodId || undefined);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = allEntries;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.referenceNo?.toLowerCase().includes(q) ?? false) ||
        (e.lines ?? []).some(l =>
          (l.accountCode?.toLowerCase().includes(q) ?? false) ||
          (l.accountName?.toLowerCase().includes(q) ?? false) ||
          (l.description?.toLowerCase().includes(q) ?? false),
        ),
      );
    }
    if (fromDate) result = result.filter(e => e.entryDate >= fromDate);
    if (toDate)   result = result.filter(e => e.entryDate <= toDate);

    return result;
  }, [allEntries, search, fromDate, toDate]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  if (periodsLoading) return <TableSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Journal Entries"
        description="Paginated ledger of all posted journal entries with debit/credit line detail"
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Accounts', path: '/accounts/journal' },
          { label: 'Journal Entries' },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodId} onValueChange={v => { setPeriodId(v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All periods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All periods</SelectItem>
            {periods.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-52"
          placeholder="Search description / account…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            className="w-36"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(0); }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            className="w-36"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(0); }}
          />
        </div>
        {(search || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setFromDate(''); setToDate(''); setPage(0); }}
          >
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <PageErrorState message={String(error)} />
      ) : (
        <>
          <ScrollableRegion>
            {paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <FileText className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">
                  {allEntries.length === 0
                    ? 'No journal entries for this period.'
                    : 'No entries match the current filters.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-2.5 w-8" />
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Ref</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(entry => {
                      const expanded = expandedIds.has(entry.id);
                      const lines = (entry as typeof entry & { lines?: ReturnType<typeof Array.from> }).lines ?? [];
                      return (
                        <React.Fragment key={entry.id}>
                          <tr
                            className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                            onClick={() => toggleRow(entry.id)}
                          >
                            <td className="px-4 py-3 text-muted-foreground">
                              {expanded
                                ? <ChevronDown className="h-4 w-4" />
                                : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{entry.entryDate}</td>
                            <td className="px-4 py-3 max-w-xs truncate">{entry.description}</td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[entry.sourceType]}`}>
                                {SOURCE_LABELS[entry.sourceType]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                              {entry.referenceNo ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Badge variant="outline" className="text-[10px]">
                                {Array.isArray(lines) ? lines.length : 0}
                              </Badge>
                            </td>
                          </tr>

                          {expanded && Array.isArray(lines) && lines.length > 0 && (
                            <tr className="border-b bg-muted/5">
                              <td colSpan={6} className="px-0 py-0">
                                <table className="w-full text-xs border-t border-muted/50">
                                  <thead>
                                    <tr className="bg-muted/20">
                                      <th className="pl-12 pr-4 py-2 text-left font-medium text-muted-foreground">Account</th>
                                      <th className="px-4 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Debit (RM)</th>
                                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Credit (RM)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((line: { id: string; accountCode?: string; accountName?: string; description?: string; debit: number; credit: number }) => (
                                      <tr key={line.id} className="border-t border-muted/30">
                                        <td className="pl-12 pr-4 py-2">
                                          <span className="font-mono">{line.accountCode ?? '—'}</span>
                                          {line.accountName && (
                                            <span className="ml-2 text-muted-foreground">{line.accountName}</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                                          {line.description ?? '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">
                                          {line.debit > 0 ? fmt(line.debit) : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">
                                          {line.credit > 0 ? fmt(line.credit) : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ScrollableRegion>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
                {(search || fromDate || toDate) && ` (filtered from ${allEntries.length})`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="px-2">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
