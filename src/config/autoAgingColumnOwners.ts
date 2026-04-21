/**
 * Column-owner presets for the Auto-Aging (new Excel template) workflow.
 *
 * The new template groups its columns under five business owners. Assigning a
 * vehicle column to an owner lets the `column_permissions` table grant the
 * right "edit" level to the right role without bespoke seeding scripts.
 *
 * This file is the single source of truth. The Mapping Admin "Column Owners"
 * tab renders these presets and writes them into `column_permissions` when
 * the admin clicks "Apply preset".
 */

import type { VehicleCanonical } from '@/types';

export type AutoAgingColumnOwner =
  | 'stock_in'
  | 'deposit_payment'
  | 'full_payment'
  | 'outlet_admin'
  | 'sales_manager';

export interface AutoAgingColumnOwnerDefinition {
  owner: AutoAgingColumnOwner;
  label: string;
  description: string;
  columns: (keyof VehicleCanonical)[];
}

/**
 * Ordered list of owners + the vehicle fields they are responsible for.
 *
 * Order matches how the categories appear on the "auto aging (CHASSIS)"
 * workbook so the UI feels familiar to existing users.
 */
export const AUTO_AGING_COLUMN_OWNERS: AutoAgingColumnOwnerDefinition[] = [
  {
    owner: 'stock_in',
    label: 'Stock In',
    description: 'Physical receipt of the unit at the outlet.',
    columns: [
      'branch_code',
      'vaa_date',
      'model',
      'variant',
      'color',
      'chassis_no',
      'dealer_transfer_price',
    ],
  },
  {
    owner: 'deposit_payment',
    label: 'Deposit Payment',
    description: 'Customer deposit / booking milestone.',
    columns: ['payment_method', 'bg_date'],
  },
  {
    owner: 'full_payment',
    label: 'Full Payment',
    description: 'Cash settlement details (non-loan cases).',
    columns: ['full_payment_type', 'full_payment_date'],
  },
  {
    owner: 'outlet_admin',
    label: 'Outlet Admin',
    description:
      'Shipment receipt, registration, invoicing, delivery, disbursement and commission payout.',
    columns: [
      'shipment_name',
      'shipment_etd_pkg',
      'shipment_eta_kk_twu_sdk',
      'date_received_by_outlet',
      'contra_sola',
      'reg_no',
      'reg_date',
      'invoice_no',
      'obr',
      'delivery_date',
      'disb_date',
      'remark',
      'commission_paid',
      'commission_remark',
    ],
  },
  {
    owner: 'sales_manager',
    label: 'Sales Manager',
    description: 'Customer-facing contracting details.',
    columns: ['salesman_name', 'customer_name', 'lou'],
  },
];

/** Reverse lookup: column -> owner. Useful for badges on the explorer. */
export const AUTO_AGING_COLUMN_TO_OWNER: Record<string, AutoAgingColumnOwner> =
  AUTO_AGING_COLUMN_OWNERS.reduce(
    (acc, def) => {
      def.columns.forEach(col => {
        acc[col as string] = def.owner;
      });
      return acc;
    },
    {} as Record<string, AutoAgingColumnOwner>,
  );
