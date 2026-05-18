-- ============================================================
-- Migration: Grant portal management roles queue-level ticket access
--
-- Context: portal_admin and portal_manager are portal-only roles whose
-- home is /portal.  They need to triage, assign and resolve company
-- tickets but were previously excluded from the admin-only RLS
-- policies that gate those operations.
--
-- Changes:
--   1. tickets_select_admin  – include portal_admin + portal_manager
--   2. tickets_update_admin  – include portal_admin + portal_manager
--   3. ticket_activity_insert_scoped – include portal_admin + portal_manager
-- ============================================================

-- ─── 1. tickets SELECT (admin view) ────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_select_admin" ON public.tickets;
CREATE POLICY "tickets_select_admin" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND company_id = tickets.company_id
         AND role IN ('company_admin', 'super_admin', 'portal_admin', 'portal_manager')
    )
  );

-- ─── 2. tickets UPDATE (admin operations) ──────────────────────────────────
DROP POLICY IF EXISTS "tickets_update_admin" ON public.tickets;
CREATE POLICY "tickets_update_admin" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND company_id = tickets.company_id
         AND role IN ('company_admin', 'super_admin', 'portal_admin', 'portal_manager')
    )
  );

-- ─── 3. ticket_activity INSERT (comments & status changes) ─────────────────
DROP POLICY IF EXISTS "ticket_activity_insert_scoped" ON public.ticket_activity;
CREATE POLICY "ticket_activity_insert_scoped" ON public.ticket_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.tickets t
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE t.id = ticket_activity.ticket_id
         AND t.company_id = ticket_activity.company_id
         AND (
           t.submitted_by = auth.uid()
           OR t.assigned_to = auth.uid()
           OR (
             p.company_id = t.company_id
             AND p.role IN ('super_admin', 'company_admin', 'portal_admin', 'portal_manager')
           )
         )
    )
  );

COMMENT ON POLICY "ticket_activity_insert_scoped" ON public.ticket_activity IS
  'Allows requesters, assigned owners, portal managers, and company admins to append request activity/comments within their company scope.';
