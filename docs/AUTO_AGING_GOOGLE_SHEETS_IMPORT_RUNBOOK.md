# Auto Aging Google Sheets Import Runbook

Status: Active browser import path as of 2026-05-08

## Scope

The browser Auto Aging Import Center now accepts Google Sheets CSV exports only. Native Excel upload and browser XLSX export were retired to keep spreadsheet parsing and generation code out of the production browser bundle.

This runbook covers the supported operator workflow for teams that still receive or maintain source files in Excel.

## Supported Source

- Public or published Google Sheets URL from `docs.google.com`.
- Sheet tab must include the Auto Aging import headers, including chassis number, branch, model, payment method, and milestone date columns.
- The current browser path does not support private Workspace sheets that require sign-in. Private sheet support must use a future authenticated backend connector or scheduled sync job.

## Convert Excel To Google Sheets

1. Open Google Drive with the operational Google Workspace account for the company.
2. Upload the Excel workbook to the controlled Auto Aging import folder.
3. Open the uploaded workbook with Google Sheets.
4. Confirm the target tab has the expected Auto Aging header row and that merged title rows, notes, or summary blocks do not replace the data header row.
5. Use `File > Save as Google Sheets` if Drive has not already converted the workbook.
6. Rename the Google Sheet with the source period and branch context, for example `Auto Aging 2026-05 KK Source`.
7. Keep the original Excel file in the same Drive folder for audit traceability until the import batch is accepted.

## Publish For Browser Import

Use this only for source data approved to be published through an unguessable Google CSV export URL.

1. In Google Sheets, select the tab that contains the import data.
2. Choose `File > Share > Publish to web`.
3. Select the target sheet tab, choose `Comma-separated values (.csv)`, and publish.
4. Copy the Google Sheets URL for the selected tab. A normal edit URL with `#gid=...` is acceptable; the importer converts it to the CSV export endpoint.
5. Paste the URL into Auto Aging Import Center and run preview.
6. Review missing columns, duplicate chassis warnings, and row-level validation issues before publishing the batch.
7. After the batch is accepted, record the Google Sheet URL and import batch reference in the operating log.

## Data Handling Rules

- Do not publish sheets that contain unrelated customer identity documents, bank details, or HR data.
- Do not use a personal Google account for production imports.
- Do not edit source values after import without creating a new sheet version or recording the reason in the operating log.
- If a source sheet cannot be published, stop and use the private-sheet backlog path rather than working around access controls.

## Failure Handling

| Symptom | Likely cause | Operator action |
|---|---|---|
| Import says the sheet cannot be read | Sheet is private, unpublished, deleted, or blocked by Google access controls | Confirm publish status and retry with the selected tab URL. If the data cannot be public/published, escalate for backend private-sheet support. |
| Import says HTML was returned instead of CSV | Google returned a sign-in, sharing, or landing page | Confirm the sheet is published as CSV and that the copied URL is from `docs.google.com/spreadsheets`. |
| Missing supported data sheet message | Header row is absent or not recognized | Check the first rows of the selected tab and restore the standard Auto Aging headers. |
| Duplicate chassis warnings | Same chassis appears more than once in the tab | Resolve duplicate rows or confirm the intended source row before publishing. |

## Escalation Criteria

Escalate to product/engineering before import when:

- The source must remain private and cannot be published as CSV.
- A downstream team requires `.xlsx` output instead of CSV.
- The workbook uses formulas, protected ranges, or multiple dependent tabs that materially change imported values.
- The import volume or validation results suggest the data should move through a server-side job instead of the browser preview path.