-- ============================================================
-- Auto Aging import review queue
-- ============================================================

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS published_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.import_review_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  source_row_id text,
  chassis_no text,
  branch_code text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_reason text NOT NULL CHECK (review_reason IN ('incomplete', 'blocking', 'mixed')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_review', 'resolved', 'discarded')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_import_review_rows_company_status
  ON public.import_review_rows (company_id, review_status);

CREATE INDEX IF NOT EXISTS idx_import_review_rows_batch_row
  ON public.import_review_rows (import_batch_id, row_number);

CREATE INDEX IF NOT EXISTS idx_import_review_rows_batch_status
  ON public.import_review_rows (import_batch_id, review_status);

CREATE INDEX IF NOT EXISTS idx_import_review_rows_company_chassis
  ON public.import_review_rows (company_id, chassis_no);

COMMENT ON TABLE public.import_review_rows IS 'Rows held back from Auto Aging vehicle publish until operators review and resolve them.';

ALTER TABLE public.import_review_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scoped read on import_review_rows"
  ON public.import_review_rows FOR SELECT TO authenticated
  USING (public.can_access_row(company_id, COALESCE(branch_code, ''), assigned_to));

CREATE POLICY "Scoped insert on import_review_rows"
  ON public.import_review_rows FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );

CREATE POLICY "Scoped update on import_review_rows"
  ON public.import_review_rows FOR UPDATE TO authenticated
  USING (public.can_access_row(company_id, COALESCE(branch_code, ''), assigned_to))
  WITH CHECK (public.can_access_row(company_id, COALESCE(branch_code, ''), assigned_to));

CREATE POLICY "Scoped delete on import_review_rows"
  ON public.import_review_rows FOR DELETE TO authenticated
  USING (public.can_access_row(company_id, COALESCE(branch_code, ''), assigned_to));

CREATE OR REPLACE FUNCTION public.fn_touch_import_review_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_import_review_rows ON public.import_review_rows;
CREATE TRIGGER trg_touch_import_review_rows
  BEFORE UPDATE ON public.import_review_rows
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_import_review_rows();