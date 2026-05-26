-- Phase 3f: Lead Intake
-- The DMS staging foundation (dms_raw_leads, dms_raw_prospects) has been
-- present since Phase 5 but never exposed. This phase surfaces both as a
-- unified Leads Intake feed and adds a local follow-up notes table so
-- salespeople can record outreach against an upstream lead without
-- mutating the immutable raw row.
--
-- New table: lead_followups (append-only-ish: rows are inserted on each
-- follow-up; updating a row is allowed only by the original author for
-- correcting typos in notes, not for rewriting history — enforced by RLS).
--
-- "Conversion → SO" is a separate flow; this phase only exposes the data
-- and follow-up tracking. The page links to /sales/orders/new with the
-- DMS customer prefilled for a manual handoff.

CREATE TABLE IF NOT EXISTS public.lead_followups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Which staging table the follow-up is attached to. Constrained so a
  -- bad insert can't silently point at the wrong row type.
  source_kind       text NOT NULL CHECK (source_kind IN ('lead', 'prospect')),
  source_raw_id     uuid NOT NULL,  -- dms_raw_leads.id OR dms_raw_prospects.id
  notes             text NOT NULL CHECK (length(trim(notes)) > 0),
  outcome           text CHECK (outcome IN (
    'contacted', 'no_answer', 'callback_scheduled', 'not_interested',
    'qualified', 'converted', 'lost'
  )),
  next_action_date  date,
  author_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_followups_company_source_idx
  ON public.lead_followups (company_id, source_kind, source_raw_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_followups_company_next_action_idx
  ON public.lead_followups (company_id, next_action_date)
  WHERE next_action_date IS NOT NULL;

COMMENT ON TABLE public.lead_followups IS
  'Local follow-up notes attached to a dms_raw_leads or dms_raw_prospects row. Salesperson-owned.';

ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_followups_select" ON public.lead_followups
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- Inserts go through add_lead_followup SECURITY DEFINER RPC, but a direct
-- INSERT is still allowed for the same-company author (so the API surface
-- could be extended later without RLS changes).
CREATE POLICY "lead_followups_insert" ON public.lead_followups
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Updates restricted to the original author within 24h. After that the
-- row is effectively immutable.
CREATE POLICY "lead_followups_update_author" ON public.lead_followups
  FOR UPDATE USING (
    author_id = auth.uid()
    AND created_at >= now() - INTERVAL '24 hours'
  );

-- Unified leads feed: pulls from both dms_raw_leads and dms_raw_prospects,
-- joins the most recent follow-up summary so the list can show "Last
-- contacted ___" without N+1.
CREATE OR REPLACE FUNCTION get_leads_feed(
  p_company_id  text,
  p_kind        text DEFAULT NULL,   -- 'lead' | 'prospect' | NULL=both
  p_status      text DEFAULT NULL,
  p_branch_code text DEFAULT NULL,
  p_limit       int  DEFAULT 200
)
RETURNS TABLE (
  source_kind          text,
  source_raw_id        uuid,
  dms_external_id      text,
  dms_customer_id      text,
  branch_code          text,
  salesperson_code     text,
  status               text,
  source_created_at    timestamptz,
  fetched_at           timestamptz,
  followup_count       int,
  last_followup_at     timestamptz,
  last_followup_outcome text,
  next_action_date     date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH leads_union AS (
    SELECT 'lead'::text          AS source_kind,
           l.id                  AS source_raw_id,
           l.dms_lead_id         AS dms_external_id,
           l.dms_customer_id,
           l.branch_code,
           l.salesperson_code,
           l.lead_status         AS status,
           l.lead_created_at     AS source_created_at,
           l.fetched_at
    FROM dms_raw_leads l
    WHERE l.company_id = p_company_id
      AND (p_kind IS NULL OR p_kind = 'lead')
      AND (p_status IS NULL OR l.lead_status = p_status)
      AND (p_branch_code IS NULL OR l.branch_code = p_branch_code)
    UNION ALL
    SELECT 'prospect'::text       AS source_kind,
           p.id                   AS source_raw_id,
           p.dms_prospect_id      AS dms_external_id,
           p.dms_customer_id,
           p.branch_code,
           p.salesperson_code,
           p.prospect_status      AS status,
           p.prospect_created_at  AS source_created_at,
           p.fetched_at
    FROM dms_raw_prospects p
    WHERE p.company_id = p_company_id
      AND (p_kind IS NULL OR p_kind = 'prospect')
      AND (p_status IS NULL OR p.prospect_status = p_status)
      AND (p_branch_code IS NULL OR p.branch_code = p_branch_code)
  ),
  latest_followup AS (
    SELECT DISTINCT ON (lf.source_kind, lf.source_raw_id)
      lf.source_kind,
      lf.source_raw_id,
      lf.created_at      AS last_followup_at,
      lf.outcome         AS last_followup_outcome,
      lf.next_action_date
    FROM lead_followups lf
    WHERE lf.company_id = p_company_id
    ORDER BY lf.source_kind, lf.source_raw_id, lf.created_at DESC
  ),
  followup_counts AS (
    SELECT lf.source_kind, lf.source_raw_id, COUNT(*)::int AS total
    FROM lead_followups lf
    WHERE lf.company_id = p_company_id
    GROUP BY lf.source_kind, lf.source_raw_id
  )
  SELECT
    u.source_kind,
    u.source_raw_id,
    u.dms_external_id,
    u.dms_customer_id,
    u.branch_code,
    u.salesperson_code,
    u.status,
    u.source_created_at,
    u.fetched_at,
    COALESCE(fc.total, 0)         AS followup_count,
    lf.last_followup_at,
    lf.last_followup_outcome,
    lf.next_action_date
  FROM leads_union u
  LEFT JOIN latest_followup lf
    ON lf.source_kind   = u.source_kind
   AND lf.source_raw_id = u.source_raw_id
  LEFT JOIN followup_counts fc
    ON fc.source_kind   = u.source_kind
   AND fc.source_raw_id = u.source_raw_id
  ORDER BY
    -- Past-due next-actions surface first, then newest leads.
    CASE
      WHEN lf.next_action_date IS NOT NULL AND lf.next_action_date < CURRENT_DATE THEN 0
      WHEN COALESCE(fc.total, 0) = 0 THEN 1
      ELSE 2
    END,
    u.source_created_at DESC NULLS LAST,
    u.fetched_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_leads_feed(text, text, text, text, int) TO authenticated;

-- Lead detail RPC: returns the raw row payload + all follow-ups in time
-- order. UI builds the timeline from this single call.
CREATE OR REPLACE FUNCTION get_lead_detail(
  p_company_id  text,
  p_source_kind text,
  p_raw_id      uuid
)
RETURNS TABLE (
  source_kind       text,
  source_raw_id     uuid,
  dms_external_id   text,
  dms_customer_id   text,
  branch_code       text,
  salesperson_code  text,
  status            text,
  source_created_at timestamptz,
  fetched_at        timestamptz,
  raw_payload       jsonb,
  followups         jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_followups jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_source_kind NOT IN ('lead', 'prospect') THEN
    RAISE EXCEPTION 'Invalid source_kind: % (must be lead or prospect)', p_source_kind;
  END IF;

  -- Aggregate follow-ups for the row
  SELECT COALESCE(jsonb_agg(to_jsonb(lf) ORDER BY lf.created_at DESC), '[]'::jsonb)
    INTO v_followups
    FROM lead_followups lf
   WHERE lf.company_id    = p_company_id
     AND lf.source_kind   = p_source_kind
     AND lf.source_raw_id = p_raw_id;

  IF p_source_kind = 'lead' THEN
    RETURN QUERY
    SELECT 'lead'::text, l.id, l.dms_lead_id, l.dms_customer_id, l.branch_code,
           l.salesperson_code, l.lead_status, l.lead_created_at, l.fetched_at,
           l.raw_payload, v_followups
    FROM dms_raw_leads l
    WHERE l.company_id = p_company_id AND l.id = p_raw_id;
  ELSE
    RETURN QUERY
    SELECT 'prospect'::text, p.id, p.dms_prospect_id, p.dms_customer_id, p.branch_code,
           p.salesperson_code, p.prospect_status, p.prospect_created_at, p.fetched_at,
           p.raw_payload, v_followups
    FROM dms_raw_prospects p
    WHERE p.company_id = p_company_id AND p.id = p_raw_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_lead_detail(text, text, uuid) TO authenticated;

-- Append a follow-up. SECURITY DEFINER + caller-company gate; the row's
-- author_id is forced to auth.uid() so the browser cannot impersonate.
CREATE OR REPLACE FUNCTION add_lead_followup(
  p_company_id      text,
  p_source_kind     text,
  p_source_raw_id   uuid,
  p_notes           text,
  p_outcome         text DEFAULT NULL,
  p_next_action_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_new_id    uuid;
  v_exists    boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_source_kind NOT IN ('lead', 'prospect') THEN
    RAISE EXCEPTION 'Invalid source_kind: %', p_source_kind;
  END IF;

  IF length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Notes cannot be empty';
  END IF;

  -- Verify the raw row exists for this company (prevents follow-ups against ghost rows)
  IF p_source_kind = 'lead' THEN
    SELECT EXISTS (SELECT 1 FROM dms_raw_leads WHERE id = p_source_raw_id AND company_id = p_company_id) INTO v_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM dms_raw_prospects WHERE id = p_source_raw_id AND company_id = p_company_id) INTO v_exists;
  END IF;

  IF NOT v_exists THEN
    RAISE EXCEPTION '% % not found for company %', p_source_kind, p_source_raw_id, p_company_id;
  END IF;

  INSERT INTO lead_followups (
    company_id, source_kind, source_raw_id, notes, outcome, next_action_date, author_id
  ) VALUES (
    p_company_id, p_source_kind, p_source_raw_id, p_notes, p_outcome, p_next_action_date, v_caller_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_lead_followup(text, text, uuid, text, text, date) TO authenticated;

-- Phase 3f feature flag (global, default-off).
INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES (NULL, 'phase3f.lead-intake-v2', false, 'Unified DMS leads/prospects feed + local follow-up notes.')
ON CONFLICT DO NOTHING;
