import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260922134000_internal_request_flow_pin_integrity.sql',
  ),
  'utf8',
);

describe('Internal Request Approval Flow pin integrity migration', () => {
  it('enforces same-company and Internal Request entity ownership', () => {
    expect(migration).toContain('enforce_internal_request_approval_flow_pin');
    expect(migration).toContain(
      'Pinned Approval Flow must belong to the same company',
    );
    expect(migration).toContain(
      'pins must target an Internal Request Approval Flow',
    );
  });

  it('guards both category and subcategory pin tables', () => {
    expect(migration).toContain(
      'trg_request_category_approval_flow_pin_integrity',
    );
    expect(migration).toContain(
      'trg_request_subcategory_approval_flow_pin_integrity',
    );
    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF company_id, approval_flow_id',
    );
  });

  it('does not force active state at write time', () => {
    expect(migration).not.toMatch(/NEW\.is_active/i);
    expect(migration).not.toMatch(/flow_is_active/i);
  });

  it('hardens the trigger search path and exposes no callable API', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain(
      'ON FUNCTION public.enforce_internal_request_approval_flow_pin()',
    );
    expect(migration).toContain('FROM PUBLIC, anon');
  });
});
