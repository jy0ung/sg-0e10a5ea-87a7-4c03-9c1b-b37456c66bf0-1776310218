import { type DataQualityIssue, type VehicleRaw } from '@/types';
import { parseVehicleGrid, REQUIRED_DB_COLUMNS } from '@/lib/import-grid-parser';

export interface GoogleSheetImportResult {
  rows: VehicleRaw[];
  issues: DataQualityIssue[];
  missingColumns: string[];
  sourceName: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  if (currentRow.length > 1 || currentRow[0] !== '') {
    rows.push(currentRow);
  }

  return rows;
}

function parseGoogleSheetUrl(input: string): { csvUrl: string; sourceName: string } {
  const url = new URL(input.trim());
  if (!url.hostname.endsWith('docs.google.com')) {
    throw new Error('Use a Google Sheets URL from docs.google.com.');
  }

  const spreadsheetMatch = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!spreadsheetMatch) {
    throw new Error('Unable to identify the Google Sheet. Paste the full sheet URL.');
  }

  const spreadsheetId = spreadsheetMatch[1];
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const gid = url.searchParams.get('gid') ?? hashParams.get('gid') ?? '0';
  return {
    csvUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
    sourceName: `google-sheet-${spreadsheetId}`,
  };
}

export async function importFromGoogleSheet(input: string): Promise<GoogleSheetImportResult> {
  const { csvUrl, sourceName } = parseGoogleSheetUrl(input);
  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error('Unable to read the Google Sheet. Make sure the sheet is public or published to the web as CSV.');
  }

  const text = await response.text();
  if (/<!doctype html|<html/i.test(text)) {
    throw new Error('The Google Sheet returned an HTML page instead of CSV. Make sure it is public or published to the web.');
  }

  const batchId = `import-${Date.now()}`;
  const grid = parseCsv(text);
  const parsed = parseVehicleGrid(grid, { sheetIndex: 0, sheetName: 'Google Sheet', batchId });

  if (!parsed.parsed) {
    return {
      rows: [],
      issues: [],
      missingColumns: ['No supported data sheet could be parsed from the Google Sheet CSV export.'],
      sourceName,
    };
  }

  const missingColumns = REQUIRED_DB_COLUMNS.filter((column) => !parsed.mappedColumns.has(column));
  const chassisCount = new Map<string, number>();
  parsed.rows.forEach((row) => {
    if (row.chassis_no) {
      chassisCount.set(row.chassis_no, (chassisCount.get(row.chassis_no) ?? 0) + 1);
    }
  });

  const duplicateIssues: DataQualityIssue[] = [];
  chassisCount.forEach((count, chassis) => {
    if (count > 1) {
      duplicateIssues.push({
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

  return {
    rows: parsed.rows,
    issues: [...parsed.issues, ...duplicateIssues],
    missingColumns,
    sourceName,
  };
}