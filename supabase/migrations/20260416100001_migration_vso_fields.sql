-- Phase 1A: Add VSO / financing fields to sales_orders
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS vso_no            text,
  ADD COLUMN IF NOT EXISTS deposit_amount    numeric(15,2),
  ADD COLUMN IF NOT EXISTS bank_loan_amount  numeric(15,2),
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS finance_company   text,
  ADD COLUMN IF NOT EXISTS insurance_company text,
  ADD COLUMN IF NOT EXISTS plate_no          text;

CREATE INDEX IF NOT EXISTS idx_sales_orders_vso_no    ON public.sales_orders (vso_no);
CREATE INDEX IF NOT EXISTS idx_sales_orders_plate_no  ON public.sales_orders (plate_no);
