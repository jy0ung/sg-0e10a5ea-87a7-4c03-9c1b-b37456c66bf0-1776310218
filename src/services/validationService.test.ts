import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateVehicleRow, validateImportBatch, validateSlaPolicy, validateQualityIssue, validateVehicleImportBatch } from './validationService';
import { supabase } from '@/integrations/supabase/client';

// Type-safe chainable mock for Supabase
const createMockQueryBuilder = (resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  builder.single = vi.fn().mockResolvedValue(resolvedValue);
  builder.order = vi.fn(() => Promise.resolve(resolvedValue));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder.then = (resolve: any) => Promise.resolve(resolvedValue).then(resolve);
  return builder;
};

const { mockSupabase } = vi.hoisted(() => {
  return {
    mockSupabase: {
      from: vi.fn(),
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('./performanceService', () => ({
  performanceService: {
    startQueryTimer: vi.fn(),
    endQueryTimer: vi.fn(),
  },
}));

vi.mock('./loggingService', () => ({
  loggingService: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ValidationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock returns a chainable builder with null data
    mockSupabase.from.mockReturnValue(createMockQueryBuilder({ data: null, error: null }));
  });

  describe('validateVehicleRow', () => {
    it('should pass validation for valid vehicle row', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
        bg_date: '2024-01-01',
        shipment_etd_pkg: '2024-02-01',
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'vehicles') {
          return createMockQueryBuilder({ data: null, error: null }); // No duplicate
        }
        if (table === 'branches') {
          return createMockQueryBuilder({ data: [{ id: 'b1', code: 'B001' }], error: null }); // Branch exists
        }
        return createMockQueryBuilder({ data: null, error: null });
      });

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when required fields are missing', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        // Missing model, customer_name, salesman_name, payment_method
      };

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'model')).toBe(true);
      expect(result.errors.some(e => e.field === 'customer_name')).toBe(true);
      expect(result.errors.some(e => e.field === 'salesman_name')).toBe(true);
      expect(result.errors.some(e => e.field === 'payment_method')).toBe(true);
    });

    it('should fail when chassis_no is too short', async () => {
      const row = {
        chassis_no: 'ABC1', // Too short (less than 5 characters)
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
      };

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'CHASSIS_TOO_SHORT')).toBe(true);
    });

    it('should fail when duplicate chassis exists', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'existing-id' }, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_CHASSIS')).toBe(true);
    });

    it('should fail when branch code does not exist', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'INVALID_BRANCH',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_BRANCH_CODE')).toBe(true);
    });

    it('should fail for invalid date formats', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
        bg_date: 'invalid-date',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_DATE_FORMAT')).toBe(true);
    });

    it('should warn when shipment date is before BG date', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
        bg_date: '2024-02-01',
        shipment_etd_pkg: '2024-01-01', // Before BG date
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.warnings.some(e => e.code === 'DATE_ORDER_WARNING')).toBe(true);
    });

    it('should fail for invalid dealer transfer price', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'Cash',
        dealer_transfer_price: 'not-a-number',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NUMBER')).toBe(true);
    });

    it('should warn for unusual payment methods', async () => {
      const row = {
        chassis_no: 'ABC123456789',
        branch_code: 'B001',
        model: 'Corolla',
        customer_name: 'John Doe',
        salesman_name: 'Jane Smith',
        payment_method: 'CRYPTO', // Unusual payment method
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateVehicleRow(row, 'company-123', 1);
      expect(result.warnings.some(e => e.code === 'UNUSUAL_PAYMENT_METHOD')).toBe(true);
    });

    it('should handle various date formats correctly', async () => {
      const dateFormats = [
        '2024-01-01', // ISO
        '01.01.2024', // DD.MM.YYYY
        '01/01/2024', // DD/MM/YYYY
        '01.01.24', // DD.MM.YY
      ];

      for (const dateStr of dateFormats) {
        const row = {
          chassis_no: 'ABC123456789',
          branch_code: 'B001',
          model: 'Corolla',
          customer_name: 'John Doe',
          salesman_name: 'Jane Smith',
          payment_method: 'Cash',
          bg_date: dateStr,
        };

        const mockQueryBuilder = createMockQueryBuilder();
        mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
        mockSupabase.from.mockReturnValue(mockQueryBuilder);

        const result = await validateVehicleRow(row, 'company-123', 1);
        expect(result.errors.filter(e => e.field === 'bg_date' && e.code === 'INVALID_DATE_FORMAT')).toHaveLength(0);
      }
    });
  });

  describe('validateImportBatch', () => {
    it('should pass validation for valid batch', async () => {
      const batch = {
        fileName: 'test.xlsx',
        companyId: 'company-123',
        totalRows: 100,
        status: 'uploaded',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'company-123' }, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateImportBatch(batch);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when fileName is missing', async () => {
      const batch = {
        fileName: '',
        companyId: 'company-123',
      };

      const result = await validateImportBatch(batch);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'file_name')).toBe(true);
    });

    it('should fail when companyId is missing', async () => {
      const batch = {
        fileName: 'test.xlsx',
        companyId: '',
      };

      const result = await validateImportBatch(batch);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'company_id')).toBe(true);
    });

    it('should fail when company does not exist', async () => {
      const batch = {
        fileName: 'test.xlsx',
        companyId: 'invalid-company',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateImportBatch(batch);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_COMPANY')).toBe(true);
    });

    it('should fail for invalid status', async () => {
      const batch = {
        fileName: 'test.xlsx',
        companyId: 'company-123',
        status: 'invalid-status',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'company-123' }, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateImportBatch(batch);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ENUM_VALUE')).toBe(true);
    });

    it('should fail for invalid totalRows', async () => {
      const batch = {
        fileName: 'test.xlsx',
        companyId: 'company-123',
        totalRows: -1,
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'company-123' }, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateImportBatch(batch);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NUMBER')).toBe(true);
    });
  });

  describe('validateSlaPolicy', () => {
    it('should pass validation for valid SLA policy', async () => {
      const policy = {
        kpiId: 'kpi-123',
        slaDays: 30,
        companyId: 'company-123',
        label: 'Delivery SLA',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'company-123' }, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateSlaPolicy(policy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when kpiId is missing', async () => {
      const policy = {
        slaDays: 30,
        companyId: 'company-123',
        label: 'Delivery SLA',
      };

      const result = await validateSlaPolicy(policy);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'kpi_id')).toBe(true);
    });

    it('should fail when label is missing', async () => {
      const policy = {
        kpiId: 'kpi-123',
        slaDays: 30,
        companyId: 'company-123',
        label: '',
      };

      const result = await validateSlaPolicy(policy);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'label')).toBe(true);
    });

    it('should fail when slaDays is out of range', async () => {
      const policy = {
        kpiId: 'kpi-123',
        slaDays: 400, // > 365
        companyId: 'company-123',
        label: 'Delivery SLA',
      };

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.maybeSingle.mockResolvedValue({ data: { id: 'company-123' }, error: null });
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await validateSlaPolicy(policy);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'OUT_OF_RANGE')).toBe(true);
    });
  });

  describe('validateQualityIssue', () => {
    it('should pass validation for valid quality issue', () => {
      const issue = {
        chassisNo: 'ABC123456789',
        field: 'payment_method',
        issueType: 'missing',
        message: 'Payment method is required',
        severity: 'error',
      };

      const result = validateQualityIssue(issue);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when chassisNo is missing', () => {
      const issue = {
        field: 'payment_method',
        issueType: 'missing',
        message: 'Payment method is required',
        severity: 'error',
      };

      const result = validateQualityIssue(issue);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'chassis_no')).toBe(true);
    });

    it('should fail for invalid issueType', () => {
      const issue = {
        chassisNo: 'ABC123456789',
        field: 'payment_method',
        issueType: 'invalid-type',
        message: 'Payment method is required',
        severity: 'error',
      };

      const result = validateQualityIssue(issue);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ENUM_VALUE')).toBe(true);
    });

    it('should fail for invalid severity', () => {
      const issue = {
        chassisNo: 'ABC123456789',
        field: 'payment_method',
        issueType: 'missing',
        message: 'Payment method is required',
        severity: 'invalid-severity',
      };

      const result = validateQualityIssue(issue);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ENUM_VALUE')).toBe(true);
    });
  });

  describe('validateVehicleImportBatch', () => {
    it('should validate multiple rows and return summary', async () => {
      const rows = [
        {
          chassis_no: 'ABC123456789',
          branch_code: 'B001',
          model: 'Corolla',
          customer_name: 'John Doe',
          salesman_name: 'Jane Smith',
          payment_method: 'Cash',
        },
        {
          chassis_no: 'DEF987654321',
          branch_code: 'B001',
          model: 'Camry',
          customer_name: 'Jane Smith',
          salesman_name: 'John Doe',
          payment_method: 'Loan',
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'branches') {
          return createMockQueryBuilder({ data: [{ id: 'b1', code: 'B001' }], error: null });
        }
        return createMockQueryBuilder({ data: [], error: null });
      });

      const result = await validateVehicleImportBatch(rows, 'company-123');
      expect(result.summary.totalRows).toBe(2);
      expect(result.summary.validRows).toBe(2);
      expect(result.summary.errorRows).toBe(0);
    });

    it('should count errors correctly for batch with mixed validity', async () => {
      const rows = [
        {
          chassis_no: 'ABC123456789',
          branch_code: 'B001',
          model: 'Corolla',
          customer_name: 'John Doe',
          salesman_name: 'Jane Smith',
          payment_method: 'Cash',
        },
        {
          chassis_no: 'ABC', // Too short
          branch_code: 'B001',
          model: 'Camry',
          customer_name: 'Jane Smith',
          salesman_name: 'John Doe',
          payment_method: 'Loan',
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'branches') {
          return createMockQueryBuilder({ data: [{ id: 'b1', code: 'B001' }], error: null });
        }
        return createMockQueryBuilder({ data: [], error: null });
      });

      const result = await validateVehicleImportBatch(rows, 'company-123');
      expect(result.summary.totalRows).toBe(2);
      expect(result.summary.errorRows).toBeGreaterThan(0);
      expect(result.errors.some(e => e.code === 'CHASSIS_TOO_SHORT')).toBe(true);
    });
  });
});