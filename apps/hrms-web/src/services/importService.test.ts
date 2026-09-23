import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commitImportBatch, validateAndInsertVehicles } from './importService';

const { mockSupabase, mockLoadBranchMappingLookup, mockLoadPaymentMappingLookup } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  mockLoadBranchMappingLookup: vi.fn(),
  mockLoadPaymentMappingLookup: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('./mappingService', () => ({
  loadBranchMappingLookup: mockLoadBranchMappingLookup,
  loadPaymentMappingLookup: mockLoadPaymentMappingLookup,
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./performanceService', () => ({
  performanceService: {
    startQueryTimer: vi.fn(),
    endQueryTimer: vi.fn(),
  },
}));

vi.mock('./auditService', () => ({
  logVehicleEdit: vi.fn(),
}));

vi.mock('./validationService', () => ({
  validateImportBatch: vi.fn(),
}));

describe('ImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadBranchMappingLookup.mockResolvedValue(new Map());
    mockLoadPaymentMappingLookup.mockResolvedValue(new Map());
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('maps raw branch codes to their canonical code before insert', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'vehicles') {
        return { upsert };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    mockLoadBranchMappingLookup.mockResolvedValue(new Map([['FLAGSHIP', 'KCH']]));

    const result = await validateAndInsertVehicles(
      [
        {
          id: 'raw-1',
          chassis_no: 'ABC123456789',
          branch_code: ' FLAGSHIP ',
          model: 'Corolla',
          payment_method: 'Cash',
          salesman_name: 'Jane Smith',
          customer_name: 'John Doe',
        },
      ],
      'batch-1',
      'company-123',
      'user-123',
    );

    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        branch_code: 'KCH',
        salesman_name: 'Jane Smith',
      }),
    ], { onConflict: 'chassis_no,company_id' });

    const [vehiclePayload] = upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(vehiclePayload).not.toHaveProperty('salesman_id');
  });

  it('fills missing required text fields with incomplete placeholders', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'vehicles') {
        return { upsert };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await validateAndInsertVehicles(
      [
        {
          id: 'raw-1',
          chassis_no: 'ABC123456789',
          branch_code: '',
          model: '',
          payment_method: '',
          salesman_name: null,
          customer_name: undefined,
        },
      ],
      'batch-1',
      'company-123',
      'user-123',
    );

    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        branch_code: 'Unknown',
        model: 'Unknown',
        payment_method: 'Unknown',
        salesman_name: 'Pending',
        customer_name: 'Pending',
      }),
    ], { onConflict: 'chassis_no,company_id' });
  });

  it('deduplicates duplicate chassis rows before writing canonical vehicles', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'vehicles') {
        return { upsert };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await validateAndInsertVehicles(
      [
        {
          id: 'raw-1',
          chassis_no: 'ABC123456789',
          branch_code: 'KCH',
          model: 'Corolla',
          payment_method: 'Cash',
          salesman_name: 'Jane Smith',
          customer_name: 'John Doe',
        },
        {
          id: 'raw-2',
          chassis_no: 'ABC123456789',
          branch_code: 'KCH',
          model: 'Corolla Cross',
          payment_method: 'Cash',
          salesman_name: 'Jane Smith',
          customer_name: 'John Doe',
          remark: 'More complete duplicate row',
        },
      ],
      'batch-1',
      'company-123',
      'user-123',
    );

    expect(result.error).toBeNull();
    expect(result.inserted).toBe(1);
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        chassis_no: 'ABC123456789',
      }),
    ], { onConflict: 'chassis_no,company_id' });
  });

  it('normalizes slash dealer transfer price to null before vehicle upsert', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'vehicles') {
        return { upsert };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await validateAndInsertVehicles(
      [
        {
          id: 'raw-1',
          chassis_no: 'ABC123456789',
          branch_code: 'KCH',
          model: 'Corolla',
          payment_method: 'Cash',
          salesman_name: 'Jane Smith',
          customer_name: 'John Doe',
          dealer_transfer_price: '/',
        },
      ],
      'batch-1',
      'company-123',
      'user-123',
    );

    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        dealer_transfer_price: null,
      }),
    ], { onConflict: 'chassis_no,company_id' });
  });

  it('sends normalized dealer transfer price values to commit_import_batch', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { vehicles_upserted: 2, quality_issues_inserted: 0 },
      error: null,
    });

    const result = await commitImportBatch(
      [
        {
          id: 'raw-1',
          import_batch_id: 'batch-1',
          row_number: 1,
          chassis_no: 'ABC123456789',
          branch_code: 'KCH',
          model: 'Corolla',
          payment_method: 'Cash',
          salesman_name: 'Jane Smith',
          customer_name: 'John Doe',
          dealer_transfer_price: '/',
        },
        {
          id: 'raw-2',
          import_batch_id: 'batch-1',
          row_number: 2,
          chassis_no: 'XYZ123456789',
          branch_code: 'KCH',
          model: 'Corolla Cross',
          payment_method: 'Cash',
          salesman_name: 'Jane Smith',
          customer_name: 'John Doe',
          dealer_transfer_price: '45,308',
        },
      ],
      'batch-1',
      'company-123',
      [],
      'user-123',
    );

    expect(result.error).toBeNull();
    expect(mockSupabase.rpc).toHaveBeenCalledWith('commit_import_batch', expect.objectContaining({
      p_vehicles: expect.arrayContaining([
        expect.objectContaining({ chassis_no: 'ABC123456789', dealer_transfer_price: null, salesman_name: 'Jane Smith' }),
        expect.objectContaining({ chassis_no: 'XYZ123456789', dealer_transfer_price: '45308', salesman_name: 'Jane Smith' }),
      ]),
    }));

    const rpcPayload = mockSupabase.rpc.mock.calls[0][1] as { p_vehicles: Array<Record<string, unknown>> };
    for (const vehicle of rpcPayload.p_vehicles) {
      expect(vehicle).not.toHaveProperty('salesman_id');
    }
  });
});