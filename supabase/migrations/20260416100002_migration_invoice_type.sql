-- Phase 1B: Add invoice_type to invoices + customer info denormalisation
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type  text NOT NULL DEFAULT 'customer_sales'
    CHECK (invoice_type IN ('customer_sales', 'dealer_sales', 'purchase')),
  ADD COLUMN IF NOT EXISTS customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS notes         text;

CREATE INDEX IF NOT EXISTS idx_invoices_type        ON public.invoices (invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices (customer_id);
