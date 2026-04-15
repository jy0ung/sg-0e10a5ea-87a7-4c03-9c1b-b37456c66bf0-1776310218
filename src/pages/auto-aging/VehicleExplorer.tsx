import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ExcelTable, TableColumn } from '@/components/shared/ExcelTable';
import { VehicleDetailPanel } from '@/components/vehicles/VehicleDetailPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Download, Search, Filter } from 'lucide-react';
import { updateVehicleWithAudit } from '@/services/vehicleService';
import { getUserPermissions } from '@/services/permissionService';
import type { VehicleCanonical } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export default function VehicleExplorer() {
  const { user } = useAuth();
  const { vehicles } = useData();
  const navigate = useNavigate();
  const { chassis_no: chassisParam } = useParams();

  // State
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

  // Get user permissions
  useEffect(() => {
    if (user?.id) {
      getUserPermissions(user.id).then(permissions => {
        setUserPermissions(permissions);
      });
    }
  }, [user?.id]);

  // Open detail panel if chassis_no is in URL
  useEffect(() => {
    if (chassisParam) {
      const vehicle = vehicles.find(v => v.chassis_no === chassisParam);
      if (vehicle) {
        setSelectedVehicle(vehicle);
        setDetailPanelOpen(true);
      }
    }
  }, [chassisParam, vehicles]);

  // Get filter options
  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();
  const models = [...new Set(vehicles.map(v => v.model))].sort();
  const payments = [...new Set(vehicles.map(v => v.payment_method))].sort();

  // Filter vehicles
  const filtered = vehicles.filter(v => {
    if (search && !v.chassis_no.toLowerCase().includes(search.toLowerCase()) && 
        !v.customer_name.toLowerCase().includes(search.toLowerCase()) &&
        !v.invoice_no?.toLowerCase().includes(search.toLowerCase())) return false;
    if (branchFilter !== 'all' && v.branch_code !== branchFilter) return false;
    if (modelFilter !== 'all' && v.model !== modelFilter) return false;
    if (paymentFilter !== 'all' && v.payment_method !== paymentFilter) return false;
    return true;
  });

  // Sort vehicles
  const sorted = [...filtered].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortField];
    const bVal = (b as Record<string, unknown>)[sortField];
    
    // Handle null/undefined
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageData = sorted.slice(startIdx, startIdx + pageSize);

  // Reset page when filters change
  useEffect(() => { 
    setPage(1); 
  }, [search, branchFilter, modelFilter, paymentFilter, pageSize]);

  // Define columns matching Excel layout
  const columns: TableColumn<VehicleCanonical>[] = [
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
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'etd_pkg',
      label: 'ETD (PKG)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'eta_kk',
      label: 'ETA (KK)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'eta_twu',
      label: 'ETA (TWU)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'eta_sdk',
      label: 'ETA (SDK)',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'outlet_recv_date',
      label: 'Outlet Recv',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'reg_date',
      label: 'Reg Date',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'delivery_date',
      label: 'Delivery Date',
      width: 130,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'disb_date',
      label: 'Disb Date',
      width: 120,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
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
      key: 'lou_amount',
      label: 'LOU',
      width: 100,
      sortable: true,
      type: 'number',
      format: (value) => value ? `${value}` : '',
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
      format: (value) => value ? String(value).split('T')[0] : '',
      editable: userPermissions?.canEdit || false,
    },
    {
      key: 'vaa_date',
      label: 'VAA Date',
      width: 110,
      sortable: true,
      type: 'date',
      format: (value) => value ? String(value).split('T')[0] : '',
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
      type: 'number',
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
      format: (value) => value ? 'Yes' : 'No',
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

  // Handle cell edit
  const handleCellEdit = async (rowId: string, column: string, value: unknown) => {
    if (!user?.id) return;

    const updates: Partial<VehicleCanonical> = {
      [column]: value,
    };

    const result = await updateVehicleWithAudit(rowId, updates, user.id);
    if (result.error) {
      console.error('Failed to update vehicle:', result.error);
    } else {
      // Refresh data to show updated values
      window.location.reload();
    }
  };

  // Handle row click to open detail panel
  const handleRowClick = (row: VehicleCanonical) => {
    setSelectedVehicle(row);
    setDetailPanelOpen(true);
    navigate(`/auto-aging/vehicles/${row.chassis_no}`);
  };

  // Get permissions for columns
  const permissions = userPermissions?.columns 
    ? Object.fromEntries(Array.from(userPermissions.columns.entries()).map(([col, level]) => [col, level]))
    : {};

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
          <Button variant="outline" size="sm">
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
        }
      />

      {/* Filters */}
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

      {/* Excel Table */}
      <ExcelTable<VehicleCanonical>
        data={pageData}
        columns={columns}
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
        onEdit={userPermissions?.canEdit ? handleCellEdit : undefined}
        onRowClick={handleRowClick}
        permissions={permissions}
      />

      {/* Vehicle Detail Panel */}
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
            console.error('Failed to update vehicle:', result.error);
          } else {
            window.location.reload();
          }
        } : undefined}
      />
    </div>
  );
}