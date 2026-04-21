import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ExcelTable, TableColumn } from '@/components/shared/ExcelTable';
import { VehicleDetailPanel } from '@/components/vehicles/VehicleDetailPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Download, Search, Filter, Edit, Eye, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { updateVehicleWithAudit } from '@/services/vehicleService';
import { getUserPermissions } from '@/services/permissionService';
import type { VehicleCanonical } from '@/types';
import { Input } from '@/components/ui/input';
import { loggingService } from '@/services/loggingService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VehicleBulkActions } from './VehicleBulkActions';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

type VehicleRow = VehicleCanonical & {
  row_no?: number;
  etd_pkg?: string | null;
  eta_kk?: string | null;
  eta_twu?: string | null;
  eta_sdk?: string | null;
  outlet_recv_date?: string | null;
};

export default function VehicleExplorer() {
  const { user } = useAuth();
  const { vehicles, loading, loadErrors, reloadFromDb } = useData();
  const navigate = useNavigate();
  const { chassis_no: chassisParam } = useParams();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortField, setSortField] = useState<string>('chassis_no');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleCanonical | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<ReturnType<typeof getUserPermissions extends Promise<infer T> ? T : never>>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<{ action: string; vehicles: VehicleCanonical[] } | null>(null);

  useEffect(() => {
    if (user?.id) {
      getUserPermissions(user.id).then(permissions => {
        setUserPermissions(permissions);
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (chassisParam) {
      const vehicle = vehicles.find(v => v.chassis_no === chassisParam);
      if (vehicle) {
        setSelectedVehicle(vehicle);
        setDetailPanelOpen(true);
      }
    }
  }, [chassisParam, vehicles]);

  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();
  const models = [...new Set(vehicles.map(v => v.model))].sort();
  const payments = [...new Set(vehicles.map(v => v.payment_method))].sort();

  const filtered = vehicles.filter(v => {
    if (search && !v.chassis_no.toLowerCase().includes(search.toLowerCase()) && 
        !v.customer_name.toLowerCase().includes(search.toLowerCase()) &&
        !v.invoice_no?.toLowerCase().includes(search.toLowerCase())) return false;
    if (branchFilter !== 'all' && v.branch_code !== branchFilter) return false;
    if (modelFilter !== 'all' && v.model !== modelFilter) return false;
    if (paymentFilter !== 'all' && v.payment_method !== paymentFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: unknown;
    let bVal: unknown;

    const rowA = a as VehicleRow;
    const rowB = b as VehicleRow;

    switch (sortField) {
      case 'row_no':
        aVal = (filtered.indexOf(a) + 1);
        bVal = (filtered.indexOf(b) + 1);
        break;
      case 'etd_pkg':
        aVal = rowA.shipment_etd_pkg;
        bVal = rowB.shipment_etd_pkg;
        break;
      case 'eta_kk':
        aVal = rowA.shipment_eta_kk_twu_sdk;
        bVal = rowB.shipment_eta_kk_twu_sdk;
        break;
      case 'eta_twu':
        aVal = rowA.shipment_eta_kk_twu_sdk;
        bVal = rowB.shipment_eta_kk_twu_sdk;
        break;
      case 'eta_sdk':
        aVal = rowA.shipment_eta_kk_twu_sdk;
        bVal = rowB.shipment_eta_kk_twu_sdk;
        break;
      case 'outlet_recv_date':
        aVal = rowA.date_received_by_outlet;
        bVal = rowB.date_received_by_outlet;
        break;
      default:
        aVal = (a as Record<string, unknown>)[sortField];
        bVal = (b as Record<string, unknown>)[sortField];
    }
    
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'desc' 
        ? bVal.localeCompare(aVal) 
        : aVal.localeCompare(bVal);
    }
    
    return sortDir === 'desc' 
      ? (bVal as number) - (aVal as number) 
      : (aVal as number) - (bVal as number);
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageData = sorted.slice(startIdx, startIdx + pageSize);

  useEffect(() => { 
    setPage(1); 
  }, [search, branchFilter, modelFilter, paymentFilter, pageSize]);

  const formatDate = (value: unknown): string => {
    if (!value) return '';
    const strValue = String(value);
    if (strValue.includes('T')) {
      return strValue.split('T')[0];
    }
    return strValue;
  };

  const columns: TableColumn<VehicleRow>[] = [
    {
      key: 'row_no',
      label: 'Row No',
      width: 80,
      sortable: false,
      format: (_value, index) => String(startIdx + index + 1),
    },
    {
      key: 'chassis_no',
      label: 'Chassis No',
      width: 120,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'branch_code',
      label: 'Branch',
      width: 100,
      sortable: true,
      type: 'select',
      options: branches,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'model',
      label: 'Model',
      width: 120,
      sortable: true,
      type: 'select',
      options: models,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'variant',
      label: 'Variant',
      width: 120,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'customer_name',
      label: 'Customer',
      width: 180,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'salesman_name',
      label: 'Salesman',
      width: 150,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'bg_date',
      label: 'BG Date',
      width: 120,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'etd_pkg',
      label: 'ETD (PKG)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (v) => formatDate((v as VehicleRow).shipment_etd_pkg),
      editable: userPermissions?.canEdit || false,
      onSave: (rowId, value) => ({ shipment_etd_pkg: value }),
    },
    {
      key: 'eta_kk',
      label: 'ETA (KK)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (v) => formatDate((v as VehicleRow).shipment_eta_kk_twu_sdk),
      editable: userPermissions?.canEdit || false,
      onSave: (rowId, value) => ({ shipment_eta_kk_twu_sdk: value }),
    },
    {
      key: 'eta_twu',
      label: 'ETA (TWU)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (v) => formatDate((v as VehicleRow).shipment_eta_kk_twu_sdk),
      editable: userPermissions?.canEdit || false,
      onSave: (rowId, value) => ({ shipment_eta_kk_twu_sdk: value }),
    },
    {
      key: 'eta_sdk',
      label: 'ETA (SDK)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (v) => formatDate((v as VehicleRow).shipment_eta_kk_twu_sdk),
      editable: userPermissions?.canEdit || false,
      onSave: (rowId, value) => ({ shipment_eta_kk_twu_sdk: value }),
    },
    {
      key: 'outlet_recv_date',
      label: 'Outlet Recv',
      width: 120,
      sortable: true,
      type: 'date',
      format: (v) => formatDate((v as VehicleRow).date_received_by_outlet),
      editable: userPermissions?.canEdit || false,
      onSave: (rowId, value) => ({ date_received_by_outlet: value }),
    },
    {
      key: 'reg_date',
      label: 'Reg Date',
      width: 120,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'delivery_date',
      label: 'Delivery Date',
      width: 130,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'disb_date',
      label: 'Disb Date',
      width: 120,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'payment_method',
      label: 'Payment Method',
      width: 130,
      sortable: true,
      type: 'select',
      options: payments,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'lou',
      label: 'LOU',
      width: 100,
      sortable: true,
      type: 'text',
      format: (v) => (v as VehicleRow).lou || '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'contra_sola',
      label: 'Contra/Sola',
      width: 110,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'full_payment_date',
      label: 'Full Payment Date',
      width: 150,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'vaa_date',
      label: 'VAA Date',
      width: 110,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'reg_no',
      label: 'Reg No',
      width: 120,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'invoice_no',
      label: 'Invoice No',
      width: 140,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'obr',
      label: 'OBR',
      width: 100,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'dealer_transfer_price',
      label: 'Dealer Transfer Price',
      width: 160,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'full_payment_type',
      label: 'Full Payment Type',
      width: 160,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'shipment_name',
      label: 'Shipment Name',
      width: 150,
      sortable: true,
      type: 'text',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'd2d',
      label: 'D2D',
      width: 80,
      sortable: true,
      editable: false,
      format: (value) => (value as VehicleRow).is_d2d ? 'Yes' : 'No',
    },
    {
      key: 'remark',
      label: 'Remark',
      width: 200,
      sortable: true,
      type: 'textarea',
      editable: userPermissions?.canEdit || false,
    },
  ];

  const handleCellEdit = async (rowId: string, column: TableColumn<VehicleRow>, value: unknown) => {
    if (!user?.id) return;

    let updates: Partial<VehicleCanonical> = {};

    if (column.onSave) {
      updates = column.onSave(rowId, value);
    } else {
      updates = { [column.key]: value };
    }

    const result = await updateVehicleWithAudit(rowId, updates, user.id);
    if (result.error) {
      loggingService.error('Failed to update vehicle', { error: result.error }, 'VehicleExplorer');
    } else {
      await reloadFromDb();
    }
  };

  const handleExportCSV = () => {
    if (!userPermissions?.canEdit && !userPermissions?.canView) {
      loggingService.warn('No permission to export', {}, 'VehicleExplorer');
      return;
    }

    setExportLoading(true);

    try {
      const headers = columns.map(c => c.label).join(',');
      const rows = sorted.map(vehicle => {
        const rowA = vehicle as VehicleRow;
        return columns.map(col => {
          const value = col.format 
            ? col.format((vehicle as Record<string, unknown>)[col.key], sorted.indexOf(vehicle))
            : (vehicle as Record<string, unknown>)[col.key] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',');
      }).join('\n');

      const csv = `${headers}\n${rows}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vehicles_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      loggingService.error('Export failed', { error }, 'VehicleExplorer');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRowClick = (row: VehicleRow) => {
    setSelectedVehicle(row);
    setDetailPanelOpen(true);
    navigate(`/auto-aging/vehicles/${row.chassis_no}`);
  };

  const handleBulkAction = async (action: string, selectedVehicles: VehicleCanonical[]) => {
    setPendingBulkAction({ action, vehicles: selectedVehicles });
  };

  const handleBulkActionComplete = async () => {
    if (pendingBulkAction) {
      await reloadFromDb();
    }
    setPendingBulkAction(null);
  };

  const permissions = userPermissions?.columns 
    ? Object.fromEntries(Array.from(userPermissions.columns.entries()).map(([col, level]) => [col, level]))
    : {};

  const filteredColumns = columns.filter(col => {
    const perm = permissions[col.key];
    return perm === 'edit' || perm === 'view' || (!permissions || userPermissions?.role === 'super_admin');
  });

  if (loading && vehicles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (loadErrors.length > 0 && vehicles.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader
          title="Vehicle Explorer"
          description="Vehicle inventory and milestone details"
          breadcrumbs={[
            { label: 'FLC BI' },
            { label: 'Auto Aging' },
            { label: 'Vehicle Explorer' }
          ]}
        />
        <div className="glass-panel p-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Vehicles</h3>
          <p className="text-sm text-muted-foreground mb-6">
            The explorer could not load {loadErrors.join(', ')}. Retry the query, and sign out then sign back in if the problem persists.
          </p>
          <Button onClick={() => void reloadFromDb()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />Retry Load
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Vehicle Explorer"
        description={`${filtered.length} of ${vehicles.length} vehicles`}
        breadcrumbs={[
          { label: 'FLC BI' }, 
          { label: 'Auto Aging' }, 
          { label: 'Vehicle Explorer' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            {userPermissions?.canEdit && (
              <Button
                variant={readOnlyMode ? "outline" : "default"}
                size="sm"
                onClick={() => setReadOnlyMode(!readOnlyMode)}
              >
                {readOnlyMode ? <Edit className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {readOnlyMode ? 'Edit' : 'Read Only'}
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportCSV}
              disabled={exportLoading}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        }
      />

      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search chassis, customer, invoice..." 
            className="h-8 w-64 rounded-md bg-secondary border border-border pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" 
          />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={modelFilter} onValueChange={setModelFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All Payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            {payments.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(s => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ExcelTable<VehicleRow>
        data={pageData as VehicleRow[]}
        columns={filteredColumns}
        sort={{ key: sortField, direction: sortDir }}
        onSort={(key) => {
          if (sortField === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
          } else {
            setSortField(key);
            setSortDir('desc');
          }
        }}
        pagination={{
          page: currentPage,
          pageSize,
          totalPages,
          total: filtered.length,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
        onEdit={userPermissions?.canEdit && !readOnlyMode ? handleCellEdit : undefined}
        onRowClick={handleRowClick}
        permissions={permissions}
        readOnlyMode={readOnlyMode}
        onBulkAction={userPermissions?.canEdit && !readOnlyMode ? handleBulkAction : undefined}
      />

      {pendingBulkAction && (
        <VehicleBulkActions
          selectedVehicles={pendingBulkAction.vehicles}
          action={pendingBulkAction.action}
          onComplete={handleBulkActionComplete}
        />
      )}

      <VehicleDetailPanel
        vehicle={selectedVehicle}
        open={detailPanelOpen}
        onClose={() => {
          setDetailPanelOpen(false);
          setSelectedVehicle(null);
          navigate('/auto-aging/vehicles');
        }}
        canEdit={userPermissions?.canEdit || false}
        onEdit={userPermissions?.canEdit ? async (id, updates) => {
          if (!user?.id) return;
          const result = await updateVehicleWithAudit(id, updates, user.id);
          if (result.error) {
            loggingService.error('Failed to update vehicle', { error: result.error }, 'VehicleExplorer');
          } else {
            await reloadFromDb();
          }
        } : undefined}
      />
    </div>
  );
}