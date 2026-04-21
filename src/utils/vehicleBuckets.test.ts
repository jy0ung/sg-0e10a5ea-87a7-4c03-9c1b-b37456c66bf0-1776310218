import { describe, it, expect } from 'vitest';
import { classifyVehicleBucket, BUCKET_LABELS, BUCKET_ORDER } from './vehicleBuckets';

// Minimal row factory — only the fields the classifier reads are relevant.
function v(partial: Partial<Parameters<typeof classifyVehicleBucket>[0]> = {}) {
  return {
    bg_date: undefined,
    shipment_etd_pkg: undefined,
    shipment_eta_kk_twu_sdk: undefined,
    date_received_by_outlet: undefined,
    reg_date: undefined,
    delivery_date: undefined,
    disb_date: undefined,
    ...partial,
  };
}

describe('classifyVehicleBucket', () => {
  it('returns unknown when no milestones are set', () => {
    expect(classifyVehicleBucket(v())).toBe('unknown');
  });

  it('returns the latest reached milestone', () => {
    expect(classifyVehicleBucket(v({ bg_date: '2026-01-01' }))).toBe('bg_only');
    expect(classifyVehicleBucket(v({ bg_date: '2026-01-01', shipment_etd_pkg: '2026-01-15' }))).toBe('awaiting_shipment');
    expect(classifyVehicleBucket(v({ shipment_eta_kk_twu_sdk: '2026-01-20' }))).toBe('en_route');
    expect(classifyVehicleBucket(v({ date_received_by_outlet: '2026-02-01' }))).toBe('at_outlet');
    expect(classifyVehicleBucket(v({ reg_date: '2026-02-10' }))).toBe('registered');
    expect(classifyVehicleBucket(v({ delivery_date: '2026-02-20' }))).toBe('delivered');
    expect(classifyVehicleBucket(v({ delivery_date: '2026-02-20', disb_date: '2026-03-01' }))).toBe('disbursed');
  });

  it('disbursement wins over delivery when both are present', () => {
    expect(
      classifyVehicleBucket(v({ disb_date: '2026-03-01', delivery_date: '2026-02-20' })),
    ).toBe('disbursed');
  });

  it('BUCKET_LABELS covers every bucket', () => {
    for (const bucket of BUCKET_ORDER) {
      expect(BUCKET_LABELS[bucket]).toBeTruthy();
    }
  });
});
