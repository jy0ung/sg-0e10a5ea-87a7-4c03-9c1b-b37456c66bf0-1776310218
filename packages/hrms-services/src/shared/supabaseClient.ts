import { supabase } from '@flc/supabase';

/**
 * Untyped Supabase client bridge for queries against join shapes not yet
 * represented in the generated Database types.
 *
 * Every usage must carry a comment explaining why the typed client cannot
 * be used yet, e.g.:
 *   // TODO: Replace untypedSupabase after join shape is added to database.types.ts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const untypedSupabase = supabase as any;

export { supabase };
