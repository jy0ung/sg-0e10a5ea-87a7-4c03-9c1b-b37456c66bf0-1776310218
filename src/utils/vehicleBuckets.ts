import type { VehicleCanonical } from '@/types';

/**
 * Phase 3 #19: derived bucket classifier.
 *
 * Classifies a vehicle into an ageing bucket based on its most recent
 * milestone (BG → ETD → ETA → outlet receive → registration → delivery →
 * disbursement). Consumers use this for KPI colouring and bucket filters on
 * the VehicleExplorer without duplicating the logic.
 */
export type AgeingBucket =
  | 'delivered'
  | 'disbursed'
  | 'registered'
  | 'at_outlet'
  | 'en_route'
  | 'awaiting_shipment'
  | 'bg_only'
  | 'unknown';

export function classifyVehicleBucket(v: Pick<
  VehicleCanonical,
  | 'bg_date'
  | 'shipment_etd_pkg'
  | 'shipment_eta_kk_twu_sdk'
  | 'date_received_by_outlet'
  | 'reg_date'
  | 'delivery_date'
  | 'disb_date'
>): AgeingBucket {
  if (v.disb_date) return 'disbursed';
  if (v.delivery_date) return 'delivered';
  if (v.reg_date) return 'registered';
  if (v.date_received_by_outlet) return 'at_outlet';
  if (v.shipment_eta_kk_twu_sdk) return 'en_route';
  if (v.shipment_etd_pkg) return 'awaiting_shipment';
  if (v.bg_date) return 'bg_only';
  return 'unknown';
}

export const BUCKET_LABELS: Record<AgeingBucket, string> = {
  delivered: 'Delivered',
  disbursed: 'Disbursed',
  registered: 'Registered',
  at_outlet: 'At Outlet',
  en_route: 'En Route',
  awaiting_shipment: 'Awaiting Shipment',
  bg_only: 'BG Only',
  unknown: 'Unknown',
};

/** Ordered bucket list for stable UI enumeration (earliest → latest milestone). */
export const BUCKET_ORDER: readonly AgeingBucket[] = [
  'unknown',
  'bg_only',
  'awaiting_shipment',
  'en_route',
  'at_outlet',
  'registered',
  'delivered',
  'disbursed',
] as const;
