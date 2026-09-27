-- Give the materialized Internal Request approver the same ticket visibility as
-- the atomic review command, and expose only that approver's pending work.

CREATE OR REPLACE FUNCTION public.internal_request_reviewer_is_current(
  p_company_id text,
  p_ticket_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_employee_id uuid;
BEGIN
  IF actor_id IS NULL OR p_company_id IS NULL OR p_ticket_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.employee_id INTO actor_employee_id
    FROM public.profiles p
   WHERE p.id = actor_id
     AND p.status = 'active'
     AND (p.company_id = p_company_id OR p.access_scope = 'global');
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.approval_instances ai
      JOIN public.approval_steps s
        ON s.id = ai.current_step_id
       AND s.flow_id = ai.flow_id
       AND s.step_order = ai.current_step_order
       AND s.is_active
     WHERE ai.company_id = p_company_id
       AND ai.entity_type = 'internal_request'
       AND ai.entity_id = p_ticket_id
       AND ai.status = 'pending'
       AND (ai.requester_id <> actor_id OR COALESCE(s.allow_self_approval, false))
       AND (
         ai.current_approver_user_id = actor_id
         OR (
           ai.current_approver_user_id IS NULL
           AND ai.current_approver_role IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.employee_hrms_role_assignments a
               JOIN public.hrms_roles r
                 ON r.id = a.hrms_role_id
                AND r.company_id = p_company_id
                AND r.is_active
              WHERE a.company_id = p_company_id
                AND (r.id::text = ai.current_approver_role OR r.code = ai.current_approver_role)
                AND (a.profile_id = actor_id OR (actor_employee_id IS NOT NULL AND a.employee_id = actor_employee_id))
           )
         )
       )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_request_reviewer_can_read_ticket(
  p_company_id text,
  p_ticket_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF public.internal_request_reviewer_is_current(p_company_id, p_ticket_id) THEN
    RETURN true;
  END IF;

  RETURN actor_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.approval_instances ai
        ON ai.company_id = p_company_id
       AND ai.entity_type = 'internal_request'
       AND ai.entity_id = p_ticket_id
      JOIN public.approval_decisions d
        ON d.instance_id = ai.id
       AND d.approver_id = actor_id
     WHERE p.id = actor_id
       AND p.status = 'active'
       AND (p.company_id = p_company_id OR p.access_scope = 'global')
  );
END;
$$;

DROP POLICY IF EXISTS "tickets_select_internal_request_reviewer" ON public.tickets;
CREATE POLICY "tickets_select_internal_request_reviewer" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.internal_request_reviewer_can_read_ticket(company_id, id));

CREATE OR REPLACE FUNCTION public.list_my_pending_internal_request_approvals(
  p_company_id text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  instance_id uuid,
  ticket_id uuid,
  subject text,
  priority text,
  current_step_name text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ai.id, t.id, t.subject, t.priority::text, ai.current_step_name, ai.updated_at
    FROM public.approval_instances ai
    JOIN public.tickets t
      ON t.id = ai.entity_id
     AND t.company_id = ai.company_id
   WHERE ai.company_id = p_company_id
     AND ai.entity_type = 'internal_request'
     AND ai.status = 'pending'
     AND public.internal_request_reviewer_is_current(ai.company_id, ai.entity_id)
   ORDER BY ai.updated_at DESC, ai.id DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE INDEX IF NOT EXISTS idx_internal_request_pending_approval_inbox
  ON public.approval_instances (company_id, updated_at DESC)
  WHERE entity_type = 'internal_request' AND status = 'pending';

REVOKE ALL ON FUNCTION public.internal_request_reviewer_is_current(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.internal_request_reviewer_can_read_ticket(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_pending_internal_request_approvals(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_request_reviewer_is_current(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_request_reviewer_can_read_ticket(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_pending_internal_request_approvals(text, integer) TO authenticated;
