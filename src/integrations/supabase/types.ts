/**
 * Web app Supabase types barrel re-export.
 * Source of truth lives in packages/supabase/src/types.ts (@flc/supabase).
 * All existing imports from '@/integrations/supabase/types' continue to work.
 */
export * from '@flc/supabase';
@flc/supabase).
 * All existing imports from '@/integrations/supabase/types' continue to work.
 */
export * from '@flc/supabase';


import type { Database as DB } from './database.types';

export type Database = DB;

// Re-export commonly used types for convenience
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
export type Functions<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T];

// Project reference: nrlzptrtukdeaugphayd
// Last updated: 2026-04-16T05:01:09.193201
