-- ============================================================
-- Migration: Phase 1 Sales Data Model
-- Extends existing tables and adds 7 new pipeline tables.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend vehicles table with inventory / legacy fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS engine_no    text,
  ADD COLUMN IF NOT EXISTS year_model   text,
  ADD COLUMN IF NOT EXISTS colour       text,
  ADD COLUMN IF NOT EXISTS status       text,  -- e.g. AVAILABLE, SOLD, RESERVED
  ADD COLUMN IF NOT EXISTS legacy_id    text,  -- iid from Proton CRM stock_balance.php
  ADD COLUMN IF NOT EXISTS model_code   text,
  ADD COLUMN IF NOT EXISTS branch_name  text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend sales_orders table with legacy / denormalised fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS customer_name       text,   -- denormalised; populated from legacy extract
  ADD COLUMN IF NOT EXISTS ic_no               text,   -- customer IC / company reg no
  ADD COLUMN IF NOT EXISTS legacy_id           text,   -- sbid from Proton CRM customer_sales.php
  ADD COLUMN IF NOT EXISTS order_status        text,   -- sb_status from legacy (e.g. BOOKING, CANCELLED)
  ADD COLUMN IF NOT EXISTS total_amount_bank   numeric(15,2),
  ADD COLUMN IF NOT EXISTS balance_customer    numeric(15,2),
  ADD COLUMN IF NOT EXISTS overall_total       numeric(15,2),
  ADD COLUMN IF NOT EXISTS total_refund_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS last_cancel         date,
  ADD COLUMN IF NOT EXISTS salesman_id         uuid REFERENCES public.sales_advisors(id) ON DELETE SET NULL;

-- Full (non-partial) unique index needed for upsert ON CONFLICT support.
-- NULLs in order_no are ignored by PostgreSQL unique constraints, so
-- multiple NULL order_no rows are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_order_no_company
  ON public.sales_orders (order_no, company_id)
  WHERE order_no IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Status-history audit table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_order_status_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text        NOT NULL,
  changed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  notes       text,
  company_id  text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE
);

ALTER TABLE public.sales_order_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_so_status_hist_order ON public.sales_order_status_history (order_id);

CREATE POLICY "so_status_hist_select" ON public.sales_order_status_history
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "so_status_hist_insert" ON public.sales_order_status_history
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Sales activities (CRM tasks / follow-ups)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_activities (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  customer_id    uuid        REFERENCES public.customers(id)    ON DELETE SET NULL,
  activity_type  text        NOT NULL CHECK (activity_type IN ('call','email','meeting','task','note')),
  subject        text        NOT NULL,
  notes          text,
  due_date       timestamptz,
  completed_at   timestamptz,
  created_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id     text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sales_activities_order    ON public.sales_activities (order_id)    WHERE order_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_activities_customer ON public.sales_activities (customer_id)  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_activities_company  ON public.sales_activities (company_id);

CREATE POLICY "sales_activities_select" ON public.sales_activities
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "sales_activities_insert" ON public.sales_activities
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "sales_activities_update" ON public.sales_activities
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "sales_activities_delete" ON public.sales_activities
  FOR DELETE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Loan applications (HP / bank financing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loan_applications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  lender          text        NOT NULL,
  applied_amount  numeric(15,2),
  approved_amount numeric(15,2),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected','disbursed')),
  applied_date    date,
  approved_date   date,
  disbursed_date  date,
  notes           text,
  company_id      text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_loan_applications_order   ON public.loan_applications (order_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_company ON public.loan_applications (company_id);

CREATE POLICY "loan_applications_select" ON public.loan_applications
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "loan_applications_insert" ON public.loan_applications
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "loan_applications_update" ON public.loan_applications
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Registration records (JPJ / vehicle plate)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registration_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  jpj_ref          text,
  plate_no         text,
  submitted_date   date,
  registered_date  date,
  status           text        NOT NULL DEFAULT 'pending',
  notes            text,
  company_id       text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registration_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reg_records_order   ON public.registration_records (order_id);
CREATE INDEX IF NOT EXISTS idx_reg_records_company ON public.registration_records (company_id);

CREATE POLICY "registration_records_select" ON public.registration_records
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "registration_records_insert" ON public.registration_records
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "registration_records_update" ON public.registration_records
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Insurance cover notes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insurance_cover_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  insurer       text        NOT NULL,
  policy_no     text,
  cover_note_no text,
  premium       numeric(15,2),
  start_date    date,
  expiry_date   date,
  status        text        NOT NULL DEFAULT 'active',
  company_id    text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insurance_cover_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_insurance_order   ON public.insurance_cover_notes (order_id);
CREATE INDEX IF NOT EXISTS idx_insurance_company ON public.insurance_cover_notes (company_id);

CREATE POLICY "insurance_cover_notes_select" ON public.insurance_cover_notes
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "insurance_cover_notes_insert" ON public.insurance_cover_notes
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "insurance_cover_notes_update" ON public.insurance_cover_notes
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Sales cancellation reasons
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_cancellation_reasons (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL UNIQUE REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  reason_code text,
  narration   text,
  approved_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  company_id  text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_cancellation_reasons ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cancellation_company ON public.sales_cancellation_reasons (company_id);

CREATE POLICY "cancellations_select" ON public.sales_cancellation_reasons
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "cancellations_insert" ON public.sales_cancellation_reasons
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

CREATE POLICY "cancellations_update" ON public.sales_cancellation_reasons
  FOR UPDATE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Sales documents (file attachments)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid        REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  customer_id  uuid        REFERENCES public.customers(id)    ON DELETE SET NULL,
  doc_type     text        NOT NULL,  -- e.g. 'ic_copy','booking_form','loan_approval'
  storage_path text        NOT NULL,
  uploaded_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id   text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sales_docs_order    ON public.sales_documents (order_id)   WHERE order_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_docs_customer ON public.sales_documents (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_docs_company  ON public.sales_documents (company_id);

CREATE POLICY "sales_documents_select" ON public.sales_documents
  FOR SELECT USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "sales_documents_insert" ON public.sales_documents
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "sales_documents_delete" ON public.sales_documents
  FOR DELETE USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','director','general_manager','manager'))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Trigger: auto-record status changes on sales_orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_sales_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    INSERT INTO public.sales_order_status_history
      (order_id, from_status, to_status, changed_by, company_id)
    VALUES
      (NEW.id, OLD.order_status, NEW.order_status, auth.uid(), NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_order_status_history ON public.sales_orders;
CREATE TRIGGER trg_sales_order_status_history
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_sales_order_status_change();
