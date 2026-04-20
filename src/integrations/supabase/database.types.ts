/**
 * Web app Supabase database types barrel re-export.
 * Source of truth lives in packages/supabase/src/database.types.ts (@flc/supabase).
 * To regenerate: run `supabase gen types typescript` and update the package file,
 * then this re-export will automatically pick up the new types.
 * All existing imports from '@/integrations/supabase/database.types' continue to work.
 */
export * from '@flc/supabase';
