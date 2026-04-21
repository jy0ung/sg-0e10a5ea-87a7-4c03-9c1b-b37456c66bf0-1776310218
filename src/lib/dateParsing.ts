const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DOT_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

function expandYear(year: number): number {
  return year < 100 ? year + (year > 50 ? 1900 : 2000) : year;
}

function buildValidDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function parseSupportedDateString(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    return buildValidDate(
      Number.parseInt(isoMatch[1], 10),
      Number.parseInt(isoMatch[2], 10),
      Number.parseInt(isoMatch[3], 10),
    );
  }

  const dotMatch = trimmed.match(DOT_DATE_PATTERN);
  if (dotMatch) {
    return buildValidDate(
      expandYear(Number.parseInt(dotMatch[3], 10)),
      Number.parseInt(dotMatch[2], 10),
      Number.parseInt(dotMatch[1], 10),
    );
  }

  const slashMatch = trimmed.match(SLASH_DATE_PATTERN);
  if (slashMatch) {
    return buildValidDate(
      expandYear(Number.parseInt(slashMatch[3], 10)),
      Number.parseInt(slashMatch[2], 10),
      Number.parseInt(slashMatch[1], 10),
    );
  }

  const fallbackDate = new Date(trimmed);
  if (Number.isNaN(fallbackDate.getTime())) {
    return null;
  }

  return buildValidDate(
    fallbackDate.getUTCFullYear(),
    fallbackDate.getUTCMonth() + 1,
    fallbackDate.getUTCDate(),
  );
}

export function normalizeSupportedDateValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }
    return formatDate(value);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsedDate = parseSupportedDateString(value);
  return parsedDate ? formatDate(parsedDate) : undefined;
}