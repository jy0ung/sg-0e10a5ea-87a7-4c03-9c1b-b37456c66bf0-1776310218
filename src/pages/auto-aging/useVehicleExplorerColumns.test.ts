import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVehicleExplorerColumns } from './useVehicleExplorerColumns';

describe('useVehicleExplorerColumns', () => {
  const baseArgs = {
    canEdit: true,
    branches: ['KK', 'TWU'],
    models: ['Model A'],
    payments: ['Cash'],
    startIdx: 0,
  };

  it('uses Excel-style uppercase headers for canonical columns', () => {
    const { result } = renderHook(() => useVehicleExplorerColumns(baseArgs));
    const byKey = (k: string) => result.current.find((c) => c.key === k);

    expect(byKey('row_no')?.label).toBe('NO.');
    expect(byKey('chassis_no')?.label).toBe('CHASSIS NO.');
    expect(byKey('branch_code')?.label).toBe('BRCH');
    expect(byKey('variant')?.label).toBe('VAR');
    expect(byKey('customer_name')?.label).toBe('CUST NAME');
    expect(byKey('salesman_name')?.label).toBe('SA NAME');
    expect(byKey('bg_date')?.label).toBe('BG DATE');
    expect(byKey('disb_date')?.label).toBe('DISB. DATE');
    expect(byKey('invoice_no')?.label).toBe('INV NO.');
    expect(byKey('dealer_transfer_price')?.label).toBe('DTP (DEALER TRANSFER PRICE)');
    expect(byKey('commission_paid')?.label).toBe('COMM PAYOUT');
  });

  it('numbers rows correctly from startIdx', () => {
    const { result } = renderHook(() =>
      useVehicleExplorerColumns({ ...baseArgs, startIdx: 100 }),
    );
    const rowNo = result.current.find((c) => c.key === 'row_no');
    expect(rowNo?.format?.(null, 0)).toBe('101');
    expect(rowNo?.format?.(null, 4)).toBe('105');
  });

  it('marks columns editable only when canEdit is true', () => {
    const ro = renderHook(() =>
      useVehicleExplorerColumns({ ...baseArgs, canEdit: false }),
    );
    const rw = renderHook(() => useVehicleExplorerColumns(baseArgs));
    expect(ro.result.current.find((c) => c.key === 'chassis_no')?.editable).toBe(false);
    expect(rw.result.current.find((c) => c.key === 'chassis_no')?.editable).toBe(true);
    // is_d2d is always read-only
    expect(rw.result.current.find((c) => c.key === 'is_d2d')?.editable).toBe(false);
  });

  it('maps commission_paid boolean via format + onSave', () => {
    const { result } = renderHook(() => useVehicleExplorerColumns(baseArgs));
    const col = result.current.find((c) => c.key === 'commission_paid');
    expect(col?.format?.(true, 0)).toBe('Paid');
    expect(col?.format?.(false, 0)).toBe('Not Paid');
    expect(col?.format?.(null, 0)).toBe('');
    expect(col?.onSave?.('row-1', 'Paid')).toEqual({ commission_paid: true });
    expect(col?.onSave?.('row-1', 'Not Paid')).toEqual({ commission_paid: false });
  });
});
