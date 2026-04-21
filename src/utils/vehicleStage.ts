import type { VehicleCanonical, VehicleStage } from '@/types';

/**
 * Fields relevant to stage derivation. A partial view lets us reuse the helper
 * during import-preview (before the row is a full VehicleCanonical).
 */
export type VehicleStageInput = Pick<
  VehicleCanonical,
  'reg_date' | 'reg_no' | 'delivery_date' | 'disb_date' | 'stage_override'
>;

/**
 * Compute a vehicle's pipeline stage from its milestone dates.
 *
 * Rules (match the new Excel template's three category sections):
 *   • `complete` — registration, delivery and disbursement all recorded.
 *   • `pending_deliver_loan_disburse` — registered (reg_date or reg_no) but
 *     either delivery_date or disb_date is still missing.
 *   • `pending_register_free_stock` — nothing registered yet.
 *
 * `stage_override` (when set to a valid stage) always wins so users can pin a
 * card even if the date state doesn't match.
 */
export function deriveVehicleStage(input: VehicleStageInput): VehicleStage {
  if (input.stage_override) return input.stage_override;

  const hasReg = Boolean(input.reg_date) || Boolean(input.reg_no);
  if (!hasReg) return 'pending_register_free_stock';

  const hasDelivery = Boolean(input.delivery_date);
  const hasDisb = Boolean(input.disb_date);
  if (hasDelivery && hasDisb) return 'complete';
  return 'pending_deliver_loan_disburse';
}

/** Human-readable labels used by filters, badges and dashboards. */
export const VEHICLE_STAGE_LABELS: Record<VehicleStage, string> = {
  pending_register_free_stock: 'Pending Register & Free Stock',
  pending_deliver_loan_disburse: 'Pending Deliver & Loan Disburse',
  complete: 'Complete',
};

/** Ordered list used to render the stage filter in a predictable order. */
export const VEHICLE_STAGES: readonly VehicleStage[] = [
  'pending_register_free_stock',
  'pending_deliver_loan_disburse',
  'complete',
];
