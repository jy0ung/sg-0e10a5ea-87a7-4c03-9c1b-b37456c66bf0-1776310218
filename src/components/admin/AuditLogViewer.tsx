import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getAllAuditLogs, AuditLogWithProfile } from '@/services/auditService';
import { History, Search, Filter, Download, ChevronRight, ChevronDown, X } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { loggingService } from '@/services/loggingService';

interface AuditLogViewerProps {
  entityId?: string;
  entityType?: 'vehicle' | 'user' | 'all';
}

export function AuditLogViewer({ entityId, entityType = 'all' }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    dateFrom: '',
    dateTo: '',
  });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAuditLogs(
        100,
        0,
        entityId ? { entityType, fromDate: undefined, toDate: undefined } : undefined
      );
      if (result.data) {
        setLogs(result.data);
      }
    } catch (error) {
      loggingService.error('Error loading audit logs', { error }, 'AuditLogViewer');
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    loadLogs();
  }, [entityId, entityType, loadLogs]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-success/10 text-success hover:bg-success/20';
      case 'update':
        return 'bg-warning/10 text-warning hover:bg-warning/20';
      case 'delete':
        return 'bg-destructive/10 text-destructive hover:bg-destructive/20';
      case 'permission_change':
        return 'bg-primary/10 text-primary hover:bg-primary/20';
      default:
        return 'bg-secondary/50 text-secondary-foreground hover:bg-secondary/70';
    }
  };

  const renderChanges = (changes: Record<string, { before: unknown; after: unknown }>) => {
    return (
      <div className="space-y-2 mt-3 pl-4 border-l-2 border-border">
        {Object.entries(changes).map(([key, value]) => (
          <div key={key} className="text-xs">
            <span className="font-medium text-foreground">{key}:</span>
            <div className="flex items-start gap-2 mt-1">
              <span className="text-destructive">before:</span>
              <span className="text-muted-foreground flex-1 break-all">{JSON.stringify(value.before)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-success">after:</span>
              <span className="text-muted-foreground flex-1 break-all">{JSON.stringify(value.after)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">Loading audit logs...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit Log
            </CardTitle>
            <CardDescription>Track all changes made to the system</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4 p-4 bg-secondary/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="User ID..."
              value={filters.userId}
              onChange={e => setFilters({ ...filters, userId: e.target.value })}
              className="h-8 w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={filters.action}
              onChange={e => setFilters({ ...filters, action: e.target.value })}
              className="h-8 rounded-md bg-background border border-border px-3 text-sm"
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="permission_change">Permission Change</option>
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFilters({ userId: '', action: '', dateFrom: '', dateTo: '' })}>
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        </div>

        {/* Audit Log Table */}
        <ScrollArea className="h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-10"></th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Entity</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No audit logs found
                  </td>
                </tr>
              )}
              {logs.map(log => {
                const isExpanded = expandedRows.has(log.id);
                return (
                  <React.Fragment key={log.id}>
                    <tr className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer" onClick={() => toggleRow(log.id)}>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-xs">{formatDate(log.created_at)}</td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium">{log.profiles?.full_name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{log.profiles?.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getActionColor(log.action)}>{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-xs">{log.entity_type}</span>
                        <span className="text-xs text-muted-foreground ml-2">{log.entity_id.slice(0, 8)}...</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {Object.keys(log.changes || {}).length} field(s) changed
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-4 py-2 bg-secondary/20">
                          {renderChanges(log.changes)}
                          {log.ip_address && (
                            <div className="text-xs text-muted-foreground mt-2">
                              IP: {log.ip_address} • User Agent: {log.user_agent?.slice(0, 50)}...
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}