-- Migration for Portal Redesign Phase 1: Foundation & Data Model

-- 1. Keep the role check constraint aligned with canonical app roles.
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

-- 2. Create ticket_collaborators mapping table
CREATE TABLE IF NOT EXISTS public.ticket_collaborators (
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS ticket_collaborators_user_idx ON public.ticket_collaborators(user_id);
CREATE INDEX IF NOT EXISTS ticket_collaborators_ticket_idx ON public.ticket_collaborators(ticket_id);

ALTER TABLE public.ticket_collaborators ENABLE ROW LEVEL SECURITY;

-- Collaborators table policies
DROP POLICY IF EXISTS "ticket_collaborators_select_scoped" ON public.ticket_collaborators;
CREATE POLICY "ticket_collaborators_select_scoped" ON public.ticket_collaborators
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "ticket_collaborators_insert_scoped" ON public.ticket_collaborators;
CREATE POLICY "ticket_collaborators_insert_scoped" ON public.ticket_collaborators
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_same_company(company_id)
    AND (
      public.current_role() IN ('super_admin', 'company_admin', 'portal_admin')
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_collaborators.ticket_id
          AND t.company_id = ticket_collaborators.company_id
          AND (t.assigned_to = auth.uid() OR t.backup_owner_id = auth.uid() OR t.escalation_owner_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "ticket_collaborators_delete_scoped" ON public.ticket_collaborators;
CREATE POLICY "ticket_collaborators_delete_scoped" ON public.ticket_collaborators
  FOR DELETE TO authenticated
  USING (
    public.is_same_company(company_id)
    AND (
      public.current_role() IN ('super_admin', 'company_admin', 'portal_admin')
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_collaborators.ticket_id
          AND t.company_id = ticket_collaborators.company_id
          AND (t.assigned_to = auth.uid() OR t.backup_owner_id = auth.uid() OR t.escalation_owner_id = auth.uid())
      )
      OR user_id = auth.uid() -- Can remove themselves
    )
  );

-- 4. Update tickets policies to allow collaborators to read and update
DROP POLICY IF EXISTS "tickets_select_collaborator" ON public.tickets;
CREATE POLICY "tickets_select_collaborator" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_collaborators tc
      WHERE tc.ticket_id = tickets.id
        AND tc.company_id = tickets.company_id
        AND tc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tickets_update_collaborator" ON public.tickets;
CREATE POLICY "tickets_update_collaborator" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_collaborators tc
      WHERE tc.ticket_id = tickets.id
        AND tc.company_id = tickets.company_id
        AND tc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket_collaborators tc
      WHERE tc.ticket_id = tickets.id
        AND tc.company_id = tickets.company_id
        AND tc.user_id = auth.uid()
    )
  );
