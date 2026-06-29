-- Allow portal-specific roles in profiles.role.
-- Application role types and access policies already include these roles; this
-- keeps the database CHECK constraint aligned with that role model.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super_admin',
    'company_admin',
    'director',
    'general_manager',
    'manager',
    'sales',
    'accounts',
    'analyst',
    'creator_updater',
    'portal_admin',
    'portal_manager',
    'portal_staff'
  ));

COMMENT ON COLUMN public.profiles.role IS
  'User role. Allowed values: super_admin, company_admin, director, general_manager, manager, sales, accounts, analyst, creator_updater, portal_admin, portal_manager, portal_staff';
