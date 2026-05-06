type ExcelJSModule = typeof import('exceljs');

let excelJsPromise: Promise<ExcelJSModule> | null = null;

export function loadExcelJS(): Promise<ExcelJSModule> {
  excelJsPromise ??= import('exceljs');
  return excelJsPromise;
}

export function preloadExcelJS(): void {
  void loadExcelJS();
}