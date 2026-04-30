const EMPTY_NUMERIC_TOKENS = new Set(['', '-', '—', '/', 'n/a', 'na', 'nil', 'null']);
const NUMERIC_TEXT_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export type ParsedImportNumeric =
  | { kind: 'empty' }
  | { kind: 'invalid'; raw: string }
  | { kind: 'valid'; raw: string; value: string };

export function parseImportNumericText(value: unknown): ParsedImportNumeric {
  if (value === null || value === undefined) {
    return { kind: 'empty' };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { kind: 'empty' };
    }

    return {
      kind: 'valid',
      raw: String(value),
      value: String(value),
    };
  }

  const raw = String(value).trim();
  if (!raw) {
    return { kind: 'empty' };
  }

  if (EMPTY_NUMERIC_TOKENS.has(raw.toLowerCase())) {
    return { kind: 'empty' };
  }

  const normalized = raw.replace(/^rm\s*/i, '').replace(/,/g, '').replace(/\s+/g, '');
  if (!normalized) {
    return { kind: 'empty' };
  }

  if (!NUMERIC_TEXT_PATTERN.test(normalized)) {
    return { kind: 'invalid', raw };
  }

  return {
    kind: 'valid',
    raw,
    value: normalized,
  };
}

export function normalizeImportNumericText(value: unknown): string | undefined {
  const parsed = parseImportNumericText(value);
  return parsed.kind === 'valid' ? parsed.value : undefined;
}