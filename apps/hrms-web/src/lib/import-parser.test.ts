import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { parseWorkbook, publishCanonical } from "./import-parser";
import type { VehicleRaw } from "@/types";

describe("import-parser", () => {
  describe("parseWorkbook", () => {
    const replacementHeaders = [
      "NO",
      "BRCH K1",
      "VAA\nDATE",
      "MODEL",
      "VAR",
      "COLOR",
      "CHASSIS NO.",
      "DTP\n(Dealer Transfer Price)",
      "PAYMENT\nMETHOD",
      "BG\nDATE",
      "FULL PAYMENT TYPE",
      "FULL PAYMENT DATE",
      "SHIPMENT\nNAME",
      "SHIPMENT\nETD PKG",
      "DATE SHIPMENT\nETA KK/TWU/SDK",
      "RECEIVED BY OUTLET",
      "AGING",
      "Aging PYT as at Today",
      "SA\nNAME",
      "CUST\nNAME",
      "PENDING LOAN",
      "LOU",
      "CONTRA\nSOLA",
      "REG\nNO",
      "REG\nDATE",
      "INV No.",
      "OBR",
      "DELIVERY\nDATE",
      "INVOICE DATE",
      "DISB.\nDATE",
      "AGING REG-DELIVER",
      "AGING DELIVER-DISB",
      "REMARK",
      "COMM PAYOUT",
    ];

    const replacementOwnerRow = replacementHeaders.map(() => "");
    replacementOwnerRow[1] = "(STOCK IN MS LEONG)";
    replacementOwnerRow[8] = "(DEPOSIT PAYMENT) SHENNY";
    replacementOwnerRow[10] = "(FULL PAYMENT) SHENNY";
    replacementOwnerRow[12] = "(OUTLET ADMIN) ANN";
    replacementOwnerRow[18] = "(SALES MANAGER) UMAR & ROSALIE";
    replacementOwnerRow[23] = "(OUTLET ADMIN) VEE";

    const createMockWorkbook = async (data: Record<string, unknown>[]): Promise<ArrayBuffer> => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Combine Data");
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);
        data.forEach(row => worksheet.addRow(headers.map(header => row[header] ?? "")));
      }
      return workbook.xlsx.writeBuffer();
    };

    const addReplacementSheet = (
      workbook: ExcelJS.Workbook,
      name: string,
      rows: Array<Record<string, unknown>>,
      sectionLabel?: string,
    ) => {
      const worksheet = workbook.addWorksheet(name);
      worksheet.addRow(replacementOwnerRow);
      worksheet.addRow(replacementHeaders);
      if (sectionLabel) {
        worksheet.addRow([sectionLabel]);
      }

      rows.forEach((row, index) => {
        worksheet.addRow([
          row["NO"] ?? index + 1,
          row["BRCH K1"] ?? "",
          row["VAA DATE"] ?? "",
          row["MODEL"] ?? "",
          row["VAR"] ?? "",
          row["COLOR"] ?? "",
          row["CHASSIS NO."] ?? "",
          row["DTP"] ?? "",
          row["PAYMENT METHOD"] ?? "",
          row["BG DATE"] ?? "",
          row["FULL PAYMENT TYPE"] ?? "",
          row["FULL PAYMENT DATE"] ?? "",
          row["SHIPMENT NAME"] ?? "",
          row["SHIPMENT ETD PKG"] ?? "",
          row["DATE SHIPMENT ETA KK/TWU/SDK"] ?? "",
          row["RECEIVED BY OUTLET"] ?? "",
          row["AGING"] ?? "",
          row["Aging PYT as at Today"] ?? "",
          row["SA NAME"] ?? "",
          row["CUST NAME"] ?? "",
          row["PENDING LOAN"] ?? "",
          row["LOU"] ?? "",
          row["CONTRA SOLA"] ?? "",
          row["REG NO"] ?? "",
          row["REG DATE"] ?? "",
          row["INV NO"] ?? "",
          row["OBR"] ?? "",
          row["DELIVERY DATE"] ?? "",
          row["INVOICE DATE"] ?? "",
          row["DISB DATE"] ?? "",
          row["AGING REG-DELIVER"] ?? "",
          row["AGING DELIVER-DISB"] ?? "",
          row["REMARK"] ?? "",
          row["COMM PAYOUT"] ?? "",
        ]);
      });
    };

    const createReplacementWorkbook = async (): Promise<ArrayBuffer> => {
      const workbook = new ExcelJS.Workbook();

      addReplacementSheet(
        workbook,
        "Pending Deliver & Loan Disburse",
        [
          {
            "BRCH K1": "FLAGSHIP",
            "VAA DATE": "2026-01-20",
            "MODEL": "SAGA",
            "VAR": "SAGA 1.5 EXECUTIVE",
            "COLOR": "METALLIC SPACE GREY",
            "CHASSIS NO.": "PD-001",
            "DTP": 45308,
            "PAYMENT METHOD": "FLOOR STOCK",
            "BG DATE": "2026-01-21",
            "FULL PAYMENT TYPE": "FULL PAYMENT MBB FS",
            "FULL PAYMENT DATE": "2026-01-21",
            "SHIPMENT NAME": "MTT BINTANGOR 26BG036E",
            "SHIPMENT ETD PKG": "2026-01-30",
            "DATE SHIPMENT ETA KK/TWU/SDK": "2026-02-04",
            "RECEIVED BY OUTLET": "2026-03-03",
            "SA NAME": "LISA LAU (TR)",
            "CUST NAME": "JESSON JEFFRY",
            "LOU": "PBB",
            "REG NO": "SJQ5447",
            "REG DATE": "2026-02-28",
            "INV NO": "INV/KK4S/26/02/082",
            "OBR": "YES",
            "DELIVERY DATE": "2026-03-31",
            "REMARK": "Customer follow-up",
            "COMM PAYOUT": "YES",
          },
        ],
      );

      addReplacementSheet(
        workbook,
        "Pending Register & Free Stock",
        [
          {
            "BRCH K1": "FLAGSHIP",
            "VAA DATE": "2025-07-08",
            "MODEL": "PERSONA",
            "VAR": "PERSONA 1.6 CVT EXECUTIVE",
            "CHASSIS NO.": "PR-001",
            "DTP": 53168,
            "PAYMENT METHOD": "PAS (BG)",
            "BG DATE": "2025-11-28",
            "FULL PAYMENT TYPE": "FULL PAYMENT TT",
            "FULL PAYMENT DATE": "2025-11-30",
            "SHIPMENT NAME": "FURI DANUM 172 72107W",
            "SHIPMENT ETD PKG": "2025-12-03",
            "DATE SHIPMENT ETA KK/TWU/SDK": "2025-12-10",
            "RECEIVED BY OUTLET": "2025-12-20",
            "SA NAME": "FRANKY (TR)",
            "CUST NAME": "EZRA EILAN LABO",
            "REMARK": "D2D FROM LDU 3S",
            "COMM PAYOUT": "Comm not paid",
          },
        ],
        "PENDING REGISTER & FREE STOCK",
      );

      addReplacementSheet(
        workbook,
        "Test Drive Unit",
        [
          {
            "BRCH K1": "FLAGSHIP",
            "VAA DATE": "2026-01-13",
            "MODEL": "X70",
            "VAR": "X70 1.5 TGDi PREMIUM MC3",
            "CHASSIS NO.": "TD-001",
            "DTP": 116440.4,
            "PAYMENT METHOD": "TT",
            "BG DATE": "2026-01-14",
            "FULL PAYMENT TYPE": "FULL PAYMENT TT",
            "FULL PAYMENT DATE": "2026-01-14",
            "SHIPMENT NAME": "GIGA GRAND VISON V.267",
            "SHIPMENT ETD PKG": "2026-01-19",
            "DATE SHIPMENT ETA KK/TWU/SDK": "2026-01-25",
            "RECEIVED BY OUTLET": "2026-01-31",
            "SA NAME": "OFFICE",
            "CUST NAME": "TEST DRIVE X70 MC3",
            "REMARK": "PRE REG",
            "COMM PAYOUT": "Paid 15/04",
          },
        ],
        "FOOK LOI TEST DRIVE UNIT AND PRE-REGISTER UNIT",
      );

      const misc = workbook.addWorksheet("MISC");
      misc.addRow(["", "BRANCH", "", "BANK", "", "", "MODEL", "VARIANTS"]);
      misc.addRow([1, "FLAGSHIP", 1, "AFFIN", "AFFIN BANK", 1, "SAGA", "SAGA 1.5 STANDARD"]);

      return workbook.xlsx.writeBuffer();
    };

    it("parses valid workbook data correctly", async () => {
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

      const result = await parseWorkbook(await createMockWorkbook(mockData));
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].chassis_no).toBe("CH001");
      expect(result.rows[0].bg_date).toBe("2024-01-01");
      expect(result.rows[0].branch_code).toBe("BR1");
      expect(result.rows[0].model).toBe("Model1");
      expect(result.issues.length).toBe(0);
    });

    it("drops impossible calendar dates instead of preserving invalid literals", async () => {
      const mockData = [
        {
          "Chassis No.": "CH001",
          "BG Date": "31.02.2026",
          "Shipment ETD PKG": "2026-03-05",
          "Date Received by Outlet": "2026-03-10",
          "Reg Date": "2026-03-15",
          "Delivery Date": "2026-03-20",
          "Disb. Date": "2026-03-25",
          "BRCH": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
          "SA Name": "Sales1",
          "Cust Name": "Cust1",
        },
      ];

      const result = await parseWorkbook(await createMockWorkbook(mockData));

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].bg_date).toBeUndefined();
    });

    it("handles missing required columns", async () => {
      const mockData = [
        {
          "Chassis No.": "CH001",
          "BG Date": "2024-01-01",
        },
      ];

      const result = await parseWorkbook(await createMockWorkbook(mockData));
      
      expect(result.missingColumns.length).toBeGreaterThan(0);
    });

    it("creates issues for missing chassis numbers", async () => {
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

      const result = await parseWorkbook(await createMockWorkbook(mockData));
      
      expect(result.issues.some(i => i.issueType === "missing")).toBe(true);
    });

    it("detects duplicate chassis numbers", async () => {
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

      const result = await parseWorkbook(await createMockWorkbook(mockData));
      
      expect(result.issues.some(i => i.issueType === "duplicate")).toBe(true);
    });

    it("sets is_d2d flag based on remark", async () => {
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

      const result = await parseWorkbook(await createMockWorkbook(mockData));
      
      expect(result.rows[0].is_d2d).toBe(true);
    });

    it("normalizes header names correctly", async () => {
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

      const result = await parseWorkbook(await createMockWorkbook(mockData));
      
      expect(result.rows[0].chassis_no).toBe("CH001");
      expect(result.rows[0].branch_code).toBe("BR1");
      expect(result.rows[0].disb_date).toBe("2024-01-25");
    });

    it("handles empty workbook", async () => {
      const result = await parseWorkbook(new ArrayBuffer(0));
      
      expect(result.rows).toHaveLength(0);
    });

    it("parses COLOR column into the vehicle row", async () => {
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
          "Color": "Solid White",
        },
      ];
      const result = await parseWorkbook(await createMockWorkbook(mockData));
      expect(result.rows[0].color).toBe("Solid White");
    });

    it("parses COMM PAYOUT header into commission fields", async () => {
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
          "COMM PAYOUT (on or before 30/04)": "Comm not paid",
        },
        {
          "Chassis No.": "CH002",
          "BG Date": "2024-01-01",
          "Shipment ETD PKG": "2024-01-05",
          "Date Received by Outlet": "2024-01-10",
          "Reg Date": "2024-01-15",
          "Delivery Date": "2024-01-20",
          "Disb. Date": "2024-01-25",
          "BRCH": "BR1",
          "Model": "Model1",
          "Payment Method": "Cash",
          "COMM PAYOUT (on or before 30/04)": "Paid 15/04",
        },
      ];
      const result = await parseWorkbook(await createMockWorkbook(mockData));
      const a = result.rows.find(r => r.chassis_no === "CH001");
      const b = result.rows.find(r => r.chassis_no === "CH002");
      expect(a?.commission_paid).toBe(false);
      expect(a?.commission_remark).toBe("Comm not paid");
      expect(b?.commission_paid).toBe(true);
      expect(b?.commission_remark).toBe("Paid 15/04");
    });

    it("parses the replacement workbook across multiple data sheets", async () => {
      const result = await parseWorkbook(await createReplacementWorkbook());

      expect(result.rows).toHaveLength(3);
      expect(result.missingColumns).toEqual([]);
      expect(result.issues.some(issue => issue.issueType === "missing")).toBe(false);

      const pendingDeliver = result.rows.find(row => row.chassis_no === "PD-001");
      const pendingRegister = result.rows.find(row => row.chassis_no === "PR-001");
      const testDrive = result.rows.find(row => row.chassis_no === "TD-001");

      expect(pendingDeliver?.branch_code).toBe("FLAGSHIP");
      expect(pendingDeliver?.shipment_eta_kk_twu_sdk).toBe("2026-02-04");
      expect(pendingDeliver?.date_received_by_outlet).toBe("2026-03-03");
      expect(pendingRegister?.is_d2d).toBe(true);
      expect(pendingRegister?.commission_paid).toBe(false);
      expect(testDrive?.commission_paid).toBe(true);
      expect(testDrive?.commission_remark).toBe("Paid 15/04");
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
      const { canonical } = publishCanonical(mockRawRows);
      
      expect(canonical).toHaveLength(2);
      expect(canonical[0].chassis_no).toBe("CH001");
      expect(canonical[0].bg_date).toBe("2024-01-01");
      expect(canonical[0].branch_code).toBe("BR1");
      expect(canonical[1].is_d2d).toBe(true);
    });

    it("nulls impossible dates when building canonical vehicles", () => {
      const rowsWithInvalidDate: VehicleRaw[] = [
        {
          ...mockRawRows[0],
          bg_date: "2026-02-31",
          delivery_date: "2026-03-05",
        },
      ];

      const { canonical } = publishCanonical(rowsWithInvalidDate);

      expect(canonical[0].bg_date).toBeUndefined();
      expect(canonical[0].bg_to_delivery).toBeNull();
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