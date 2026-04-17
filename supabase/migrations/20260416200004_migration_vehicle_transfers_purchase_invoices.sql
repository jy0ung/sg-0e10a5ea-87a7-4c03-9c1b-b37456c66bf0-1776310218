-- ============================================================
-- vehicle_transfers — inter-branch chassis movement tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vehicle_transfers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  running_no  TEXT        NOT NULL,
  from_branch TEXT        NOT NULL,
  to_branch   TEXT        NOT NULL,
  chassis_no  TEXT        NOT NULL,
  model       TEXT        NOT NULL,
  colour      TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_transit', 'arrived', 'cancelled')),
  remark      TEXT,
  arrived_at  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_transfers_company_members" ON public.vehicle_transfers;

CREATE POLICY "vehicle_transfers_company_members" ON public.vehicle_transfers
  FOR ALL USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- purchase_invoices — CBU procurement invoices from suppliers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    TEXT         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_no    TEXT         NOT NULL,
  supplier      TEXT         NOT NULL,
  chassis_no    TEXT         NOT NULL,
  model         TEXT         NOT NULL,
  invoice_date  DATE         NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'received', 'cancelled')),
  received_date DATE,
  remark        TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_invoices_company_members" ON public.purchase_invoices;

CREATE POLICY "purchase_invoices_company_members" ON public.purchase_invoices
  FOR ALL USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
