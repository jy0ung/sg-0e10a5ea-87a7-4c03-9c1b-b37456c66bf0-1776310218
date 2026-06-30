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
  -- We assume 'completed_by_owner' is the 'Resolved' state (from Phase 1 mapping)
  -- If it's been in this state for 3 days without the requester replying, close it.
  WITH updated_tickets AS (
    UPDATE public.tickets
    SET 
      status = 'closed',
      closed_at = now(),
      closure_feedback = 'Auto-closed by system due to inactivity.',
      closure_confirmed = true,
      last_action_by = NULL
    WHERE status = 'completed_by_owner'
      AND status_changed_at < now() - interval '3 days'
    RETURNING id
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
    ticket_id, company_id, actor_id, event_type, metadata
  ) VALUES (
    p_ticket_id, p_company_id, auth.uid(), 'comment_added',
    jsonb_build_object('comment', p_message, 'is_macro', true)
  );

  -- Update status to pending_requester and pause SLA
  UPDATE public.tickets
  SET 
    status = 'pending_requester',
    sla_status = 'paused',
    sla_paused_at = now(),
    last_action_by = auth.uid()
  WHERE id = p_ticket_id
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
    last_action_by = auth.uid()
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  -- Log the assignment activity with the required note
  INSERT INTO public.ticket_activity (
    ticket_id, company_id, actor_id, event_type, metadata
  ) VALUES (
    p_ticket_id, p_company_id, auth.uid(), 'owner_changed',
    jsonb_build_object(
      'previous_owner_id', v_ticket.previous_owner_id,
      'new_owner_id', p_new_owner_id,
      'transition_note', p_transition_note
    )
  );

  RETURN v_ticket;
END;
$$;
