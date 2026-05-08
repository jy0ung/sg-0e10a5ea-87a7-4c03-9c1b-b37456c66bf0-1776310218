import { VehicleRaw, DataQualityIssue } from '@/types';
import { parseVehicleGrid, REQUIRED_DB_COLUMNS } from '@/lib/import-grid-parser';
import { normalizeVehicleRawCell } from '@/lib/import-normalization';
import { loggingService } from '@/services/loggingService';
import { loadExcelJS } from '@/lib/exceljs-loader';

export { publishCanonical } from '@/lib/import-publish';

export function parseExcelDate(val: unknown): string | undefined {
  const normalized = normalizeVehicleRawCell('bg_date', val);
  // Only return the value if it is a valid (non-impossible) date.
  return normalized.value && !normalized.invalid ? String(normalized.value) : undefined;
}

export async function parseWorkbook(file: ArrayBuffer): Promise<{ rows: VehicleRaw[]; issues: DataQualityIssue[]; missingColumns: string[] }> {
  try {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file);

    if (!wb.worksheets || wb.worksheets.length === 0) {
      return { rows: [], issues: [], missingColumns: ['No sheets found in workbook'] };
    }

    const rows: VehicleRaw[] = [];
    const issues: DataQualityIssue[] = [];
    const batchId = `import-${Date.now()}`;

    const mappedDbColumns = new Set<keyof VehicleRaw>();
    let parsedSheetCount = 0;

    for (const [sheetIndex, ws] of wb.worksheets.entries()) {
      // Pull each worksheet as a 2D grid so we can locate the header row.
      const grid: unknown[][] = [];
      ws.eachRow({ includeEmpty: true }, (row) => {
        const values = row.values as unknown[];
        grid.push(values.slice(1).map(value => value ?? ''));
      });

      if (grid.length === 0) {
        continue;
      }

      const parsedSheet = parseVehicleGrid(grid, {
        sheetIndex,
        sheetName: `Sheet ${ws.name}`,
        batchId,
      });
      if (!parsedSheet.parsed) {
        continue;
      }

      parsedSheetCount++;
      parsedSheet.mappedColumns.forEach((column) => mappedDbColumns.add(column));
      rows.push(...parsedSheet.rows);
      issues.push(...parsedSheet.issues);
    }

    if (parsedSheetCount === 0) {
      return { rows: [], issues: [], missingColumns: ['No supported data sheets found in workbook'] };
    }

    const missingColumns = REQUIRED_DB_COLUMNS.filter(rc => !mappedDbColumns.has(rc));

    const chassisCount = new Map<string, number>();
    rows.forEach(r => {
      if (r.chassis_no) {
        chassisCount.set(r.chassis_no, (chassisCount.get(r.chassis_no) || 0) + 1);
      }
    });

    chassisCount.forEach((count, chassis) => {
      if (count > 1) {
        issues.push({
          id: `iss-dup-${chassis}`,
          chassisNo: chassis,
          field: 'chassis_no',
          issueType: 'duplicate',
          message: `Chassis ${chassis} appears ${count} times`,
          severity: 'warning',
          importBatchId: batchId,
        });
      }
    });

    return { rows, issues, missingColumns };
  } catch (error) {
    loggingService.error('Error parsing workbook', { error }, 'ImportParser');
    return {
      rows: [],
      issues: [],
      missingColumns: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

