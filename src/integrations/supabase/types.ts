/**
 * Web app Supabase types barrel re-export.
 * Source of truth lives in packages/supabase/src/types.ts (@flc/supabase).
 * All existing imports from '@/integrations/supabase/types' continue to work.
 *
 * `./database.types` is the locally-generated Database interface used by
 * client code that needs direct access to it (e.g. generic RPC wrappers).
 */
export * from '@flc/supabase';

import type { Database as DB } from './database.types';

export type Database = DB;

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
export type Functions<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T];
