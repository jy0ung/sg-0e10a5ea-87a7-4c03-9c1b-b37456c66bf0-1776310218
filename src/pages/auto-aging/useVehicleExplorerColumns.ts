import { useMemo } from 'react';
import type { TableColumn } from '@/components/shared/ExcelTable';
import type { VehicleCanonical } from '@/types';
import { formatAccounting } from '@/lib/utils';

export type VehicleRow = VehicleCanonical & {
  row_no?: number;
  etd_pkg?: string | null;
  eta_kk?: string | null;
  eta_twu?: string | null;
  eta_sdk?: string | null;
  outlet_recv_date?: string | null;
};

interface UseVehicleExplorerColumnsArgs {
  canEdit: boolean;
  branches: readonly string[];
  models: readonly string[];
  payments: readonly string[];
  startIdx: number;
}

function formatDate(value: unknown): string {
  if (!value) return '';
  const str = String(value);
  if (str.includes('T')) return str.split('T')[0];
  return str;
}

/**
 * Phase 3 #19: extracted column definitions for VehicleExplorer so that the
 * parent page is ~250 lines lighter and columns are memoized against their
 * real dependencies (permissions + option lists).
 */
export function useVehicleExplorerColumns({
  canEdit,
  branches,
  models,
  payments,
  startIdx,
}: UseVehicleExplorerColumnsArgs): TableColumn<VehicleRow>[] {
  return useMemo<TableColumn<VehicleRow>[]>(() => [
    {
      key: 'row_no',
      label: 'NO.',
      width: 80,
      sortable: false,
      format: (_value, index) => String(startIdx + index + 1),
    },
    { key: 'chassis_no', label: 'CHASSIS NO.', width: 140, sortable: true, type: 'text', editable: canEdit },
    { key: 'branch_code', label: 'BRCH', width: 90, sortable: true, type: 'select', options: branches as string[], editable: canEdit },
    { key: 'model', label: 'MODEL', width: 120, sortable: true, type: 'select', options: models as string[], editable: canEdit },
    { key: 'variant', label: 'VAR', width: 110, sortable: true, type: 'text', editable: canEdit },
    { key: 'color', label: 'COLOR', width: 110, sortable: true, type: 'text', editable: canEdit },
    { key: 'customer_name', label: 'CUST NAME', width: 180, sortable: true, type: 'text', editable: canEdit },
    { key: 'salesman_name', label: 'SA NAME', width: 150, sortable: true, type: 'text', editable: canEdit },
    { key: 'bg_date', label: 'BG DATE', width: 120, sortable: true, type: 'date', format: formatDate, editable: canEdit },
    {
      key: 'shipment_etd_pkg',
      label: 'SHIPMENT ETD PKG',
      width: 150,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: canEdit,
    },
    {
      key: 'shipment_eta_kk_twu_sdk',
      label: 'SHIPMENT ETA KK/TWU/SDK',
      width: 200,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: canEdit,
    },
    {
      key: 'date_received_by_outlet',
      label: 'DATE RECEIVED BY OUTLET',
      width: 200,
      sortable: true,
      type: 'date',
      format: formatDate,
      editable: canEdit,
    },
    { key: 'reg_date', label: 'REG DATE', width: 120, sortable: true, type: 'date', format: formatDate, editable: canEdit },
    { key: 'reg_no', label: 'REG NO.', width: 120, sortable: true, type: 'text', editable: canEdit },
    { key: 'delivery_date', label: 'DELIVERY DATE', width: 140, sortable: true, type: 'date', format: formatDate, editable: canEdit },
    { key: 'disb_date', label: 'DISB. DATE', width: 120, sortable: true, type: 'date', format: formatDate, editable: canEdit },
    { key: 'payment_method', label: 'PAYMENT METHOD', width: 150, sortable: true, type: 'select', options: payments as string[], editable: canEdit },
    { key: 'full_payment_type', label: 'FULL PAYMENT TYPE', width: 160, sortable: true, type: 'text', editable: canEdit },
    { key: 'full_payment_date', label: 'FULL PAYMENT DATE', width: 160, sortable: true, type: 'date', format: formatDate, editable: canEdit },
    { key: 'vaa_date', label: 'VAA DATE', width: 120, sortable: true, type: 'date', format: formatDate, editable: canEdit },
    { key: 'invoice_no', label: 'INV NO.', width: 140, sortable: true, type: 'text', editable: canEdit },
    { key: 'obr', label: 'OBR', width: 100, sortable: true, type: 'text', editable: canEdit },
    {
      key: 'dealer_transfer_price',
      label: 'DTP (DEALER TRANSFER PRICE)',
      width: 200,
      sortable: true,
      type: 'number',
      editable: canEdit,
      format: (v) => formatAccounting(v),
    },
    { key: 'shipment_name', label: 'SHIPMENT NAME', width: 160, sortable: true, type: 'text', editable: canEdit },
    { key: 'lou', label: 'LOU', width: 100, sortable: true, type: 'text', editable: canEdit },
    { key: 'contra_sola', label: 'CONTRA SOLA', width: 120, sortable: true, type: 'text', editable: canEdit },
    {
      key: 'is_d2d',
      label: 'D2D',
      width: 80,
      sortable: true,
      editable: false,
      format: (value) => (value ? 'Yes' : 'No'),
    },
    {
      key: 'commission_paid',
      label: 'COMM PAYOUT',
      width: 140,
      sortable: true,
      type: 'select',
      options: ['Paid', 'Not Paid'],
      editable: canEdit,
      format: (value) => {
        if (value === true) return 'Paid';
        if (value === false) return 'Not Paid';
        return '';
      },
      onSave: (_rowId, value) => ({ commission_paid: value === 'Paid' }),
    },
    { key: 'commission_remark', label: 'COMM REMARK', width: 180, sortable: true, type: 'text', editable: canEdit },
    { key: 'remark', label: 'REMARK', width: 200, sortable: true, type: 'textarea', editable: canEdit },
  ], [canEdit, branches, models, payments, startIdx]);
}
