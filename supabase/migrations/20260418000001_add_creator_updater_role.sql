-- Migration: Add creator_updater role
-- The role column is plain TEXT so no enum change is needed.
-- This migration documents the new role and adds it to any application-level
-- comments / check constraints if they exist.

-- Update any existing CHECK constraint that enumerates valid role values
-- (If the constraint doesn't exist this is a no-op)
DO $$
BEGIN
  -- Drop old check constraint if it exists and re-create with new role included
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

-- Add updated check constraint allowing creator_updater
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super_admin', 'company_admin', 'director', 'general_manager',
    'manager', 'sales', 'accounts', 'analyst', 'creator_updater'
  ));

-- Comment documenting the role
COMMENT ON COLUMN public.profiles.role IS
  'User role. Allowed values: super_admin, company_admin, director, general_manager, manager, sales, accounts, analyst, creator_updater';
