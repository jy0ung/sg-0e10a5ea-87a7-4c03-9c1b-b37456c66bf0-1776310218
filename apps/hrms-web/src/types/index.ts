/**
 * Web app type barrel re-export.
 * Source of truth lives in packages/types/src/index.ts (@flc/types).
 * When the Supabase schema changes or new shared types are needed, update the package.
 * All existing imports from '@/types' continue to work without any changes.
 */
export * from '@flc/types';
