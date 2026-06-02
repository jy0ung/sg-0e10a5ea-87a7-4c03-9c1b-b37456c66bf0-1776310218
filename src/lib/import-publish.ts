import { normalizeSupportedDateValue, parseSupportedDateString } from '@/lib/dateParsing';
import { normalizeImportNumericText } from '@/lib/importNumeric';
import { loggingService } from '@flc/platform-services';
import type { DataQualityIssue, VehicleCanonical, VehicleRaw } from '@/types';
import { deriveVehicleStage } from '@/utils/vehicleStage';

export function publishCanonical(
  rows: VehicleRaw[],
  branchMap?: Map<string, string>,
  paymentMap?: Map<string, string>,
  nameToIdMap?: Map<string, string>,
): { canonical: VehicleCanonical[]; issues: DataQualityIssue[] } {
  try {
    const grouped = new Map<string, VehicleRaw[]>();
    rows.filter((row) => row.chassis_no).forEach((row) => {
      const group = grouped.get(row.chassis_no) ?? [];
      group.push(row);
      grouped.set(row.chassis_no, group);
    });

    const canonical: VehicleCanonical[] = [];
    const issues: DataQualityIssue[] = [];

    grouped.forEach((group, chassis) => {
      const best = group.sort((left, right) => {
        const countFields = (value: VehicleRaw) => Object.values(value).filter((field) => field !== undefined && field !== '').length;
        return countFields(right) - countFields(left);
      })[0];

      const normalizedDates = {
        bg_date: normalizeSupportedDateValue(best.bg_date),
        shipment_etd_pkg: normalizeSupportedDateValue(best.shipment_etd_pkg),
        shipment_eta_kk_twu_sdk: normalizeSupportedDateValue(best.shipment_eta_kk_twu_sdk),
        date_received_by_outlet: normalizeSupportedDateValue(best.date_received_by_outlet),
        reg_date: normalizeSupportedDateValue(best.reg_date),
        delivery_date: normalizeSupportedDateValue(best.delivery_date),
        disb_date: normalizeSupportedDateValue(best.disb_date),
        vaa_date: normalizeSupportedDateValue(best.vaa_date),
        full_payment_date: normalizeSupportedDateValue(best.full_payment_date),
      };

      const diffDays = (from?: string, to?: string): number | null => {
        if (!from || !to) return null;
        const fromDate = parseSupportedDateString(from);
        const toDate = parseSupportedDateString(to);
        if (!fromDate || !toDate) {
          return null;
        }
        const diff = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
        return Number.isNaN(diff) ? null : diff;
      };

      const normalizedBranchCode = best.branch_code?.trim();
      const resolvedBranchCode = (branchMap && normalizedBranchCode
        ? (branchMap.get(normalizedBranchCode.toUpperCase()) ?? normalizedBranchCode)
        : normalizedBranchCode) || undefined;

      const pendingFields: string[] = [];
      if (!best.salesman_name) pendingFields.push('salesman_name');
      if (!best.customer_name) pendingFields.push('customer_name');
      if (!best.model) pendingFields.push('model');
      if (!best.payment_method) pendingFields.push('payment_method');
      if (!resolvedBranchCode) pendingFields.push('branch_code');

      const vehicle: VehicleCanonical = {
        id: `canon-${chassis}`,
        chassis_no: chassis,
        bg_date: normalizedDates.bg_date,
        shipment_etd_pkg: normalizedDates.shipment_etd_pkg,
        shipment_eta_kk_twu_sdk: normalizedDates.shipment_eta_kk_twu_sdk,
        date_received_by_outlet: normalizedDates.date_received_by_outlet,
        reg_date: normalizedDates.reg_date,
        delivery_date: normalizedDates.delivery_date,
        disb_date: normalizedDates.disb_date,
        branch_code: resolvedBranchCode || 'Unknown',
        model: best.model || 'Unknown',
        payment_method: (paymentMap && best.payment_method?.trim()
          ? (paymentMap.get(best.payment_method.trim().toUpperCase()) ?? best.payment_method.trim())
          : best.payment_method?.trim()) || 'Unknown',
        salesman_name: best.salesman_name || 'Pending',
        customer_name: best.customer_name || 'Pending',
        remark: best.remark,
        vaa_date: normalizedDates.vaa_date,
        full_payment_date: normalizedDates.full_payment_date,
        is_d2d: best.is_d2d || false,
        import_batch_id: best.import_batch_id,
        source_row_id: best.id,
        variant: best.variant,
        color: best.color,
        dealer_transfer_price: normalizeImportNumericText(best.dealer_transfer_price),
        full_payment_type: best.full_payment_type,
        shipment_name: best.shipment_name,
        lou: best.lou,
        contra_sola: best.contra_sola,
        reg_no: best.reg_no,
        invoice_no: best.invoice_no,
        obr: best.obr,
        commission_paid: best.commission_paid,
        commission_remark: best.commission_remark,
        bg_to_delivery: diffDays(normalizedDates.bg_date, normalizedDates.delivery_date),
        bg_to_shipment_etd: diffDays(normalizedDates.bg_date, normalizedDates.shipment_etd_pkg),
        etd_to_outlet: diffDays(normalizedDates.shipment_etd_pkg, normalizedDates.date_received_by_outlet),
        outlet_to_reg: diffDays(normalizedDates.date_received_by_outlet, normalizedDates.reg_date),
        reg_to_delivery: diffDays(normalizedDates.reg_date, normalizedDates.delivery_date),
        bg_to_disb: diffDays(normalizedDates.bg_date, normalizedDates.disb_date),
        delivery_to_disb: diffDays(normalizedDates.delivery_date, normalizedDates.disb_date),
        is_incomplete: pendingFields.length > 0,
        pending_fields: pendingFields.length > 0 ? pendingFields : undefined,
        salesman_id: (nameToIdMap && best.salesman_name)
          ? (nameToIdMap.get(best.salesman_name) ?? null)
          : null,
      };

      vehicle.stage = deriveVehicleStage(vehicle);

      const kpiFields = [
        ['bg_to_delivery', 'BG→Delivery'], ['bg_to_shipment_etd', 'BG→ETD'], ['etd_to_outlet', 'ETD→Outlet'],
        ['outlet_to_reg', 'Outlet→Reg'], ['reg_to_delivery', 'Reg→Delivery'],
        ['bg_to_disb', 'BG→Disb'], ['delivery_to_disb', 'Delivery→Disb'],
      ] as const;

      kpiFields.forEach(([field, label]) => {
        const value = vehicle[field];
        if (value !== null && value !== undefined && value < 0) {
          issues.push({
            id: `neg-${chassis}-${field}`,
            chassisNo: chassis,
            field,
            issueType: 'negative',
            message: `${label} is negative (${value} days)`,
            severity: 'error',
            importBatchId: best.import_batch_id,
          });
        }
      });

      canonical.push(vehicle);
    });

    return { canonical, issues };
  } catch (error) {
    loggingService.error('Error publishing canonical', { error }, 'ImportPublish');
    return { canonical: [], issues: [] };
  }
}