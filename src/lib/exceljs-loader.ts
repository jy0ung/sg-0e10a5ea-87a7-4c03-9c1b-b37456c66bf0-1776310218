type ExcelJSModule = typeof import('exceljs');
type ExcelJSDefault = ExcelJSModule['default'];

let excelJsPromise: Promise<ExcelJSDefault> | null = null;

export function loadExcelJS(): Promise<ExcelJSDefault> {
  excelJsPromise ??= import('exceljs').then(module => module.default);
  return excelJsPromise;
}

export function preloadExcelJS(): void {
  void loadExcelJS();
}