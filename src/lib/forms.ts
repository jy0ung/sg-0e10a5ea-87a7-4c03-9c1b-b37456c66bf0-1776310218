/**
 * forms.ts — Shared form validation utilities.
 *
 * Provides lightweight validators for common admin form patterns so each page
 * doesn't repeat the same required-field / email / phone checks.
 *
 * Usage example:
 *   const errors = validateForm(branchSchema, form);
 *   if (errors) { showErrors(errors); return; }
 */

import { z } from 'zod';

// ── Common field schemas ──────────────────────────────────────────────────────

/** Non-empty string (trims before checking). */
export const requiredString = z.string().trim().min(1, 'Required');

/** Optional string — empty is fine, trims whitespace. */
export const optionalString = z.string().trim().optional();

/** Optional email. */
export const optionalEmail = z
  .string()
  .trim()
  .refine(v => v === '' || z.string().email().safeParse(v).success, { message: 'Invalid email address' })
  .optional();

/** Optional phone — allows digits, spaces, +, -, (, ) */
export const optionalPhone = z
  .string()
  .trim()
  .refine(v => v === '' || /^[0-9 +\-()\s]*$/.test(v), { message: 'Invalid phone number' })
  .optional();

/** Short alphanumeric code (e.g. branch code, supplier code). Upper-cased externally. */
export const codeField = z.string().trim().min(1, 'Required').max(20, 'Max 20 characters');

// ── Validator factory ─────────────────────────────────────────────────────────

type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Validates a plain object against a Zod schema.
 *
 * Returns `null` when valid, or a `FieldErrors<T>` map of the first error per
 * field when invalid.  This is intentionally thin — no react-hook-form dep.
 *
 * @example
 * const schema = z.object({ code: codeField, name: requiredString });
 * const errors = validateForm(schema, { code: '', name: 'KK' });
 * // → { code: 'Required' }
 */
export function validateForm<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  values: unknown,
): FieldErrors<z.infer<typeof schema>> | null {
  const result = schema.safeParse(values);
  if (result.success) return null;

  const errors: FieldErrors<z.infer<typeof schema>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof z.infer<typeof schema>;
    if (key !== undefined && !(key in errors)) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

// ── Pre-built schemas for admin pages ────────────────────────────────────────

export const branchSchema = z.object({
  code: codeField,
  name: requiredString,
  orSeries: optionalString,
  vdoSeries: optionalString,
});
export type BranchFormValues = z.infer<typeof branchSchema>;

export const dealerSchema = z.object({
  name: requiredString,
  accCode: optionalString,
  companyRegNo: optionalString,
  companyAddress: optionalString,
  contactNo: optionalPhone,
  email: optionalEmail,
  status: requiredString,
});
export type DealerFormValues = z.infer<typeof dealerSchema>;

export const supplierSchema = z.object({
  name: requiredString,
  code: optionalString,
  companyRegNo: optionalString,
  companyAddress: optionalString,
  contactNo: optionalPhone,
  email: optionalEmail,
  status: requiredString,
});
export type SupplierFormValues = z.infer<typeof supplierSchema>;
