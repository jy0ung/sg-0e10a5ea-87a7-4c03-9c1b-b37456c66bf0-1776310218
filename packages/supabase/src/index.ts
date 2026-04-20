// Barrel export — re-export everything from @flc/supabase
export { supabase } from './client';
// ./types already re-exports Database from ./database.types plus Tables/Enums/Functions helpers
export * from './types';
