-- Migration for Portal Redesign Phase 2: Core Workflows & Logic

-- 1. Auto-Close System
-- Function to automatically close resolved tickets after 3 days
CREATE OR REPLACE FUNCTION public.auto_close_resolved_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT id, company_id, assigned_to, last_action_by, submitted_by
    FROM public.tickets
    WHERE status = 'completed_by_owner'
      AND status_changed_at < now() - interval '3 days'
  ),
  updated_tickets AS (
    UPDATE public.tickets t
    SET 
      status = 'closed',
      closed_at = now(),
      closure_confirmed = false,
      status_changed_at = now(),
      current_responsible_party = 'None',
      next_action = 'No further action',
      last_action_by = NULL,
      updated_at = now()
    FROM candidates c
    WHERE t.id = c.id
      AND t.company_id = c.company_id
    RETURNING c.id, c.company_id, c.assigned_to, c.last_action_by, c.submitted_by
  ),
  activity AS (
    INSERT INTO public.ticket_activity (
      ticket_id, company_id, actor_id, event_type, message, metadata
    )
    SELECT
      id,
      company_id,
      coalesce(assigned_to, last_action_by, submitted_by),
      'status_changed',
      'Request auto-closed after 3 days without requester confirmation.',
      jsonb_build_object('before', 'completed_by_owner', 'after', 'closed', 'auto_close', true, 'auto_close_days', 3)
    FROM updated_tickets
    RETURNING 1
  )
  SELECT count(*) INTO closed_count FROM updated_tickets;

  RETURN closed_count;
END;
$$;

-- 2. Status Automation Triggers
-- Add a function to handle 'Reply & Wait' macro which changes status and pauses SLA
CREATE OR REPLACE FUNCTION public.ticket_reply_and_wait(
  p_ticket_id uuid,
  p_company_id text,
  p_message text
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.tickets;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify access
  SELECT * INTO v_ticket
  FROM public.tickets
  WHERE id = p_ticket_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  -- Add internal/external comment to ticket_activity
  INSERT INTO public.ticket_activity (
    ticket_id, company_id, actor_id, event_type, message, metadata
  ) VALUES (
    p_ticket_id, p_company_id, auth.uid(), 'comment_added', p_message,
    jsonb_build_object('is_macro', true)
  );

  -- Update status to pending_requester and pause SLA
  UPDATE public.tickets
  SET 
    status = 'pending_requester',
    current_responsible_party = 'Requester',
    next_action = 'Requester to provide information',
    sla_status = 'paused',
    sla_paused_at = now(),
    status_changed_at = now(),
    last_action_by = auth.uid()
  WHERE id = p_ticket_id
    AND company_id = p_company_id
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$$;

-- 3. Reassignment Logic
-- Function to safely reassign a ticket and enforce a transition note
CREATE OR REPLACE FUNCTION public.reassign_ticket(
  p_ticket_id uuid,
  p_company_id text,
  p_new_owner_id uuid,
  p_transition_note text
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.tickets;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF trim(p_transition_note) = '' OR p_transition_note IS NULL THEN
    RAISE EXCEPTION 'A transition note is required when reassigning a ticket.';
  END IF;

  -- Verify access
  SELECT * INTO v_ticket
  FROM public.tickets
  WHERE id = p_ticket_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  -- Update owner
  UPDATE public.tickets
  SET 
    previous_owner_id = assigned_to,
    assigned_to = p_new_owner_id,
    assigned_at = now(),
    current_responsible_party = 'Owner',
    next_action = 'Owner to resolve request',
    last_action_by = auth.uid()
  WHERE id = p_ticket_id
    AND company_id = p_company_id
  RETURNING * INTO v_ticket;

  -- Log the assignment activity with the required note
  INSERT INTO public.ticket_activity (
    ticket_id, company_id, actor_id, event_type, message, metadata
  ) VALUES (
    p_ticket_id, p_company_id, auth.uid(), 'owner_changed',
    p_transition_note,
    jsonb_build_object(
      'previous_owner_id', v_ticket.previous_owner_id,
      'new_owner_id', p_new_owner_id,
      'transition_note', p_transition_note
    )
  );

  RETURN v_ticket;
END;
$$;
