import { describe, it, expect } from "vitest";
import { computeKpiSummaries } from "./kpi-computation";
import type { VehicleCanonical, SlaPolicy } from "@/types";

describe("computeKpiSummaries", () => {
  const mockVehicles: VehicleCanonical[] = [
    {
      id: "1",
      chassis_no: "CH001",
      branch_code: "BR1",
      model: "Model1",
      payment_method: "Cash",
      salesman_name: "Sales1",
      customer_name: "Cust1",
      bg_to_delivery: 10,
      bg_to_shipment_etd: 2,
      etd_to_outlet: 3,
      outlet_to_reg: 2,
      reg_to_delivery: 1,
      bg_to_disb: 15,
      delivery_to_disb: 2,
    },
    {
      id: "2",
      chassis_no: "CH002",
      branch_code: "BR1",
      model: "Model2",
      payment_method: "Credit",
      salesman_name: "Sales2",
      customer_name: "Cust2",
      bg_to_delivery: 20,
      bg_to_shipment_etd: 3,
      etd_to_outlet: 5,
      outlet_to_reg: 3,
      reg_to_delivery: 2,
      bg_to_disb: 25,
      delivery_to_disb: 3,
    },
    {
      id: "3",
      chassis_no: "CH003",
      branch_code: "BR2",
      model: "Model3",
      payment_method: "Cash",
      salesman_name: "Sales3",
      customer_name: "Cust3",
      bg_to_delivery: 15,
      bg_to_shipment_etd: 2,
      etd_to_outlet: 4,
      outlet_to_reg: 2,
      reg_to_delivery: 1,
      bg_to_disb: 18,
      delivery_to_disb: 2,
    },
    {
      id: "4",
      chassis_no: "CH004",
      branch_code: "BR2",
      model: "Model4",
      payment_method: "Credit",
      salesman_name: "Sales4",
      customer_name: "Cust4",
      bg_to_delivery: -1,
      bg_to_shipment_etd: -1,
      etd_to_outlet: -1,
      outlet_to_reg: -1,
      reg_to_delivery: -1,
      bg_to_disb: -1,
      delivery_to_disb: -1,
    },
  ];

  const mockSlas: SlaPolicy[] = [
    { id: "sla1", kpiId: "bg_to_delivery", slaDays: 14, isActive: true },
    { id: "sla2", kpiId: "bg_to_disb", slaDays: 21, isActive: true },
  ];

  it("computes KPI summaries correctly", () => {
    const summaries = computeKpiSummaries(mockVehicles, mockSlas);
    
    expect(summaries).toHaveLength(7);
    
    const bgToDelivery = summaries.find(s => s.kpiId === "bg_to_delivery");
    expect(bgToDelivery).toBeDefined();
    expect(bgToDelivery?.validCount).toBe(3);
    expect(bgToDelivery?.invalidCount).toBe(1);
    expect(bgToDelivery?.missingCount).toBe(0);
    expect(bgToDelivery?.median).toBe(15);
    expect(bgToDelivery?.average).toBe(15);
    expect(bgToDelivery?.p90).toBe(20);
    expect(bgToDelivery?.slaDays).toBe(14);
    expect(bgToDelivery?.overdueCount).toBe(2);
  });

  it("handles missing values", () => {
    const vehiclesWithMissing: VehicleCanonical[] = [
      ...mockVehicles,
      {
        id: "5",
        chassis_no: "CH005",
        branch_code: "BR3",
        model: "Model5",
        payment_method: "Cash",
        salesman_name: "Sales5",
        customer_name: "Cust5",
        bg_to_delivery: null,
        bg_to_shipment_etd: undefined,
        etd_to_outlet: null,
        outlet_to_reg: undefined,
        reg_to_delivery: null,
        bg_to_disb: undefined,
        delivery_to_disb: null,
      },
    ];

    const summaries = computeKpiSummaries(vehiclesWithMissing, mockSlas);
    
    const bgToDelivery = summaries.find(s => s.kpiId === "bg_to_delivery");
    expect(bgToDelivery?.missingCount).toBe(1);
  });

  it("uses default SLA days when policy is missing", () => {
    const summaries = computeKpiSummaries(mockVehicles, []);
    
    const bgToDelivery = summaries.find(s => s.kpiId === "bg_to_delivery");
    expect(bgToDelivery?.slaDays).toBe(45);
  });

  it("returns zero for empty or invalid data", () => {
    const emptySummaries = computeKpiSummaries([], mockSlas);
    
    emptySummaries.forEach(summary => {
      expect(summary.validCount).toBe(0);
      expect(summary.invalidCount).toBe(0);
      expect(summary.median).toBe(0);
      expect(summary.average).toBe(0);
      expect(summary.p90).toBe(0);
    });
  });

  it("calculates median correctly for even number of values", () => {
    const evenVehicles: VehicleCanonical[] = [
      {
        id: "1",
        chassis_no: "CH001",
        branch_code: "BR1",
        model: "Model1",
        payment_method: "Cash",
        salesman_name: "Sales1",
        customer_name: "Cust1",
        bg_to_delivery: 10,
        bg_to_shipment_etd: 2,
        etd_to_outlet: 3,
        outlet_to_reg: 2,
        reg_to_delivery: 1,
        bg_to_disb: 15,
        delivery_to_disb: 2,
      },
      {
        id: "2",
        chassis_no: "CH002",
        branch_code: "BR1",
        model: "Model2",
        payment_method: "Credit",
        salesman_name: "Sales2",
        customer_name: "Cust2",
        bg_to_delivery: 20,
        bg_to_shipment_etd: 3,
        etd_to_outlet: 5,
        outlet_to_reg: 3,
        reg_to_delivery: 2,
        bg_to_disb: 25,
        delivery_to_disb: 3,
      },
    ];

    const summaries = computeKpiSummaries(evenVehicles, mockSlas);
    const bgToDelivery = summaries.find(s => s.kpiId === "bg_to_delivery");
    expect(bgToDelivery?.median).toBe(20);
  });

  it("identifies overdue vehicles correctly", () => {
    const summaries = computeKpiSummaries(mockVehicles, mockSlas);
    
    const bgToDelivery = summaries.find(s => s.kpiId === "bg_to_delivery");
    expect(bgToDelivery?.overdueCount).toBeGreaterThan(0);
  });
});