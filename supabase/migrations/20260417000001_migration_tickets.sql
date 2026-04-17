-- ============================================================
-- tickets — customer service ticket submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    TEXT         NOT NULL,
  subject       TEXT         NOT NULL,
  category      TEXT         NOT NULL DEFAULT 'general'
                  CHECK (category IN ('sales_inquiry', 'technical_issue', 'service_request', 'general', 'other')),
  priority      TEXT         NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high')),
  description   TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  submitted_by  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Staff can insert their own tickets
CREATE POLICY "tickets_insert_own" ON public.tickets
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Staff can read their own tickets
CREATE POLICY "tickets_select_own" ON public.tickets
  FOR SELECT
  USING (submitted_by = auth.uid());

-- Admins and super_admin can read all tickets within their company
CREATE POLICY "tickets_select_admin" ON public.tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Admins and super_admin can update any ticket (e.g. change status)
CREATE POLICY "tickets_update_admin" ON public.tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.tickets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_set_updated_at();
