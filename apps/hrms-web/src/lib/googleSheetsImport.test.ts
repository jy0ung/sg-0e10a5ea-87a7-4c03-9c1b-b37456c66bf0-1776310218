import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importFromGoogleSheet } from './googleSheetsImport';

describe('googleSheetsImport', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Date, 'now').mockReturnValue(1778202000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('imports a published Google Sheet CSV and preserves hash gid links', async () => {
    const csv = [
      'Chassis No.,BG Date,Shipment ETD PKG,Date Received by Outlet,Reg Date,Delivery Date,Disb. Date,BRCH,Model,Payment Method,Cust Name,Remark',
      'GS-001,2026-01-01,2026-01-05,2026-01-10,2026-01-15,2026-01-20,2026-01-25,KK,Saga,Cash,"Tan, Mei",D2D transfer',
      'GS-001,2026-01-02,2026-01-06,2026-01-11,2026-01-16,2026-01-21,2026-01-26,TWU,X70,Loan,Lim Wei,Follow up',
    ].join('\n');
    fetchMock.mockResolvedValue(new Response(csv, { status: 200 }));

    const result = await importFromGoogleSheet('https://docs.google.com/spreadsheets/d/sheet_123/edit#gid=987654321');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/sheet_123/export?format=csv&gid=987654321',
    );
    expect(result.sourceName).toBe('google-sheet-sheet_123');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      chassis_no: 'GS-001',
      branch_code: 'KK',
      customer_name: 'Tan, Mei',
      is_d2d: true,
      import_batch_id: 'import-1778202000000',
    });
    expect(result.missingColumns).toEqual([]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'chassis_no',
          issueType: 'duplicate',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('rejects non-Google Sheets URLs before fetching', async () => {
    await expect(importFromGoogleSheet('https://example.com/sheet.csv')).rejects.toThrow('docs.google.com');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains inaccessible private or unpublished sheets', async () => {
    fetchMock.mockResolvedValue(new Response('Not found', { status: 403 }));

    await expect(
      importFromGoogleSheet('https://docs.google.com/spreadsheets/d/private_sheet/edit?gid=0'),
    ).rejects.toThrow('Make sure the sheet is public or published to the web as CSV');
  });

  it('rejects Google HTML responses instead of treating them as CSV', async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html><html><body>Sign in</body></html>', { status: 200 }));

    await expect(
      importFromGoogleSheet('https://docs.google.com/spreadsheets/d/private_sheet/edit?gid=0'),
    ).rejects.toThrow('returned an HTML page instead of CSV');
  });

  it('returns a missing-column message for unsupported CSV shapes', async () => {
    fetchMock.mockResolvedValue(new Response('Name,Amount\nA,1', { status: 200 }));

    const result = await importFromGoogleSheet('https://docs.google.com/spreadsheets/d/sheet_123/edit?gid=0');

    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.missingColumns).toEqual([
      'No supported data sheet could be parsed from the Google Sheet CSV export.',
    ]);
  });
});