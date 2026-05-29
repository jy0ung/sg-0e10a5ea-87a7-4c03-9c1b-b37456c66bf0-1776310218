import { describe, expect, it } from 'vitest';
import { isPlatformMismatchError } from './platformErrors';

describe('isPlatformMismatchError', () => {
  it('matches PostgREST "Could not find the function" error', () => {
    const err = new Error('Could not find the function public.get_role_home_kpis(p_company_id, p_role) in the schema cache');
    expect(isPlatformMismatchError(err)).toBe(true);
  });

  it('matches "schema cache" mentions', () => {
    expect(isPlatformMismatchError(new Error('PGRST202: cached schema reload required'))).toBe(true);
    expect(isPlatformMismatchError(new Error('reload the schema cache'))).toBe(true);
  });

  it('matches Supabase/PostgREST plain object errors', () => {
    expect(isPlatformMismatchError({
      code: 'PGRST202',
      message: 'Could not find the function public.get_role_home_kpis(p_company_id, p_role) in the schema cache',
      details: 'Searched for the function public.get_role_home_kpis with parameters p_company_id, p_role',
      hint: 'Perhaps you meant to call public.get_role_home_kpis',
    })).toBe(true);
  });

  it('matches PostgreSQL undefined table code 42P01', () => {
    expect(isPlatformMismatchError({
      code: '42P01',
      message: 'relation "public.kpi_definitions" does not exist',
    })).toBe(true);
  });

  it('matches "relation x does not exist"', () => {
    const err = new Error('relation "public.kpi_definitions" does not exist');
    expect(isPlatformMismatchError(err)).toBe(true);
  });

  it('matches plain string errors with the same shapes', () => {
    expect(isPlatformMismatchError('Could not find the table public.feature_flags')).toBe(true);
  });

  it('does NOT match RLS denials (those are auth issues, not deploy issues)', () => {
    const err = new Error('permission denied for relation invoices');
    expect(isPlatformMismatchError(err)).toBe(false);
    expect(isPlatformMismatchError({
      code: '42501',
      message: 'permission denied for relation invoices',
    })).toBe(false);
  });

  it('does NOT match unauthorized raises from SECURITY DEFINER functions', () => {
    expect(isPlatformMismatchError(new Error('Unauthorized'))).toBe(false);
  });

  it('does NOT match generic network errors', () => {
    expect(isPlatformMismatchError(new Error('Failed to fetch'))).toBe(false);
    expect(isPlatformMismatchError(new Error('NetworkError when attempting to fetch resource.'))).toBe(false);
  });

  it('handles null / undefined safely', () => {
    expect(isPlatformMismatchError(null)).toBe(false);
    expect(isPlatformMismatchError(undefined)).toBe(false);
  });
});
