-- Atomic, concurrency-safe Internal Request approval review.
--
-- The Approval Instance row is the serialization boundary. Business-state
-- changes (Decision, Instance, Ticket, Activity) commit in one transaction.
-- Notifications/audit remain application-side best-effort after success.

CREATE OR REPLACE FUNCTION public.review_internal_request_approval(
  p_company_id text,
  p_ticket_id uuid,
  p_expected_step_id uuid,
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
  approval public.approval_instances%ROWTYPE;
  request_ticket public.tickets%ROWTYPE;
  current_step public.approval_steps%ROWTYPE;
  next_step public.approval_steps%ROWTYPE;
  next_role public.hrms_roles%ROWTYPE;
  next_approver_role text;
  next_approver_user_id uuid;
  requester_employee_id uuid;
  requester_manager_employee_id uuid;
  normalized_note text := NULLIF(btrim(p_note), '');
  decided_at timestamptz := now();
  is_assigned boolean := false;
  has_next_step boolean := false;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to review an Internal Request'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_company_id), '') IS NULL THEN
    RAISE EXCEPTION 'Company is required'
      USING ERRCODE = '23514';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Approval decision must be approved or rejected'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.employee_id
    INTO actor_employee_id
    FROM public.profiles p
   WHERE p.id = actor_id
     AND (
       p.company_id = p_company_id
       OR p.access_scope = 'global'
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reviewer Profile does not belong to the request company'
      USING ERRCODE = '42501';
  END IF;

  SELECT ai.*
    INTO approval
    FROM public.approval_instances ai
   WHERE ai.company_id = p_company_id
     AND ai.entity_type = 'internal_request'
     AND ai.entity_id = p_ticket_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request does not have an approval workflow'
      USING ERRCODE = 'P0002';
  END IF;

  IF approval.status <> 'pending' THEN
    RAISE EXCEPTION 'This request approval is already %', approval.status
      USING ERRCODE = '23514';
  END IF;

  IF approval.current_step_id IS NULL THEN
    RAISE EXCEPTION 'Approval instance has no current step'
      USING ERRCODE = '23514';
  END IF;

  IF p_expected_step_id IS NULL
     OR approval.current_step_id IS DISTINCT FROM p_expected_step_id THEN
    RAISE EXCEPTION 'Approval review is stale because the current step has changed'
      USING ERRCODE = '40001';
  END IF;

  SELECT t.*
    INTO request_ticket
    FROM public.tickets t
   WHERE t.id = p_ticket_id
     AND t.company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found in the approval company'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT s.*
    INTO current_step
    FROM public.approval_steps s
   WHERE s.id = approval.current_step_id
     AND s.flow_id = approval.flow_id
     AND s.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The current approval step could not be resolved'
      USING ERRCODE = '23514';
  END IF;

  IF approval.current_step_order IS DISTINCT FROM current_step.step_order THEN
    RAISE EXCEPTION 'Approval instance current step order is stale'
      USING ERRCODE = '23514';
  END IF;

  IF approval.requester_id = actor_id
     AND NOT COALESCE(current_step.allow_self_approval, false) THEN
    RAISE EXCEPTION 'You cannot approve or reject your own request'
      USING ERRCODE = '42501';
  END IF;

  IF approval.current_approver_user_id = actor_id THEN
    is_assigned := true;
  ELSIF approval.current_approver_role IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.employee_hrms_role_assignments a
        JOIN public.hrms_roles r
          ON r.id = a.hrms_role_id
         AND r.company_id = p_company_id
         AND r.is_active
       WHERE a.company_id = p_company_id
         AND (
           r.id::text = approval.current_approver_role
           OR r.code = approval.current_approver_role
         )
         AND (
           a.profile_id = actor_id
           OR (
             actor_employee_id IS NOT NULL
             AND a.employee_id = actor_employee_id
           )
         )
    ) INTO is_assigned;
  END IF;

  IF NOT is_assigned THEN
    RAISE EXCEPTION 'You are not the assigned approver for the current step'
      USING ERRCODE = '42501';
  END IF;

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
    approval.id,
    current_step.id,
    current_step.step_order,
    actor_id,
    p_decision,
    normalized_note,
    decided_at
  );

  IF p_decision = 'rejected' THEN
    UPDATE public.approval_instances
       SET status = 'rejected',
           current_step_id = NULL,
           current_step_order = NULL,
           current_step_name = NULL,
           current_approver_role = NULL,
           current_approver_user_id = NULL,
           updated_at = decided_at
     WHERE id = approval.id;

    UPDATE public.tickets
       SET status = 'cancelled',
           resolved_at = decided_at,
           resolution_note = COALESCE(
             normalized_note,
             'Request rejected during approval.'
           ),
           last_action_by = actor_id
     WHERE id = request_ticket.id
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
      request_ticket.id,
      p_company_id,
      actor_id,
      'status_changed',
      'Request rejected during approval.',
      jsonb_build_object(
        'before', request_ticket.status,
        'after', 'cancelled',
        'approvalStep', current_step.name,
        'note', normalized_note
      )
    );

    RETURN jsonb_build_object(
      'instanceId', approval.id,
      'ticketId', request_ticket.id,
      'submittedBy', request_ticket.submitted_by,
      'subject', request_ticket.subject,
      'decision', p_decision,
      'approvalStep', current_step.name,
      'finalDecision', true,
      'nextApprovalStep', NULL
    );
  END IF;

  SELECT s.*
    INTO next_step
    FROM public.approval_steps s
   WHERE s.flow_id = approval.flow_id
     AND s.is_active
     AND s.step_order > current_step.step_order
   ORDER BY s.step_order, s.id
   LIMIT 1;

  has_next_step := FOUND;

  IF has_next_step THEN
    next_approver_role := NULL;
    next_approver_user_id := NULL;

    IF next_step.approver_type = 'role' THEN
      IF NULLIF(btrim(COALESCE(next_step.approver_role, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Approval step % is missing an HRMS role', next_step.name
          USING ERRCODE = '23514';
      END IF;

      SELECT r.*
        INTO next_role
        FROM public.hrms_roles r
       WHERE r.company_id = p_company_id
         AND r.is_active
         AND (
           r.id::text = next_step.approver_role
           OR r.code = next_step.approver_role
         )
       ORDER BY
         CASE WHEN r.id::text = next_step.approver_role THEN 0 ELSE 1 END,
         r.id
       LIMIT 1;

      IF FOUND AND EXISTS (
        SELECT 1
          FROM public.employee_hrms_role_assignments a
         WHERE a.company_id = p_company_id
           AND a.hrms_role_id = next_role.id
      ) THEN
        next_approver_role := next_role.id::text;
      ELSE
        IF next_step.fallback_approver_user_id IS NULL THEN
          RAISE EXCEPTION
            'Approval step % has no active HRMS Role assignee and no fallback approver',
            next_step.name
            USING ERRCODE = '23514';
        END IF;

        PERFORM 1
          FROM public.profiles p
         WHERE p.id = next_step.fallback_approver_user_id
           AND (
             p.company_id = p_company_id
             OR p.access_scope = 'global'
           );

        IF NOT FOUND THEN
          RAISE EXCEPTION
            'Approval step % fallback Profile is not valid for this company',
            next_step.name
            USING ERRCODE = '23514';
        END IF;

        next_approver_user_id := next_step.fallback_approver_user_id;
      END IF;

    ELSIF next_step.approver_type = 'specific_user' THEN
      IF next_step.approver_user_id IS NULL THEN
        RAISE EXCEPTION 'Approval step % is missing a specific approver', next_step.name
          USING ERRCODE = '23514';
      END IF;

      PERFORM 1
        FROM public.profiles p
       WHERE p.id = next_step.approver_user_id
         AND (
           p.company_id = p_company_id
           OR p.access_scope = 'global'
         );

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Approval step % specific approver is not valid for this company',
          next_step.name
          USING ERRCODE = '23514';
      END IF;

      next_approver_user_id := next_step.approver_user_id;

    ELSIF next_step.approver_type = 'direct_manager' THEN
      SELECT p.employee_id
        INTO requester_employee_id
        FROM public.profiles p
       WHERE p.id = approval.requester_id
         AND (
           p.company_id = p_company_id
           OR p.access_scope = 'global'
         );

      IF requester_employee_id IS NULL THEN
        RAISE EXCEPTION
          'The requester must be linked to a workforce Employee for direct-manager approval routing'
          USING ERRCODE = '23514';
      END IF;

      SELECT e.requester_manager_employee_id
        INTO requester_manager_employee_id
        FROM public.employees e
       WHERE e.id = requester_employee_id
         AND e.company_id = p_company_id;

      IF requester_manager_employee_id IS NULL THEN
        RAISE EXCEPTION
          'The requester does not have a reporting manager assigned for the active Approval Flow'
          USING ERRCODE = '23514';
      END IF;

      SELECT p.id
        INTO next_approver_user_id
        FROM public.profiles p
        JOIN public.employees manager_employee
          ON manager_employee.id = p.employee_id
         AND manager_employee.id = requester_manager_employee_id
         AND manager_employee.company_id = p_company_id
       WHERE p.company_id = p_company_id
          OR p.access_scope = 'global'
       ORDER BY
         CASE WHEN p.company_id = p_company_id THEN 0 ELSE 1 END,
         p.id
       LIMIT 1;

      IF next_approver_user_id IS NULL THEN
        RAISE EXCEPTION
          'The requester reporting manager does not have a linked user Profile'
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
     WHERE id = approval.id;

    RETURN jsonb_build_object(
      'instanceId', approval.id,
      'ticketId', request_ticket.id,
      'submittedBy', request_ticket.submitted_by,
      'subject', request_ticket.subject,
      'decision', p_decision,
      'approvalStep', current_step.name,
      'finalDecision', false,
      'nextApprovalStep', next_step.name
    );
  END IF;

  UPDATE public.approval_instances
     SET status = 'approved',
         current_step_id = NULL,
         current_step_order = NULL,
         current_step_name = NULL,
         current_approver_role = NULL,
         current_approver_user_id = NULL,
         updated_at = decided_at
   WHERE id = approval.id;

  INSERT INTO public.ticket_activity (
    ticket_id,
    company_id,
    actor_id,
    event_type,
    message,
    metadata
  )
  VALUES (
    request_ticket.id,
    p_company_id,
    actor_id,
    'comment_added',
    'Request approval completed.',
    jsonb_build_object(
      'approvalStep', current_step.name,
      'note', normalized_note
    )
  );

  RETURN jsonb_build_object(
    'instanceId', approval.id,
    'ticketId', request_ticket.id,
    'submittedBy', request_ticket.submitted_by,
    'subject', request_ticket.subject,
    'decision', p_decision,
    'approvalStep', current_step.name,
    'finalDecision', true,
    'nextApprovalStep', NULL
  );
END
$$;

REVOKE ALL
  ON FUNCTION public.review_internal_request_approval(text, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.review_internal_request_approval(text, uuid, uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.review_internal_request_approval(text, uuid, uuid, text, text) IS
  'Atomically reviews one pending Internal Request Approval Instance under row lock, including Decision, Instance, Ticket, and Activity state.';
