-- Fix: replace partial unique indexes on sales_orders.order_no with a full
-- unique index so that PostgREST ON CONFLICT (order_no, company_id) works.
-- PostgreSQL allows multiple NULLs in a non-partial UNIQUE index.

DROP INDEX IF EXISTS public.uq_sales_order_no_company;       -- Phase 0 partial (is_deleted=false)
DROP INDEX IF EXISTS public.uq_sales_orders_order_no_company; -- Phase 1 partial (order_no IS NOT NULL)

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_order_no_company
  ON public.sales_orders (order_no, company_id);
