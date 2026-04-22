-- ============================================================================
-- Allow admins to UPDATE other profiles (activation / role assignment).
--
-- Until now, `profiles_update_own` only allowed auth.uid() = id, which meant
-- super_admin / company_admin could not activate pending users through RLS —
-- their UPDATEs silently affected 0 rows. This migration adds a scoped admin
-- UPDATE policy alongside the existing self-update policy.
--
-- Rules:
--   • super_admin with access_scope='global' can update any profile.
--   • super_admin / company_admin can update profiles in their own company.
--   • WITH CHECK mirrors USING to prevent cross-tenant escalation via UPDATE
--     (e.g. company_admin can't flip a user's company_id to a tenant they
--     don't belong to).
-- ============================================================================

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles admin_p
       WHERE admin_p.id = auth.uid()
         AND admin_p.role IN ('super_admin', 'company_admin')
         AND (
           admin_p.access_scope = 'global'
           OR admin_p.company_id = public.profiles.company_id
           OR public.profiles.company_id IS NULL  -- pending users with no tenant yet
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles admin_p
       WHERE admin_p.id = auth.uid()
         AND admin_p.role IN ('super_admin', 'company_admin')
         AND (
           admin_p.access_scope = 'global'
           OR admin_p.company_id = public.profiles.company_id
         )
    )
  );
