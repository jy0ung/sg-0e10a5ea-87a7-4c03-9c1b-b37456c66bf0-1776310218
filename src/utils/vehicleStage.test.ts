import { describe, expect, it } from 'vitest';
import { deriveVehicleStage, VEHICLE_STAGES } from './vehicleStage';

describe('deriveVehicleStage', () => {
  it('returns pending_register_free_stock when no reg_date and no reg_no', () => {
    expect(deriveVehicleStage({})).toBe('pending_register_free_stock');
  });

  it('treats empty strings as missing', () => {
    expect(
      deriveVehicleStage({ reg_date: '', reg_no: '', delivery_date: '', disb_date: '' }),
    ).toBe('pending_register_free_stock');
  });

  it('returns pending_deliver_loan_disburse when only reg_date is set', () => {
    expect(deriveVehicleStage({ reg_date: '2026-04-01' })).toBe(
      'pending_deliver_loan_disburse',
    );
  });

  it('returns pending_deliver_loan_disburse when only reg_no is set', () => {
    expect(deriveVehicleStage({ reg_no: 'SAB1234A' })).toBe(
      'pending_deliver_loan_disburse',
    );
  });

  it('returns pending_deliver_loan_disburse when disb_date missing', () => {
    expect(
      deriveVehicleStage({ reg_date: '2026-04-01', delivery_date: '2026-04-10' }),
    ).toBe('pending_deliver_loan_disburse');
  });

  it('returns pending_deliver_loan_disburse when delivery_date missing', () => {
    expect(
      deriveVehicleStage({ reg_date: '2026-04-01', disb_date: '2026-04-15' }),
    ).toBe('pending_deliver_loan_disburse');
  });

  it('returns complete when reg, delivery and disb are all set', () => {
    expect(
      deriveVehicleStage({
        reg_date: '2026-04-01',
        delivery_date: '2026-04-10',
        disb_date: '2026-04-15',
      }),
    ).toBe('complete');
  });

  it('returns complete with reg_no instead of reg_date', () => {
    expect(
      deriveVehicleStage({
        reg_no: 'SAB1234A',
        delivery_date: '2026-04-10',
        disb_date: '2026-04-15',
      }),
    ).toBe('complete');
  });

  it('stage_override wins over derived stage', () => {
    expect(
      deriveVehicleStage({
        reg_date: '2026-04-01',
        delivery_date: '2026-04-10',
        disb_date: '2026-04-15',
        stage_override: 'pending_register_free_stock',
      }),
    ).toBe('pending_register_free_stock');
  });

  it('stage_override of complete pins an early-stage vehicle', () => {
    expect(
      deriveVehicleStage({ stage_override: 'complete' }),
    ).toBe('complete');
  });

  it('null stage_override falls back to derivation', () => {
    expect(
      deriveVehicleStage({ reg_date: '2026-04-01', stage_override: null }),
    ).toBe('pending_deliver_loan_disburse');
  });

  it('exposes stages in the expected order', () => {
    expect(VEHICLE_STAGES).toEqual([
      'pending_register_free_stock',
      'pending_deliver_loan_disburse',
      'complete',
    ]);
  });
});
