import { describe, it, expect, beforeEach } from "vitest";
import { parseWorkbook, publishCanonical } from "./import-parser";
import type { VehicleRaw, DataQualityIssue } from "@/types";

describe("import-parser", () => {
  describe("parseWorkbook", () => {
    const createMockWorkbook = (data: Record<string, unknown>[]): ArrayBuffer => {
      const csv = data.length > 0 ? Object.keys(data[0]).join(",") + "\n" : "";
      const rows = data.map(row => Object.values(row).join(","));
      const csvContent = csv + rows.join("\n");
      return new TextEncoder().encode(csvContent).buffer;
    };

    it("parses valid workbook data correctly", () => {
      const mockData = [
        {
          "Chassis No.": "CH001",
          "BG Date": "2024-01-01",
          "Shipment ETD PKG": "2024-01-05",
          "Date Received by Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb. Date": "2024-01-25",
          "BRCH": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
          "SA Name": "Sales1",
          "Cust Name": "Cust1",
          "Remark": "Test",
        },
      ];

      const result = parseWorkbook(createMockWorkbook(mockData));
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].chassis_no).toBe("CH001");
      expect(result.rows[0].bg_date).toBe("2024-01-01");
      expect(result.rows[0].branch_code).toBe("BR1");
      expect(result.rows[0].model).toBe("Model1");
      expect(result.issues.length).toBe(0);
    });

    it("handles missing required columns", () => {
      const mockData = [
        {
          "Chassis No.": "CH001",
          "BG Date": "2024-01-01",
        },
      ];

      const result = parseWorkbook(createMockWorkbook(mockData));
      
      expect(result.missingColumns.length).toBeGreaterThan(0);
    });

    it("creates issues for missing chassis numbers", () => {
      const mockData = [
        {
          "BG Date": "2024-01-01",
          "Shipment ETD PKG": "2024-01-05",
          "Date Received by Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb. Date": "2024-01-25",
          "BRCH": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
        },
      ];

      const result = parseWorkbook(createMockWorkbook(mockData));
      
      expect(result.issues.some(i => i.issueType === "missing")).toBe(true);
    });

    it("detects duplicate chassis numbers", () => {
      const mockData = [
        {
          "Chassis No.": "CH001",
          "BG Date": "2024-01-01",
          "Shipment ETD PKG": "2024-01-05",
          "Date Received by Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb. Date": "2024-01-25",
          "BRCH": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
        },
        {
          "Chassis No.": "CH001",
          "BG Date": "2024-01-01",
          "Shipment ETD PKG": "2024-01-05",
          "Date Received by Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb. Date": "2024-01-25",
          "BRCH": "BR2",
          "Model": "Model2",
          "Payment Method": "Credit",
        },
      ];

      const result = parseWorkbook(createMockWorkbook(mockData));
      
      expect(result.issues.some(i => i.issueType === "duplicate")).toBe(true);
    });

    it("sets is_d2d flag based on remark", () => {
      const mockData = [
        {
          "Chassis No.": "CH001",
          "BG Date": "2024-01-01",
          "Shipment ETD PKG": "2024-01-05",
          "Date Received by Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb. Date": "2024-01-25",
          "BRCH": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
          "Remark": "This is a D2D transfer",
        },
      ];

      const result = parseWorkbook(createMockWorkbook(mockData));
      
      expect(result.rows[0].is_d2d).toBe(true);
    });

    it("normalizes header names correctly", () => {
      const mockData = [
        {
          "Chassis No": "CH001",
          "BG Date": "2024-01-01",
          "Shipment ETA KK/TWU/SDK": "2024-01-05",
          "Date Received By Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb Date": "2024-01-25",
          "Branch": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
        },
      ];

      const result = parseWorkbook(createMockWorkbook(mockData));
      
      expect(result.rows[0].chassis_no).toBe("CH001");
      expect(result.rows[0].branch_code).toBe("BR1");
      expect(result.rows[0].disb_date).toBe("2024-01-25");
    });

    it("handles empty workbook", () => {
      const result = parseWorkbook(new ArrayBuffer(0));
      
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("publishCanonical", () => {
    const mockRawRows: VehicleRaw[] = [
      {
        id: "raw-1",
        chassis_no: "CH001",
        bg_date: "2024-01-01",
        shipment_etd_pkg: "2024-01-05",
        shipment_eta_kk_twu_sdk: "2024-01-06",
        date_received_by_outlet: "2024-01-10",
        reg_date: "2024-01-15",
        delivery_date: "2024-01-20",
        disb_date: "2024-01-25",
        branch_code: "BR1",
        model: "Model1",
        payment_method: "Cash",
        salesman_name: "Sales1",
        customer_name: "Cust1",
        remark: "Test",
        vaa_date: "2024-01-02",
        full_payment_date: "2024-01-03",
        is_d2d: false,
        import_batch_id: "batch-1",
        row_number: 1,
      },
      {
        id: "raw-2",
        chassis_no: "CH002",
        bg_date: "2024-01-02",
        shipment_etd_pkg: "2024-01-06",
        date_received_by_outlet: "2024-01-11",
        reg_date: "2024-01-16",
        delivery_date: "2024-01-21",
        disb_date: "2024-01-26",
        branch_code: "BR2",
        model: "Model2",
        payment_method: "Credit",
        salesman_name: "Sales2",
        customer_name: "Cust2",
        remark: "D2D transfer",
        vaa_date: "2024-01-03",
        full_payment_date: "2024-01-04",
        is_d2d: true,
        import_batch_id: "batch-1",
        row_number: 2,
      },
    ];

    it("creates canonical vehicles correctly", () => {
      const { canonical, issues } = publishCanonical(mockRawRows);
      
      expect(canonical).toHaveLength(2);
      expect(canonical[0].chassis_no).toBe("CH001");
      expect(canonical[0].bg_date).toBe("2024-01-01");
      expect(canonical[0].branch_code).toBe("BR1");
      expect(canonical[1].is_d2d).toBe(true);
    });

    it("groups duplicate chassis numbers", () => {
      const rowsWithDuplicates: VehicleRaw[] = [
        {
          id: "raw-1",
          chassis_no: "CH001",
          bg_date: "2024-01-01",
          shipment_etd_pkg: "2024-01-05",
          date_received_by_outlet: "2024-01-10",
          reg_date: "2024-01-15",
          delivery_date: "2024-01-20",
          disb_date: "2024-01-25",
          branch_code: "BR1",
          model: "Model1",
          payment_method: "Cash",
          salesman_name: "Sales1",
          customer_name: "Cust1",
          remark: "Test",
          vaa_date: "2024-01-02",
          full_payment_date: "2024-01-03",
          is_d2d: false,
          import_batch_id: "batch-1",
          row_number: 1,
        },
        {
          id: "raw-2",
          chassis_no: "CH001",
          bg_date: "2024-01-01",
          shipment_etd_pkg: "2024-01-05",
          date_received_by_outlet: "2024-01-10",
          reg_date: "2024-01-15",
          delivery_date: "2024-01-20",
          disb_date: "2024-01-25",
          branch_code: "BR1",
          model: "Model1",
          payment_method: "Cash",
          salesman_name: "Sales1",
          customer_name: "Cust1",
          vaa_date: "2024-01-02",
          full_payment_date: "2024-01-03",
          is_d2d: false,
          import_batch_id: "batch-1",
          row_number: 2,
        },
      ];

      const { canonical } = publishCanonical(rowsWithDuplicates);
      
      expect(canonical).toHaveLength(1);
      expect(canonical[0].chassis_no).toBe("CH001");
    });

    it("calculates time differences correctly", () => {
      const { canonical } = publishCanonical(mockRawRows);
      
      expect(canonical[0].bg_to_delivery).toBe(19);
      expect(canonical[0].bg_to_shipment_etd).toBe(4);
      expect(canonical[0].etd_to_outlet).toBe(5);
      expect(canonical[0].outlet_to_reg).toBe(5);
      expect(canonical[0].reg_to_delivery).toBe(5);
      expect(canonical[0].bg_to_disb).toBe(24);
      expect(canonical[0].delivery_to_disb).toBe(5);
    });

    it("creates issues for negative time differences", () => {
      const rowsWithNegativeDiff: VehicleRaw[] = [
        {
          id: "raw-1",
          chassis_no: "CH001",
          bg_date: "2024-01-20",
          shipment_etd_pkg: "2024-01-05",
          date_received_by_outlet: "2024-01-10",
          reg_date: "2024-01-15",
          delivery_date: "2024-01-20",
          disb_date: "2024-01-25",
          branch_code: "BR1",
          model: "Model1",
          payment_method: "Cash",
          salesman_name: "Sales1",
          customer_name: "Cust1",
          remark: "Test",
          vaa_date: "2024-01-02",
          full_payment_date: "2024-01-03",
          is_d2d: false,
          import_batch_id: "batch-1",
          row_number: 1,
        },
      ];

      const { issues } = publishCanonical(rowsWithNegativeDiff);
      
      expect(issues.some(i => i.issueType === "negative")).toBe(true);
    });

    it("handles null dates in time calculations", () => {
      const rowsWithNullDates: VehicleRaw[] = [
        {
          id: "raw-1",
          chassis_no: "CH001",
          bg_date: "2024-01-01",
          shipment_etd_pkg: "2024-01-05",
          date_received_by_outlet: "2024-01-10",
          reg_date: null as unknown as string,
          delivery_date: "2024-01-20",
          disb_date: "2024-01-25",
          branch_code: "BR1",
          model: "Model1",
          payment_method: "Cash",
          salesman_name: "Sales1",
          customer_name: "Cust1",
          remark: "Test",
          vaa_date: "2024-01-02",
          full_payment_date: "2024-01-03",
          is_d2d: false,
          import_batch_id: "batch-1",
          row_number: 1,
        },
      ];

      const { canonical } = publishCanonical(rowsWithNullDates);
      
      expect(canonical[0].reg_to_delivery).toBeNull();
    });

    it("filters out rows without chassis numbers", () => {
      const rowsWithNullChassis: VehicleRaw[] = [
        {
          id: "raw-1",
          chassis_no: "" as string,
          bg_date: "2024-01-01",
          shipment_etd_pkg: "2024-01-05",
          date_received_by_outlet: "2024-01-10",
          reg_date: "2024-01-15",
          delivery_date: "2024-01-20",
          disb_date: "2024-01-25",
          branch_code: "BR1",
          model: "Model1",
          payment_method: "Cash",
          salesman_name: "Sales1",
          customer_name: "Cust1",
          remark: "Test",
          vaa_date: "2024-01-02",
          full_payment_date: "2024-01-03",
          is_d2d: false,
          import_batch_id: "batch-1",
          row_number: 1,
        },
      ];

      const { canonical } = publishCanonical(rowsWithNullChassis);
      
      expect(canonical).toHaveLength(0);
    });
  });
});