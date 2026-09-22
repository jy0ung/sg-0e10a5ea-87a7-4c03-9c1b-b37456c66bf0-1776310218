-- Atomic Internal Request approval review.
--
-- This purpose-specific command is SECURITY DEFINER because a workflow approver
-- may legitimately approve/reject a request without also holding queue-manager
-- UPDATE/INSERT privileges on tickets/ticket_activity. Authorization is
-- re-established explicitly from the locked approval instance and current
-- workflow routing before any mutation occurs.

CREATE OR REPLACE FUNCTION public.review_internal_request_approval(
  p_company_id text,
  p_ticket_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_employee_id uuid;
  actor_company_id text;
  instance_row public.approval_instances%ROWTYPE;
  ticket_row public.tickets%ROWTYPE;
  current_step public.approval_steps%ROWTYPE;
  next_step public.approval_steps%ROWTYPE;
  normalized_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  decided_at timestamptz := now();
  is_assigned boolean := false;
  next_approver_role text := NULL;
  next_approver_user_id uuid := NULL;
  next_role_id uuid;
  next_role_has_assignee boolean := false;
  requester_employee_id uuid;
  manager_employee_id uuid;
  current_status text;
  final_decision boolean := false;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to review an Internal Request'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(COALESCE(p_company_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Company is required'
      USING ERRCODE = '23514';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.company_id, p.employee_id
    INTO actor_company_id, actor_employee_id
    FROM public.profiles p
   WHERE p.id = actor_id;

  IF NOT FOUND OR actor_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Approval reviewer does not belong to the request company'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize all review attempts for this canonical workflow instance.
  SELECT ai.*
    INTO instance_row
    FROM public.approval_instances ai
   WHERE ai.company_id = p_company_id
     AND ai.entity_type = 'internal_request'
     AND ai.entity_id = p_ticket_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request does not have an approval workflow'
      USING ERRCODE = '23503';
  END IF;

  IF instance_row.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This request approval is already %', instance_row.status
      USING ERRCODE = '23514';
  END IF;

  IF instance_row.current_step_id IS NULL THEN
    RAISE EXCEPTION 'Approval instance has no current step'
      USING ERRCODE = '23514';
  END IF;

  SELECT t.*
    INTO ticket_row
    FROM public.tickets t
   WHERE t.id = p_ticket_id
     AND t.company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT s.*
    INTO current_step
    FROM public.approval_steps s
   WHERE s.id = instance_row.current_step_id
     AND s.flow_id = instance_row.flow_id
     AND s.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The current active approval step could not be resolved'
      USING ERRCODE = '23514';
  END IF;

  IF instance_row.requester_id = actor_id
     AND NOT COALESCE(current_step.allow_self_approval, false) THEN
    RAISE EXCEPTION 'You cannot approve or reject your own request'
      USING ERRCODE = '42501';
  END IF;

  -- Current routing is materialized on approval_instances. Direct-manager and
  -- specific-user steps therefore authorize through current_approver_user_id.
  IF instance_row.current_approver_user_id = actor_id THEN
    is_assigned := true;
  ELSIF instance_row.current_approver_role IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.employee_hrms_role_assignments assignment
        JOIN public.hrms_roles role
          ON role.id = assignment.hrms_role_id
       WHERE assignment.company_id = p_company_id
         AND role.company_id = p_company_id
         AND role.is_active
         AND assignment.hrms_role_id::text = instance_row.current_approver_role
         AND (
           assignment.profile_id = actor_id
           OR (
             actor_employee_id IS NOT NULL
             AND assignment.employee_id = actor_employee_id
           )
         )
    )
    INTO is_assigned;
  END IF;

  IF NOT is_assigned THEN
    RAISE EXCEPTION 'You are not the assigned approver for the current step'
      USING ERRCODE = '42501';
  END IF;

  -- The instance row lock above prevents a second reviewer from observing and
  -- deciding the same pending step after this transaction commits.
  INSERT INTO public.approval_decisions (
    instance_id,
    step_id,
    step_order,
    approver_id,
    decision,
    note,
    decided_at
  )
  VALUES (
    instance_row.id,
    current_step.id,
    current_step.step_order,
    actor_id,
    p_decision::public.approval_decision,
    normalized_note,
    decided_at
  );

  IF p_decision = 'rejected' THEN
    final_decision := true;
    current_status := 'rejected';

    UPDATE public.approval_instances
       SET status = 'rejected',
           current_step_id = NULL,
           current_step_order = NULL,
           current_step_name = NULL,
           current_approver_role = NULL,
           current_approver_user_id = NULL,
           updated_at = decided_at
     WHERE id = instance_row.id;

    UPDATE public.tickets
       SET status = 'cancelled',
           resolved_at = decided_at,
           resolution_note = COALESCE(
             normalized_note,
             'Request rejected during approval.'
           ),
           last_action_by = actor_id
     WHERE id = ticket_row.id
       AND company_id = p_company_id;

    INSERT INTO public.ticket_activity (
      ticket_id,
      company_id,
      actor_id,
      event_type,
      message,
      metadata
    )
    VALUES (
      ticket_row.id,
      p_company_id,
      actor_id,
      'status_changed',
      'Request rejected during approval.',
      jsonb_build_object(
        'before', ticket_row.status,
        'after', 'cancelled',
        'approvalStep', current_step.name,
        'note', normalized_note
      )
    );
  ELSE
    -- Find only the next active step; inactive workflow definitions are skipped.
    SELECT s.*
      INTO next_step
      FROM public.approval_steps s
     WHERE s.flow_id = instance_row.flow_id
       AND s.is_active
       AND s.step_order > current_step.step_order
     ORDER BY s.step_order
     LIMIT 1;

    IF FOUND THEN
      current_status := 'pending';

      IF next_step.approver_type = 'role' THEN
        IF NULLIF(btrim(COALESCE(next_step.approver_role, '')), '') IS NULL THEN
          RAISE EXCEPTION 'Approval step % is missing an HRMS role', next_step.name
            USING ERRCODE = '23514';
        END IF;

        IF next_step.approver_role ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN
          next_role_id := next_step.approver_role::uuid;

          IF NOT EXISTS (
            SELECT 1
              FROM public.hrms_roles r
             WHERE r.id = next_role_id
               AND r.company_id = p_company_id
               AND r.is_active
          ) THEN
            RAISE EXCEPTION 'Approval step % references an inactive or invalid HRMS role', next_step.name
              USING ERRCODE = '23514';
          END IF;

          SELECT EXISTS (
            SELECT 1
              FROM public.employee_hrms_role_assignments a
             WHERE a.company_id = p_company_id
               AND a.hrms_role_id = next_role_id
          )
          INTO next_role_has_assignee;

          IF next_role_has_assignee THEN
            next_approver_role := next_role_id::text;
          ELSIF next_step.fallback_approver_user_id IS NOT NULL THEN
            IF NOT EXISTS (
              SELECT 1
                FROM public.profiles p
               WHERE p.id = next_step.fallback_approver_user_id
                 AND (
                   p.company_id = p_company_id
                   OR p.access_scope = 'global'
                 )
            ) THEN
              RAISE EXCEPTION 'Approval step % fallback approver is invalid for this company', next_step.name
                USING ERRCODE = '23514';
            END IF;
            next_approver_user_id := next_step.fallback_approver_user_id;
          ELSE
            next_approver_role := next_role_id::text;
          END IF;
        ELSE
          -- Legacy role-key compatibility. Existing migrations normally convert
          -- these to HRMS role UUIDs; preserve the stored key when encountered.
          next_approver_role := next_step.approver_role;
        END IF;

      ELSIF next_step.approver_type = 'specific_user' THEN
        IF next_step.approver_user_id IS NULL THEN
          RAISE EXCEPTION 'Approval step % is missing a specific approver', next_step.name
            USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM public.profiles p
           WHERE p.id = next_step.approver_user_id
             AND (
               p.company_id = p_company_id
               OR p.access_scope = 'global'
             )
        ) THEN
          RAISE EXCEPTION 'Approval step % approver is invalid for this company', next_step.name
            USING ERRCODE = '23514';
        END IF;

        next_approver_user_id := next_step.approver_user_id;

      ELSIF next_step.approver_type = 'direct_manager' THEN
        SELECT p.employee_id
          INTO requester_employee_id
          FROM public.profiles p
         WHERE p.id = instance_row.requester_id
           AND p.company_id = p_company_id;

        IF requester_employee_id IS NULL THEN
          RAISE EXCEPTION 'The requester must be linked to a workforce employee for direct-manager approval routing'
            USING ERRCODE = '23514';
        END IF;

        SELECT e.manager_employee_id
          INTO manager_employee_id
          FROM public.employees e
         WHERE e.id = requester_employee_id
           AND e.company_id = p_company_id;

        IF manager_employee_id IS NULL THEN
          RAISE EXCEPTION 'The requester does not have a reporting manager assigned for the active approval flow'
            USING ERRCODE = '23514';
        END IF;

        SELECT p.id
          INTO next_approver_user_id
          FROM public.profiles p
         WHERE p.employee_id = manager_employee_id
           AND (
             p.company_id = p_company_id
             OR p.access_scope = 'global'
           )
         ORDER BY
           CASE WHEN p.company_id = p_company_id THEN 0 ELSE 1 END,
           p.id
         LIMIT 1;

        IF next_approver_user_id IS NULL THEN
          RAISE EXCEPTION 'The requester reporting manager does not have a linked user profile'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'Approval step % has unsupported approver type %',
          next_step.name, next_step.approver_type
          USING ERRCODE = '23514';
      END IF;

      UPDATE public.approval_instances
         SET current_step_id = next_step.id,
             current_step_order = next_step.step_order,
             current_step_name = next_step.name,
             current_approver_role = next_approver_role,
             current_approver_user_id = next_approver_user_id,
             updated_at = decided_at
       WHERE id = instance_row.id;
    ELSE
      final_decision := true;
      current_status := 'approved';

      UPDATE public.approval_instances
         SET status = 'approved',
             current_step_id = NULL,
             current_step_order = NULL,
             current_step_name = NULL,
             current_approver_role = NULL,
             current_approver_user_id = NULL,
             updated_at = decided_at
       WHERE id = instance_row.id;

      INSERT INTO public.ticket_activity (
        ticket_id,
        company_id,
        actor_id,
        event_type,
        message,
        metadata
      )
      VALUES (
        ticket_row.id,
        p_company_id,
        actor_id,
        'comment_added',
        'Request approval completed.',
        jsonb_build_object(
          'approvalStep', current_step.name,
          'note', normalized_note
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'instanceId', instance_row.id,
    'ticketId', ticket_row.id,
    'ticketSubmittedBy', ticket_row.submitted_by,
    'ticketSubject', ticket_row.subject,
    'decision', p_decision,
    'stepName', current_step.name,
    'finalDecision', final_decision,
    'nextStepName', CASE WHEN next_step.id IS NULL THEN NULL ELSE next_step.name END,
    'nextApproverRole', next_approver_role,
    'nextApproverUserId', next_approver_user_id,
    'approvalStatus', current_status,
    'decidedAt', decided_at
  );
END
$$;

REVOKE ALL
  ON FUNCTION public.review_internal_request_approval(text, uuid, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.review_internal_request_approval(text, uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.review_internal_request_approval(text, uuid, text, text) IS
  'Atomically reviews the current pending Internal Request approval step after explicitly verifying the materialized workflow approver.';
